/**
 * Import de issues por CSV (#101) — preview + commit.
 *
 * Duas fases, como no Linear: `previewImport` só LÊ (parseia o CSV, detecta as colunas,
 * propõe o mapeamento e resolve os valores contra os catálogos) e devolve uma amostra
 * com os avisos; `commitImport` recebe o mapeamento confirmado e cria/atualiza as issues.
 *
 * Idempotência: cada linha com id externo grava `issue_import(source, external_id)`. Um
 * re-import do mesmo arquivo ATUALIZA a issue (título/status/prioridade) em vez de
 * duplicá-la — é o que torna seguro reimportar depois de corrigir o CSV.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   appUser,
   importJob,
   issueImport,
   label as labelT,
   priority as priorityT,
   status as statusT,
   team as teamT,
} from '@/db/schema';
import { ApiError } from './errors';
import { createIssue, publishAutoSubscriptions, updateIssue } from './issues';
import { publish, publishInternal } from './events';
import { assertCanWriteTeam } from './scope';
import { isAdmin, withRequestCache } from './auth';
import { getOrCreateUser } from './users';

export type ImportSource = 'csv' | 'linear' | 'jira';

export const IMPORT_SOURCES: readonly ImportSource[] = ['csv', 'linear', 'jira'];

export const IMPORT_LIMITS = {
   maxBytes: 10_000_000,
   maxRows: 10_000,
   maxColumns: 64,
   maxCellChars: 10_000,
} as const;

/** Tamanho de `issue_import.external_id` (varchar). */
const IMPORT_EXTERNAL_ID_MAX = 128;

/** Margem para JSON/multipart e metadados; o CSV em si continua limitado por `maxBytes`. */
export const IMPORT_REQUEST_OVERHEAD_BYTES = 256_000;

export function validateImportRequestSize(req: Request): void {
   const contentLength = Number(req.headers.get('content-length'));
   if (
      Number.isFinite(contentLength) &&
      contentLength > IMPORT_LIMITS.maxBytes + IMPORT_REQUEST_OVERHEAD_BYTES
   ) {
      throw new ApiError(413, 'Requisição de importação excede o limite de tamanho permitido');
   }
}

/** Campos do Circle que uma coluna do CSV pode alimentar. */
export type ImportField =
   | 'externalId'
   | 'title'
   | 'description'
   | 'status'
   | 'priority'
   | 'assignee'
   | 'labels'
   | 'estimate'
   | 'dueDate'
   | 'parent';

export const IMPORT_FIELDS: readonly ImportField[] = [
   'externalId',
   'title',
   'description',
   'status',
   'priority',
   'assignee',
   'labels',
   'estimate',
   'dueDate',
   'parent',
];

/** Campo do Circle → nome da coluna do CSV. `null`/ausente = não importar o campo. */
export type ImportMapping = Partial<Record<ImportField, string | null>>;

/* --------------------------------- CSV ----------------------------------- */

/**
 * Parser CSV mínimo (RFC 4180): aspas duplas, `""` escapado, vírgula e quebra de linha
 * dentro do campo, CRLF. Sem dependência nova — o formato é simples e fechado.
 */
export function parseCsv(text: string): string[][] {
   const rows: string[][] = [];
   let row: string[] = [];
   let field = '';
   let quoted = false;
   // BOM do Excel quebraria o nome da 1ª coluna.
   const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

   for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
         if (c === '"') {
            if (src[i + 1] === '"') {
               field += '"';
               i++;
            } else quoted = false;
         } else field += c;
         continue;
      }
      if (c === '"') quoted = true;
      else if (c === ',') {
         row.push(field);
         field = '';
      } else if (c === '\n' || c === '\r') {
         if (c === '\r' && src[i + 1] === '\n') i++;
         row.push(field);
         rows.push(row);
         row = [];
         field = '';
      } else field += c;
   }
   // Aspas abertas até o fim: o resto do arquivo virou UMA célula (linhas engolidas em
   // silêncio). Recusa em vez de importar dado corrompido.
   if (quoted) throw new ApiError(400, 'CSV malformado: aspas sem fechamento');
   if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
   }
   // Descarta linhas totalmente vazias (rodapé do Excel).
   return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Linhas do CSV como objetos `{ coluna: valor }`, com o cabeçalho da 1ª linha. */
