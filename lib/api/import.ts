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
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@/db';
import {
   appUser,
   issueImport,
   label as labelT,
   priority as priorityT,
   status as statusT,
   team as teamT,
} from '@/db/schema';
import { ApiError } from './errors';
import { createIssue, updateIssue } from './issues';

export type ImportSource = 'csv' | 'linear' | 'jira';

export const IMPORT_SOURCES: readonly ImportSource[] = ['csv', 'linear', 'jira'];

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
   // dd/MMM/yy do Jira e dd/MM/yyyy: delega ao Date só quando reconhecível.
   const d = new Date(s);
   if (Number.isNaN(d.getTime())) return null;
   return d.toISOString().slice(0, 10);
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

function cell(row: Record<string, string>, column: string | null | undefined): string {
   if (!column) return '';
   return (row[column] ?? '').trim();
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

/** Ids externos desta origem já importados (para marcar a linha como atualização). */
async function alreadyImported(
   db: Db,
   source: ImportSource,
   externalIds: string[]
): Promise<Map<string, string>> {
   if (externalIds.length === 0) return new Map();
   const rows = await db
      .select({ externalId: issueImport.externalId, issueId: issueImport.issueId })
      .from(issueImport)
      .where(
         and(
            eq(issueImport.source, source),
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
}

/** Analisa o CSV sem escrever nada: colunas, mapeamento proposto, amostra e avisos. */
export async function previewImport(db: Db, input: PreviewImportInput): Promise<ImportPreviewDto> {
   if (!IMPORT_SOURCES.includes(input.source)) throw new ApiError(400, 'source inválido');
   const { columns, rows } = csvToObjects(input.csv);
   if (columns.length === 0) throw new ApiError(400, 'CSV vazio ou sem cabeçalho');

   const mapping = { ...suggestMapping(input.source, columns), ...(input.mapping ?? {}) };
   const warnings: string[] = [];
   if (!mapping.title) warnings.push('Nenhuma coluna mapeada para o título — obrigatório');
   if (!mapping.externalId)
      warnings.push('Sem coluna de id externo: o re-import criará issues duplicadas');

   const cat = await loadCatalogs(db);
   const externalIds = mapping.externalId
      ? rows.map((r) => cell(r, mapping.externalId)).filter(Boolean)
      : [];
   const importedIds = new Set((await alreadyImported(db, input.source, externalIds)).keys());

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
export async function commitImport(
   db: Db,
   input: CommitImportInput,
   actorEmail: string
): Promise<ImportResultDto> {
   if (!IMPORT_SOURCES.includes(input.source)) throw new ApiError(400, 'source inválido');
   const mapping = input.mapping ?? {};
   if (!mapping.title) throw new ApiError(400, 'mapping.title é obrigatório');

   const teamRows = await db.select().from(teamT).where(eq(teamT.id, input.teamId)).limit(1);
   if (teamRows.length === 0) throw new ApiError(400, `Team '${input.teamId}' não existe`);

   const { rows } = csvToObjects(input.csv);
   const cat = await loadCatalogs(db);
   const existingByExternal = await alreadyImported(
      db,
      input.source,
      mapping.externalId ? rows.map((r) => cell(r, mapping.externalId)).filter(Boolean) : []
   );

   const result: ImportResultDto = { created: 0, updated: 0, skipped: 0, errors: [], issueIds: [] };
   /** externalId → issueId desta rodada (+ os já existentes), para ligar os pais. */
   const idByExternal = new Map(existingByExternal);
   const parentLinks: { childId: string; parentExternalId: string }[] = [];
   const now = new Date();

   for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
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
            await db
               .insert(labelT)
               .values({ id, name: l.name, color: IMPORTED_LABEL_COLOR, groupId: null })
               .onConflictDoNothing();
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
               actorEmail
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
               actorEmail
            );
            issueId = created.id;
            result.created++;
         }
         result.issueIds.push(issueId);

         if (mapped.externalId) {
            idByExternal.set(mapped.externalId, issueId);
            await db
               .insert(issueImport)
               .values({
                  source: input.source,
                  externalId: mapped.externalId,
                  issueId,
                  createdAt: now,
                  updatedAt: now,
               })
               .onConflictDoUpdate({
                  target: [issueImport.source, issueImport.externalId],
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
         await updateIssue(db, link.childId, { parentId }, actorEmail);
      } catch (e) {
         result.errors.push({ row: 0, message: `parent: ${(e as Error).message}` });
      }
   }

   return result;
}