export function csvToObjects(text: string): { columns: string[]; rows: Record<string, string>[] } {
   const raw = parseCsv(text);
   if (raw.length === 0) return { columns: [], rows: [] };
   const columns = raw[0].map((c) => c.trim());
   const rows = raw.slice(1).map((cells) => {
      const o: Record<string, string> = {};
      columns.forEach((col, i) => {
         o[col] = (cells[i] ?? '').trim();
      });
      return o;
   });
   return { columns, rows };
}

export function validateImportCsv(text: string, mapping?: ImportMapping): void {
   if (Buffer.byteLength(text, 'utf8') > IMPORT_LIMITS.maxBytes)
      throw new ApiError(413, 'CSV excede o limite de tamanho permitido');

   const raw = parseCsv(text);
   if (raw.length === 0) return;
   const columns = raw[0].map((column) => column.trim());
   if (columns.length > IMPORT_LIMITS.maxColumns)
      throw new ApiError(413, `CSV excede o limite de ${IMPORT_LIMITS.maxColumns} colunas`);
   if (raw.length - 1 > IMPORT_LIMITS.maxRows)
      throw new ApiError(413, `CSV excede o limite de ${IMPORT_LIMITS.maxRows} linhas`);

   for (const row of raw) {
      if (row.length > IMPORT_LIMITS.maxColumns)
         throw new ApiError(413, `CSV excede o limite de ${IMPORT_LIMITS.maxColumns} colunas`);
      if (row.some((cell) => cell.length > IMPORT_LIMITS.maxCellChars))
         throw new ApiError(413, 'CSV contém uma célula acima do limite permitido');
   }

   const externalColumn = mapping?.externalId;
   if (!externalColumn) return;
   const externalIndex = columns.indexOf(externalColumn.trim());
   if (externalIndex < 0) return;
   const seen = new Set<string>();
   for (const row of raw.slice(1)) {
      const externalId = row[externalIndex]?.trim();
      if (!externalId) continue;
      // `issue_import.external_id` é varchar(128): acima disso a issue nascia sem rastro e
      // o re-import a duplicava. Recusa o arquivo antes de escrever qualquer coisa.
      if (externalId.length > IMPORT_EXTERNAL_ID_MAX)
         throw new ApiError(
            400,
            `externalId acima de ${IMPORT_EXTERNAL_ID_MAX} caracteres: '${externalId.slice(0, 32)}…'`
         );
      if (seen.has(externalId))
         throw new ApiError(400, `externalId duplicado no CSV: '${externalId}'`);
      seen.add(externalId);
   }
}

/* ------------------------------- Presets --------------------------------- */

/**
 * Aliases de coluna por origem (case-insensitive). O primeiro alias que existir no
 * cabeçalho vence. `csv` é o preset genérico e serve de fallback para os outros.
 */
const PRESETS: Record<ImportSource, Partial<Record<ImportField, string[]>>> = {
   csv: {
      externalId: ['id', 'identifier', 'key', 'external id'],
      title: ['title', 'summary', 'name'],
      description: ['description', 'body', 'details'],
      status: ['status', 'state'],
      priority: ['priority'],
      assignee: ['assignee', 'owner'],
      labels: ['labels', 'label', 'tags'],
      estimate: ['estimate', 'points', 'story points'],
      dueDate: ['due date', 'duedate', 'due'],
      parent: ['parent', 'parent id', 'parent issue'],
   },
   linear: {
      externalId: ['id'],
      title: ['title'],
      description: ['description'],
      status: ['status'],
      priority: ['priority'],
      assignee: ['assignee'],
      labels: ['labels'],
      estimate: ['estimate'],
      dueDate: ['due date'],
      parent: ['parent issue'],
   },
   jira: {
      externalId: ['issue key', 'key'],
      title: ['summary'],
      description: ['description'],
      status: ['status'],
      priority: ['priority'],
      assignee: ['assignee'],
      labels: ['labels'],
      estimate: ['story points', 'story point estimate', 'custom field (story points)'],
      dueDate: ['due date'],
      parent: ['parent', 'parent id'],
   },
};

/** Mapeamento proposto: casa os aliases da origem (e do preset genérico) com o cabeçalho. */
export function suggestMapping(source: ImportSource, columns: string[]): ImportMapping {
   const byLower = new Map(columns.map((c) => [c.toLowerCase(), c]));
   const preset = PRESETS[source];
   const generic = PRESETS.csv;
   const mapping: ImportMapping = {};
   for (const field of IMPORT_FIELDS) {
      const aliases = [...(preset[field] ?? []), ...(generic[field] ?? [])];
      const hit = aliases.map((a) => byLower.get(a)).find(Boolean);
      mapping[field] = hit ?? null;
   }
   return mapping;
}

/* ----------------------- Resolução contra os catálogos --------------------- */

interface Catalogs {
   statusByName: Map<string, string>;
   priorityByName: Map<string, string>;
   labelByName: Map<string, string>;
   userByKey: Map<string, string>;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Sinônimos de prioridade das origens externas. O Jira usa Highest/Lowest e o Linear
 * "No priority"; sem isso toda linha viraria "sem match".
 */
const PRIORITY_ALIASES: Record<string, string> = {
   'highest': 'urgent',
   'critical': 'urgent',
   'blocker': 'urgent',
   'lowest': 'low',
   'trivial': 'low',
   'minor': 'low',
   'major': 'high',
   'none': 'no-priority',
   'no priority': 'no-priority',
};

/** Sinônimos de status das origens externas para os ids do catálogo. */
const STATUS_ALIASES: Record<string, string> = {
   'to do': 'to-do',
   'todo': 'to-do',
   'open': 'to-do',
   'in progress': 'in-progress',
   'in review': 'technical-review',
   'code review': 'technical-review',
   'done': 'done',
   'closed': 'done',
   'resolved': 'done',
   'cancelled': 'canceled',
};

async function loadCatalogs(db: Db): Promise<Catalogs> {
   const [statuses, priorities, labels, users] = await Promise.all([
      db.select().from(statusT),
      db.select().from(priorityT),
      db.select().from(labelT),
      db.select().from(appUser),
   ]);
   const statusByName = new Map<string, string>();
   for (const s of statuses) {
      statusByName.set(norm(s.name), s.id);
      statusByName.set(norm(s.id), s.id);
   }
   const priorityByName = new Map<string, string>();
   for (const p of priorities) {
      priorityByName.set(norm(p.name), p.id);
      priorityByName.set(norm(p.id), p.id);
   }
   const labelByName = new Map<string, string>();
   for (const l of labels) {
      labelByName.set(norm(l.name), l.id);
      labelByName.set(norm(l.id), l.id);
   }
   const userByKey = new Map<string, string>();
   for (const u of users) {
      userByKey.set(norm(u.email), u.id);
      userByKey.set(norm(u.name), u.id);
      userByKey.set(norm(u.slug), u.id);
   }
   return { statusByName, priorityByName, labelByName, userByKey };
}

function resolveStatus(cat: Catalogs, raw: string): string | null {
   const key = norm(raw);
   return cat.statusByName.get(key) ?? cat.statusByName.get(STATUS_ALIASES[key] ?? '') ?? null;
}

function resolvePriority(cat: Catalogs, raw: string): string | null {
   const key = norm(raw);
   return (
      cat.priorityByName.get(key) ?? cat.priorityByName.get(PRIORITY_ALIASES[key] ?? '') ?? null
   );
}

/** Data ISO (YYYY-MM-DD) a partir dos formatos comuns de export; null se não der. */
function parseDate(raw: string): string | null {
   const s = raw.trim();
   if (!s) return null;
   if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
   const iso = /^(\d{4}-\d{2}-\d{2})T/.exec(s);
   if (iso) return iso[1];
   const pad = (n: number) => String(n).padStart(2, '0');
   // dd/MM/yyyy (pt-BR): o Date leria como MM/dd americano — 03/04 virava 4 de março.
   const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(s);
   if (br) {
      const [day, month, year] = [Number(br[1]), Number(br[2]), Number(br[3])];
      const probe = new Date(Date.UTC(year, month - 1, day));
      if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
      return `${year}-${pad(month)}-${pad(day)}`;
   }
   // dd/MMM/yy do Jira e afins: delega ao Date só quando reconhecível.
   const d = new Date(s);
   if (Number.isNaN(d.getTime())) return null;
   // O Date lê a string no fuso LOCAL: o dia é o dos componentes locais. `toISOString()`
   // convertia para UTC e jogava "23h" para o dia seguinte (ou anterior, a leste de UTC).
   return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Labels de uma célula: separadas por vírgula, ponto-e-vírgula ou barra vertical. */
function splitLabels(raw: string): string[] {
   return raw
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
}

/* -------------------------------- Preview -------------------------------- */

export interface ImportPreviewRow {
   externalId: string | null;
   title: string;
   /** Valor cru do CSV (o que o usuário vê) + o id resolvido no catálogo (null = sem match). */
   statusRaw: string | null;
   statusId: string | null;
   priorityRaw: string | null;
   priorityId: string | null;
   assigneeRaw: string | null;
   assigneeId: string | null;
   labels: { name: string; labelId: string | null }[];
   dueDate: string | null;
   estimate: number | null;
   parentExternalId: string | null;
   /** Já importada antes (mesmo `source`+`externalId`) → o commit ATUALIZA. */
   existing: boolean;
   /** Problemas da linha (título vazio, status sem match, …). */
   warnings: string[];
}

export interface ImportPreviewDto {
   source: ImportSource;
   columns: string[];
   mapping: ImportMapping;
   totalRows: number;
   sample: ImportPreviewRow[];
   /** Avisos do arquivo inteiro (coluna obrigatória ausente, linhas sem título, …). */
   warnings: string[];
}

export const PREVIEW_SAMPLE_SIZE = 20;

/**
 * Desfaz o `'` anti-fórmula que o export CSV (`app/api/v1/issues/export`) põe na frente
 * de `= + - @`/tab/CR/LF. Só tira UM `'` e só antes desses caracteres: `'texto` comum
 * fica intacto, e `''=x` (valor original `'=x`) volta como `'=x`.
 */
function decodeFormulaGuard(s: string): string {
   return /^'+[=+\-@\t\r\n]/.test(s) ? s.slice(1).trim() : s;
}

function cell(row: Record<string, string>, column: string | null | undefined): string {
   if (!column) return '';
   return decodeFormulaGuard((row[column] ?? '').trim());
}

function mapRow(
   cat: Catalogs,
   mapping: ImportMapping,
   row: Record<string, string>,
   importedIds: Set<string>
): ImportPreviewRow {
   const warnings: string[] = [];
   const title = cell(row, mapping.title);
   if (!title) warnings.push('Linha sem título — será ignorada');

   const statusRaw = cell(row, mapping.status) || null;
   const statusId = statusRaw ? resolveStatus(cat, statusRaw) : null;
   if (statusRaw && !statusId) warnings.push(`Status "${statusRaw}" sem correspondência`);

   const priorityRaw = cell(row, mapping.priority) || null;
   const priorityId = priorityRaw ? resolvePriority(cat, priorityRaw) : null;
   if (priorityRaw && !priorityId) warnings.push(`Prioridade "${priorityRaw}" sem correspondência`);

   const assigneeRaw = cell(row, mapping.assignee) || null;
   const assigneeId = assigneeRaw ? (cat.userByKey.get(norm(assigneeRaw)) ?? null) : null;
   if (assigneeRaw && !assigneeId) warnings.push(`Responsável "${assigneeRaw}" não é membro`);

   const labels = splitLabels(cell(row, mapping.labels)).map((name) => ({
      name,
      labelId: cat.labelByName.get(norm(name)) ?? null,
   }));

   const dueRaw = cell(row, mapping.dueDate);
   const dueDate = dueRaw ? parseDate(dueRaw) : null;
   if (dueRaw && !dueDate) warnings.push(`Data "${dueRaw}" não reconhecida`);

   const estRaw = cell(row, mapping.estimate);
   const estNum = estRaw ? Number(estRaw.replace(',', '.')) : NaN;
   const estimate = Number.isFinite(estNum) ? Math.round(estNum) : null;

   const externalId = cell(row, mapping.externalId) || null;
   return {
      externalId,
      title,
      statusRaw,
      statusId,
      priorityRaw,
      priorityId,
      assigneeRaw,
      assigneeId,
      labels,
      dueDate,
      estimate,
      parentExternalId: cell(row, mapping.parent) || null,
      existing: Boolean(externalId && importedIds.has(externalId)),
      warnings,
   };
}

/**
 * Ids externos desta origem já importados NO TIME (para marcar a linha como atualização).
 * O rastro é por time: o mesmo arquivo em outro time cria issues lá, não altera as daqui.
 */
async function alreadyImported(
   db: Db,
   source: ImportSource,
   teamId: string,
   externalIds: string[]
): Promise<Map<string, string>> {
   if (externalIds.length === 0) return new Map();
   const rows = await db
      .select({ externalId: issueImport.externalId, issueId: issueImport.issueId })
      .from(issueImport)
      .where(
         and(
            eq(issueImport.source, source),
            eq(issueImport.teamId, teamId),
            inArray(issueImport.externalId, [...new Set(externalIds)])
         )!
      );
   return new Map(rows.map((r) => [r.externalId, r.issueId]));
}

export interface PreviewImportInput {
   source: ImportSource;
   csv: string;
   /** Mapeamento explícito (o wizard reenvia o ajustado); omitido = proposto pelo preset. */
   mapping?: ImportMapping;
   /** Time de destino: marca como "existente" o que já foi importado NELE. Sem time, nada é. */
   teamId?: string;
}

/** Analisa o CSV sem escrever nada: colunas, mapeamento proposto, amostra e avisos. */
export async function previewImport(db: Db, input: PreviewImportInput): Promise<ImportPreviewDto> {
   if (!IMPORT_SOURCES.includes(input.source)) throw new ApiError(400, 'source inválido');
   validateImportCsv(input.csv);
   const { columns, rows } = csvToObjects(input.csv);
   if (columns.length === 0) throw new ApiError(400, 'CSV vazio ou sem cabeçalho');

   const mapping = { ...suggestMapping(input.source, columns), ...(input.mapping ?? {}) };
   validateImportCsv(input.csv, mapping);
   const warnings: string[] = [];
   if (!mapping.title) warnings.push('Nenhuma coluna mapeada para o título — obrigatório');
   if (!mapping.externalId)
      warnings.push('Sem coluna de id externo: o re-import criará issues duplicadas');

   const cat = await loadCatalogs(db);
   const externalIds = mapping.externalId
      ? rows.map((r) => cell(r, mapping.externalId)).filter(Boolean)
      : [];
   const importedIds = new Set(
      input.teamId
         ? (await alreadyImported(db, input.source, input.teamId, externalIds)).keys()
         : []
   );

   const sample = rows
      .slice(0, PREVIEW_SAMPLE_SIZE)
      .map((row) => mapRow(cat, mapping, row, importedIds));
   const untitled = rows.filter((r) => !cell(r, mapping.title)).length;
   if (untitled > 0) warnings.push(`${untitled} linha(s) sem título serão ignoradas`);

   return { source: input.source, columns, mapping, totalRows: rows.length, sample, warnings };
}

/* --------------------------------- Commit -------------------------------- */

export interface CommitImportInput {
   source: ImportSource;
   csv: string;
   mapping: ImportMapping;
   /** Time de destino das issues criadas (obrigatório — o CSV externo não o conhece). */
   teamId: string;
   /** Labels sem correspondência: criar no catálogo (true) ou ignorar (false, default). */
   createMissingLabels?: boolean;
}

export interface ImportResultDto {
   created: number;
   updated: number;
   skipped: number;
   /** Erros por linha (índice 1-based no corpo do CSV), sem abortar o lote. */
   errors: { row: number; message: string }[];
   issueIds: string[];
}

/** Cor default de label criada no import (token do catálogo, não hex). */
const IMPORTED_LABEL_COLOR = 'gray';

function slugifyLabel(name: string): string {
   return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
}

/**
 * Cria as issues do CSV no time informado. Duas passadas: a 1ª cria/atualiza tudo
 * (guardando `externalId → issueId`), a 2ª liga os pais — assim uma filha que aparece
 * antes do pai no arquivo continua sendo ligada.
 */
/** Progresso do lote, reportado linha a linha ao job (#10). */
export interface ImportProgress {
   processed: number;
   created: number;
   updated: number;
   skipped: number;
}

export interface CommitImportOptions {
   /** Chamado após cada linha (o job decide quando gravar). */
   onProgress?: (p: ImportProgress) => void | Promise<void>;
}

/**
 * Validações síncronas do import (antes de criar o job): origem, mapeamento, limites e
 * duplicatas do CSV (#24), time existente e escrita permitida. Devolve as linhas.
 */
async function prepareImport(
   db: Db,
   input: CommitImportInput,
   actorEmail: string
): Promise<{ mapping: ImportMapping; rows: Record<string, string>[] }> {
   if (!IMPORT_SOURCES.includes(input.source)) throw new ApiError(400, 'source inválido');
   const mapping = input.mapping ?? {};
   if (!mapping.title) throw new ApiError(400, 'mapping.title é obrigatório');
   validateImportCsv(input.csv, mapping);
   const { columns, rows } = csvToObjects(input.csv);
   // Coluna mapeada que não existe no cabeçalho lia '' em toda linha: o título vazio
   // ignorava o arquivo inteiro e o job terminava "concluído" sem criar nada.
   for (const [field, column] of Object.entries(mapping)) {
      if (column && !columns.includes(column))
         throw new ApiError(400, `mapping.${field}: coluna '${column}' não existe no CSV`);
   }

   const teamRows = await db.select().from(teamT).where(eq(teamT.id, input.teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(400, `Team '${input.teamId}' não existe`);
   // O time de destino vem do corpo: sem escopo, o import escrevia em qualquer time.
   await assertCanWriteTeam(db, actorEmail, input.teamId);
   // Criar label no catálogo é só admin (`POST /labels`); o import não pode ser o atalho.
   if (input.createMissingLabels && !(await isAdmin(actorEmail, db)))
      throw new ApiError(403, 'Apenas admin pode criar labels pelo import');

   return { mapping, rows };
}

export async function commitImport(
   db: Db,
   input: CommitImportInput,
   actorEmail: string,
   opts: CommitImportOptions = {}
): Promise<ImportResultDto> {
   const { mapping, rows } = await prepareImport(db, input, actorEmail);
   const actor = await getOrCreateUser(db, actorEmail);
   /** Quem foi auto-assinado → uma issue dele, para UM aviso por usuário no fim (#22). */
   const subscribedBy = new Map<string, string>();
   const cat = await loadCatalogs(db);
   const existingByExternal = await alreadyImported(
      db,
      input.source,
      input.teamId,
      mapping.externalId ? rows.map((r) => cell(r, mapping.externalId)).filter(Boolean) : []
   );

   const result: ImportResultDto = { created: 0, updated: 0, skipped: 0, errors: [], issueIds: [] };
   /** externalId → issueId desta rodada (+ os já existentes), para ligar os pais. */
   const idByExternal = new Map(existingByExternal);
   const parentLinks: { childId: string; parentExternalId: string }[] = [];
   const now = new Date();

   for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      if (i > 0) await opts.onProgress?.(progressOf(i));
      try {
         const mapped = mapRow(cat, mapping, raw, new Set());
         if (!mapped.title) {
            result.skipped++;
            continue;
         }

         // Labels: usa as do catálogo e, se pedido, cria as que faltam (id = slug).
         const labelIds: string[] = [];
         for (const l of mapped.labels) {
            if (l.labelId) {
               labelIds.push(l.labelId);
               continue;
            }
            if (!input.createMissingLabels) continue;
            const id = slugifyLabel(l.name);
            if (!id) continue;
            const novas = await db
               .insert(labelT)
               .values({ id, name: l.name, color: IMPORTED_LABEL_COLOR, groupId: null })
               .onConflictDoNothing()
               .returning({ id: labelT.id });
            // Label criada pelo import entra no catálogo dos outros clientes (#12).
            if (novas.length > 0) publish({ entity: 'label', action: 'created', id });
            cat.labelByName.set(norm(l.name), id);
            labelIds.push(id);
         }

         const existingId = mapped.externalId
            ? existingByExternal.get(mapped.externalId)
            : undefined;
         let issueId: string;
         if (existingId) {
            // Re-import: ATUALIZA em vez de duplicar (idempotência do issue_import).
            await updateIssue(
               db,
               existingId,
               {
                  title: mapped.title,
                  ...(mapped.statusId ? { statusId: mapped.statusId } : {}),
                  ...(mapped.priorityId ? { priorityId: mapped.priorityId } : {}),
                  ...(mapped.assigneeId ? { assigneeId: mapped.assigneeId } : {}),
                  ...(mapped.dueDate ? { dueDate: mapped.dueDate } : {}),
                  ...(mapped.estimate != null ? { estimate: mapped.estimate } : {}),
               },
               actorEmail,
               { silent: true, bulk: true }
            );
            issueId = existingId;
            result.updated++;
         } else {
            const created = await createIssue(
               db,
               {
                  teamId: input.teamId,
                  title: mapped.title,
                  statusId: mapped.statusId ?? undefined,
                  priorityId: mapped.priorityId ?? 'no-priority',
                  assigneeId: mapped.assigneeId,
                  labelIds,
                  dueDate: mapped.dueDate,
                  estimate: mapped.estimate,
                  description: cell(raw, mapping.description) || null,
               },
               actorEmail,
               { silent: true, bulk: true }
            );
            issueId = created.id;
            result.created++;
            subscribedBy.set(actor.id, issueId);
         }
         if (mapped.assigneeId) subscribedBy.set(mapped.assigneeId, issueId);
         result.issueIds.push(issueId);

         if (mapped.externalId) {
            idByExternal.set(mapped.externalId, issueId);
            await db
               .insert(issueImport)
               .values({
                  source: input.source,
                  externalId: mapped.externalId,
                  teamId: input.teamId,
                  issueId,
                  createdAt: now,
                  updatedAt: now,
               })
               .onConflictDoUpdate({
                  target: [issueImport.source, issueImport.teamId, issueImport.externalId],
                  set: { issueId, updatedAt: now },
               });
         }
         if (mapped.parentExternalId) {
            parentLinks.push({ childId: issueId, parentExternalId: mapped.parentExternalId });
         }
      } catch (e) {
         result.errors.push({ row: i + 1, message: (e as Error).message });
      }
   }

   // 2ª passada: sub-issues por coluna `parent` (o pai pode vir depois no arquivo).
   for (const link of parentLinks) {
      const parentId = idByExternal.get(link.parentExternalId);
      if (!parentId || parentId === link.childId) continue;
      try {
         await updateIssue(db, link.childId, { parentId }, actorEmail, {
            silent: true,
            bulk: true,
         });
      } catch (e) {
         result.errors.push({ row: 0, message: `parent: ${(e as Error).message}` });
      }
   }

   await opts.onProgress?.(progressOf(rows.length));

   // Modo silencioso (#7): em vez de um evento por linha (cada um vira um GET em cada
   // cliente, e o `pg_notify` disputa o pool), UM evento coarse sem id no fim — o
   // cliente re-hidrata a lista de issues uma vez. Só SSE (#21): o webhook já saiu por
   // issue, e um `issue.updated` sem id era entrega vazia para o assinante externo.
   if (result.created + result.updated > 0) {
      publishInternal({ entity: 'issue', action: 'updated', teamId: input.teamId, actorEmail });
      // Auto-assinaturas (#22): um aviso por usuário, não por linha.
      for (const [uid, issueId] of subscribedBy)
         publishAutoSubscriptions(issueId, [uid], actorEmail);
   }
   return result;

   function progressOf(processed: number): ImportProgress {
      return {
         processed,
         created: result.created,
         updated: result.updated,
         skipped: result.skipped,
      };
   }
}

/* ------------------------------ Job (#10) -------------------------------- */

export type ImportJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ImportJobDto {
   id: string;
   teamId: string;
   source: string;
   status: ImportJobStatus;
   total: number;
   processed: number;
   created: number;
   updated: number;
   skipped: number;
   errors: { row: number; message: string }[];
   error: string | null;
   createdAt: string;
   finishedAt: string | null;
}

/** Job `running` sem batimento há este tempo foi interrompido (pod reiniciou). */
export const IMPORT_JOB_STALE_MS = 5 * 60_000;
/** Intervalo mínimo entre gravações de progresso. */
const PROGRESS_WRITE_MS = 500;
/** Teto de erros por linha guardados no job. */
const MAX_JOB_ERRORS = 200;

/**
 * Cria o job e dispara o processamento em background (#10). A validação é SÍNCRONA (400
 * na hora, sem job); o resto roda fora da request. `finished` resolve quando o job
 * termina (sucesso ou falha) — a rota ignora, os testes aguardam.
 */
export async function startImportJob(
   db: Db,
   input: CommitImportInput,
   actorEmail: string
): Promise<{ jobId: string; finished: Promise<void> }> {
   const { rows } = await prepareImport(db, input, actorEmail);
   const owner = await getOrCreateUser(db, actorEmail);
   const jobId = randomUUID();
   await db.insert(importJob).values({
      id: jobId,
      ownerId: owner.id,
      teamId: input.teamId,
      source: input.source,
      status: 'queued',
      total: rows.length,
   });
   // Fora do cache da request (que morre com a resposta): o job tem o seu.
   const finished = withRequestCache(() => runImportJob(db, jobId, owner.id, input, actorEmail));
   return { jobId, finished };
}

async function runImportJob(
   db: Db,
   jobId: string,
   ownerId: string,
   input: CommitImportInput,
   actorEmail: string
): Promise<void> {
   try {
      await db
         .update(importJob)
         .set({ status: 'running', updatedAt: new Date() })
         .where(eq(importJob.id, jobId));
      let lastWrite = 0;
      const result = await commitImport(db, input, actorEmail, {
         onProgress: async (p) => {
            const now = Date.now();
            if (now - lastWrite < PROGRESS_WRITE_MS) return;
            lastWrite = now;
            await db
               .update(importJob)
               .set({ ...p, updatedAt: new Date() })
               .where(eq(importJob.id, jobId));
         },
      });
      const now = new Date();
      await db
         .update(importJob)
         .set({
            status: 'succeeded',
            // Só erros de LINHA contam: o de vínculo de pai (`row: 0`) é da 2ª passada, e
            // somá-lo deixava `processed` > `total` (barra acima de 100%).
            processed:
               result.created +
               result.updated +
               result.skipped +
               result.errors.filter((e) => e.row > 0).length,
            created: result.created,
            updated: result.updated,
            skipped: result.skipped,
            errors: result.errors.slice(0, MAX_JOB_ERRORS),
            updatedAt: now,
            finishedAt: now,
         })
         .where(eq(importJob.id, jobId));
   } catch (e) {
      const now = new Date();
      await db
         .update(importJob)
         .set({
            status: 'failed',
            error: (e as Error).message || 'Falha no import',
            updatedAt: now,
            finishedAt: now,
         })
         .where(eq(importJob.id, jobId))
         .catch(() => {});
   } finally {
      // Aviso ao DONO (só SSE): a tela de import relê o job na hora.
      publishInternal({
         entity: 'import',
         action: 'updated',
         id: jobId,
         recipientId: ownerId,
         teamId: input.teamId,
      });
   }
}

/** Job do DONO (outro usuário → null, vira 404 na rota). */
export async function getImportJob(
   db: Db,
   id: string,
   ownerId: string
): Promise<ImportJobDto | null> {
   const [row] = await db
      .select()
      .from(importJob)
      .where(and(eq(importJob.id, id), eq(importJob.ownerId, ownerId))!)
      .limit(1);
   if (!row) return null;
   const stale =
      (row.status === 'running' || row.status === 'queued') &&
      Date.now() - row.updatedAt.getTime() > IMPORT_JOB_STALE_MS;
   return {
      id: row.id,
      teamId: row.teamId,
      source: row.source,
      status: stale ? 'failed' : (row.status as ImportJobStatus),
      total: row.total,
      processed: row.processed,
      created: row.created,
      updated: row.updated,
      skipped: row.skipped,
      errors: (row.errors as ImportJobDto['errors']) ?? [],
      error: stale ? 'Import interrompido (o servidor reiniciou); rode de novo' : row.error,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
   };
}

/**
 * Job de import ATIVO do dono (queued/running com batimento recente), do mais novo para
 * o mais velho. É o que devolve a tela de import ao progresso depois de sair dela (ad#5).
 */
export async function getActiveImportJob(db: Db, ownerId: string): Promise<ImportJobDto | null> {
   const rows = await db
      .select({ id: importJob.id })
      .from(importJob)
      .where(
         and(
            eq(importJob.ownerId, ownerId),
            inArray(importJob.status, ['queued', 'running']),
            gt(importJob.updatedAt, new Date(Date.now() - IMPORT_JOB_STALE_MS))
         )!
      )
      .orderBy(desc(importJob.createdAt))
      .limit(1);
   if (rows.length === 0) return null;
   return getImportJob(db, rows[0].id, ownerId);
}
