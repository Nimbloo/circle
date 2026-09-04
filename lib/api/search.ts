import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';

/**
 * Busca full-text do workspace (#99).
 *
 * O índice são as colunas geradas `search_vector` (migration `0044_search_vectors`),
 * com peso A no que identifica a entidade (título/nome/identifier) e B no corpo —
 * `ts_rank_cd` já ranqueia título acima de descrição sem lógica extra aqui.
 *
 * As colunas NÃO estão em `db/schema.ts` de propósito: são `GENERATED ALWAYS AS …
 * STORED`, que o drizzle-kit não sabe emitir; declará-las faria o próximo
 * `db:generate` propor um `ADD COLUMN` duplicado (e sem a expressão). Elas são lidas
 * por SQL cru aqui, que é o único lugar que precisa delas.
 *
 * Comentários continuam fora do índice — a busca por comentário segue no `ilike` de
 * `listIssues` (paridade com o comportamento anterior).
 */

export type SearchEntityType = 'issue' | 'project' | 'initiative' | 'document';

export const SEARCH_TYPES: readonly SearchEntityType[] = [
   'issue',
   'project',
   'initiative',
   'document',
];

export interface SearchItem {
   id: string;
   /** Só issues têm identificador humano (ENG-42). */
   identifier: string | null;
   title: string;
   /** HTML **já escapado**, com `<mark>` como única tag. Seguro para `innerHTML`. */
   snippet: string;
   rank: number;
   teamId: string | null;
   statusId: string | null;
   /** Caminho relativo ao workspace (sem o `/<orgId>` na frente). */
   url: string;
}

export interface SearchGroup {
   type: SearchEntityType;
   items: SearchItem[];
}

export interface SearchResult {
   query: string;
   groups: SearchGroup[];
   /** `true` = o índice não casou nada e o resultado veio do fallback `ilike`. */
   fallback: boolean;
   /** `true` = a ordem das issues foi reordenada por similaridade semântica. */
   semantic: boolean;
}

export interface SearchOptions {
   q: string;
   types?: SearchEntityType[];
   /** Restringe issues, projetos e documentos ao time. Initiatives são de workspace. */
   teamId?: string;
   /** Só se aplica a issues (o status de projeto é outro catálogo). */
   statusId?: string;
   /**
    * Escopo de times do ator (#100). `undefined` = sem restrição (Member/Admin); lista
    * vazia = convidado sem time, que não pode ver nada. Sem isto a busca devolvia o
    * workspace inteiro — e com `teamId` o vazamento era dirigido ao time proibido.
    */
   teamIds?: string[];
   /** Itens por grupo. */
   limit?: number;
}

/**
 * Initiative não pendura em time: para escopo restrito, ela só aparece se agrega algum
 * projeto de time visível — mesma regra da listagem de initiatives (#100).
 */
function initiativeScopeCond(o: SearchOptions): SQL | null {
   if (!o.teamIds) return null;
   if (o.teamIds.length === 0) return sql`false`;
   return sql`EXISTS (SELECT 1 FROM project pr
                       WHERE pr.initiative_id = n.id AND pr.team_id IN (${sql.join(
                          o.teamIds.map((t) => sql`${t}`),
                          sql`, `
                       )}))`;
}

/** Recorte de escopo para uma coluna de time (`i.team_id`, `p.team_id`, `f.team_id`). */
function scopeCond(o: SearchOptions, column: string): SQL | null {
   if (!o.teamIds) return null;
   if (o.teamIds.length === 0) return sql`false`;
   // `= ANY($1)` exigiria o tipo do array explícito no driver; a lista literal é
   // portátil entre pg e PGlite e o conjunto é pequeno (times do usuário).
   return sql`${sql.raw(column)} IN (${sql.join(
      o.teamIds.map((t) => sql`${t}`),
      sql`, `
   )})`;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ── tsquery ─────────────────────────────────────────────────────────

/**
 * Tabela de normalização de diacríticos, IDÊNTICA à da migration `0047_search_unaccent`
 * (que a usa em `translate()` porque `unaccent`/`pg_trgm` não existem no RDS
 * compartilhado). As duas cópias são guardadas por `test/search-accents.test.ts`.
 */
export const ACCENTED = 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
export const UNACCENTED = 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy';

/**
 * Remove diacríticos no lado da aplicação (consulta, fallback e snippet). Vai por
 * caractere e só troca quando a base é UM caractere, então o comprimento da string é
 * preservado — o que deixa o `plainSnippet` mapear posição normalizada → texto original.
 */
export function unaccent(s: string): string {
   let out = '';
   for (const ch of s) {
      const base = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '');
      out += base.length === 1 ? base : ch;
   }
   return out;
}

/** `<coluna sem acento> ILIKE <padrão>` — o mesmo `translate` do índice. */
function ilikeUnaccent(column: string, pattern: string): SQL {
   return sql`translate(coalesce(${sql.raw(column)}, ''), ${ACCENTED}, ${UNACCENTED}) ILIKE ${pattern}`;
}

/** Termos aproveitáveis: letras/dígitos de qualquer alfabeto, minúsculos e sem acento. */
function tokensOf(q: string): string[] {
   return (q.match(/[\p{L}\p{N}]+/gu) ?? [])
      .map((t) => unaccent(t).toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
}

/**
 * Monta o `tsquery`. Com aspas na entrada usa `websearch_to_tsquery` (entende frase
 * exata e `-termo`); senão une os termos com `&` e marca o ÚLTIMO com `:*`, para casar
 * o termo parcial que o usuário ainda está digitando.
 *
 * O texto passado ao `to_tsquery` é montado só a partir de tokens sanitizados
 * (letras/dígitos), então não há como injetar operador de tsquery.
 */
function tsQuery(q: string): SQL | null {
   const tokens = tokensOf(q);
   if (tokens.length === 0) return null;
   // Também sem acento na frase exata: o índice guarda a forma normalizada.
   if (q.includes('"')) return sql`websearch_to_tsquery('simple', ${unaccent(q)})`;
   const text = tokens.map((t, i) => (i === tokens.length - 1 ? `${t}:*` : t)).join(' & ');
   return sql`to_tsquery('simple', ${text})`;
}

// ── snippet ─────────────────────────────────────────────────────────

/**
 * Sentinelas do `ts_headline`: o texto indexado pode conter HTML/markdown, então o
 * destaque NÃO pode sair do banco já como `<mark>`. Marcamos com um literal improvável,
 * escapamos o HTML no JS e só então trocamos as sentinelas pela tag.
 */
const HL_START = '@@CIRCLEHLA@@';
const HL_END = '@@CIRCLEHLZ@@';
const HEADLINE_OPTS = `StartSel=${HL_START},StopSel=${HL_END},MaxFragments=1,MaxWords=24,MinWords=8,ShortWord=2`;

function escapeHtml(s: string): string {
   return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

/** Escapa o texto e converte as sentinelas em `<mark>`. */
function safeSnippet(raw: string | null | undefined): string {
   if (!raw) return '';
   return escapeHtml(raw).split(HL_START).join('<mark>').split(HL_END).join('</mark>');
}

/**
 * Snippet do fallback `ilike`: janela ao redor do 1º termo casado, com `<mark>`.
 *
 * Os termos já vêm sem acento, então o casamento acontece sobre a projeção normalizada
 * (mesmo comprimento do original) e o texto exibido continua sendo o ORIGINAL, com
 * acento. O escape acontece por pedaço, mantendo `<mark>` como única tag.
 */
function plainSnippet(text: string | null | undefined, tokens: string[]): string {
   const source = (text ?? '').replace(/\s+/g, ' ').trim();
   if (!source) return '';
   const norm = unaccent(source).toLowerCase();

   let at = -1;
   for (const t of tokens) {
      const i = norm.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
   }
   const start = at < 0 ? 0 : Math.max(0, at - 40);
   const end = start + 200;
   const window = source.slice(start, end);
   const windowNorm = norm.slice(start, end);

   const hits: [number, number][] = [];
   for (const t of tokens) {
      let i = windowNorm.indexOf(t);
      while (i >= 0) {
         hits.push([i, i + t.length]);
         i = windowNorm.indexOf(t, i + t.length);
      }
   }
   hits.sort((a, b) => a[0] - b[0]);

   let out = '';
   let cursor = 0;
   for (const [from, to] of hits) {
      if (from < cursor) continue; // sobreposição entre termos
      out += `${escapeHtml(window.slice(cursor, from))}<mark>${escapeHtml(window.slice(from, to))}</mark>`;
      cursor = to;
   }
   out += escapeHtml(window.slice(cursor));
   return (start > 0 ? '…' : '') + out + (source.length > end ? '…' : '');
}

// ── execução ────────────────────────────────────────────────────────

interface RawRow {
   id: string;
   identifier?: string | null;
   title: string;
   team_id?: string | null;
   status_id?: string | null;
   rank?: number | string | null;
   snippet?: string | null;
}

async function rows(db: Db, query: SQL): Promise<RawRow[]> {
   const res = (await db.execute(query)) as unknown;
   if (Array.isArray(res)) return res as RawRow[];
   return ((res as { rows?: RawRow[] }).rows ?? []) as RawRow[];
}

function num(v: number | string | null | undefined): number {
   const n = typeof v === 'string' ? Number(v) : (v ?? 0);
   return Number.isFinite(n) ? n : 0;
}

function issueUrl(identifier: string | null): string {
   return `/issue/${identifier ?? ''}`;
}

// ── consultas full-text por tipo ────────────────────────────────────

async function ftsIssues(
   db: Db,
   o: SearchOptions,
   tsq: SQL,
   limit: number,
   like: string
): Promise<SearchItem[]> {
   // Comentário fica FORA do índice (a spec mantém o `ilike` de hoje), mas continua
   // casando — a tela de busca já alcançava o corpo do comentário e perder isso seria
   // regressão. Sem vetor, esses acertos entram com rank 0 e caem para o fim da lista.
   const conds: SQL[] = [
      sql`(i.search_vector @@ ${tsq} OR c.search_vector @@ ${tsq}
           OR EXISTS (SELECT 1 FROM comment cm WHERE cm.issue_id = i.id
                       AND ${ilikeUnaccent('cm.body', like)}))`,
   ];
   if (o.teamId) conds.push(sql`i.team_id = ${o.teamId}`);
   {
      const sc = scopeCond(o, 'i.team_id');
      if (sc) conds.push(sc);
   }
   if (o.statusId) conds.push(sql`i.status_id = ${o.statusId}`);
   const r = await rows(
      db,
      sql`SELECT i.id, i.identifier, i.title, i.team_id, i.status_id,
             ts_rank_cd(i.search_vector || coalesce(c.search_vector, ''::tsvector), ${tsq}) AS rank,
             ts_headline('simple', left(coalesce(i.title, '') || ' — ' || coalesce(c.description, ''), 2000),
                         ${tsq}, ${HEADLINE_OPTS}) AS snippet
          FROM issue i LEFT JOIN issue_content c ON c.issue_id = i.id
          WHERE ${sql.join(conds, sql` AND `)}
          ORDER BY rank DESC, i.updated_at DESC
          LIMIT ${limit}`
   );
   return r.map((row) => ({
      id: row.id,
      identifier: row.identifier ?? null,
      title: row.title,
      snippet: safeSnippet(row.snippet),
      rank: num(row.rank),
      teamId: row.team_id ?? null,
      statusId: row.status_id ?? null,
      url: issueUrl(row.identifier ?? null),
   }));
}

async function ftsProjects(
   db: Db,
   o: SearchOptions,
   tsq: SQL,
   limit: number
): Promise<SearchItem[]> {
   const conds: SQL[] = [sql`(p.search_vector @@ ${tsq} OR d.search_vector @@ ${tsq})`];
   if (o.teamId) conds.push(sql`p.team_id = ${o.teamId}`);
   {
      const sc = scopeCond(o, 'p.team_id');
      if (sc) conds.push(sc);
   }
   const r = await rows(
      db,
      sql`SELECT p.id, p.name AS title, p.team_id, p.status_id,
             ts_rank_cd(p.search_vector || coalesce(d.search_vector, ''::tsvector), ${tsq}) AS rank,
             ts_headline('simple', left(coalesce(p.name, '') || ' — ' || coalesce(d.summary, '') || ' ' || coalesce(d.description, ''), 2000),
                         ${tsq}, ${HEADLINE_OPTS}) AS snippet
          FROM project p LEFT JOIN project_detail d ON d.project_id = p.id
          WHERE ${sql.join(conds, sql` AND `)}
          ORDER BY rank DESC, p.updated_at DESC
          LIMIT ${limit}`
   );
   return r.map((row) => ({
      id: row.id,
      identifier: null,
      title: row.title,
      snippet: safeSnippet(row.snippet),
      rank: num(row.rank),
      teamId: row.team_id ?? null,
      statusId: row.status_id ?? null,
      url: `/project/${row.id}/overview`,
   }));
}

async function ftsInitiatives(
   db: Db,
   tsq: SQL,
   limit: number,
   o: SearchOptions
): Promise<SearchItem[]> {
   const scope = initiativeScopeCond(o);
   const r = await rows(
      db,
      sql`SELECT n.id, n.name AS title,
             ts_rank_cd(n.search_vector, ${tsq}) AS rank,
             ts_headline('simple', left(coalesce(n.name, '') || ' — ' || coalesce(n.description, ''), 2000),
                         ${tsq}, ${HEADLINE_OPTS}) AS snippet
          FROM initiative n
          WHERE n.search_vector @@ ${tsq}
          ${scope ? sql`AND ${scope}` : sql``}
          ORDER BY rank DESC, n.created_at DESC
          LIMIT ${limit}`
   );
   return r.map((row) => ({
      id: row.id,
      identifier: null,
      title: row.title,
      snippet: safeSnippet(row.snippet),
      rank: num(row.rank),
      teamId: null,
      statusId: null,
      url: `/initiative/${row.id}`,
   }));
}

async function ftsDocuments(
   db: Db,
   o: SearchOptions,
   tsq: SQL,
   limit: number
): Promise<SearchItem[]> {
   const conds: SQL[] = [sql`t.search_vector @@ ${tsq}`];
   if (o.teamId) conds.push(sql`f.team_id = ${o.teamId}`);
   {
      const sc = scopeCond(o, 'f.team_id');
      if (sc) conds.push(sc);
   }
   const r = await rows(
      db,
      sql`SELECT t.id, t.name AS title, f.team_id,
             ts_rank_cd(t.search_vector, ${tsq}) AS rank,
             ts_headline('simple', coalesce(t.name, ''), ${tsq}, ${HEADLINE_OPTS}) AS snippet
          FROM team_document t JOIN document_folder f ON f.id = t.folder_id
          WHERE ${sql.join(conds, sql` AND `)}
          ORDER BY rank DESC, t.updated_at DESC
          LIMIT ${limit}`
   );
   return r.map((row) => ({
      id: row.id,
      identifier: null,
      title: row.title,
      snippet: safeSnippet(row.snippet),
      rank: num(row.rank),
      teamId: row.team_id ?? null,
      statusId: null,
      url: `/team/${row.team_id ?? ''}/documents`,
   }));
}

// ── fallback `ilike` ────────────────────────────────────────────────

/**
 * Rede de segurança: entrada só com símbolos (nenhum termo indexável), coluna/índice
 * ausente (banco anterior à migration) ou zero acertos no índice — por exemplo um
 * pedaço NO MEIO da palavra, que o `tsquery` com prefixo não alcança.
 */
async function likeSearch(db: Db, o: SearchOptions, limit: number): Promise<SearchGroup[]> {
   const types = o.types?.length ? o.types : SEARCH_TYPES;
   // O padrão vai SEM acento porque as colunas comparadas também são normalizadas.
   const like = `%${unaccent(o.q)}%`;
   const tokens = tokensOf(o.q);
   const groups: SearchGroup[] = [];

   if (types.includes('issue')) {
      const conds: SQL[] = [
         sql`(${ilikeUnaccent('i.title', like)} OR ${ilikeUnaccent('i.identifier', like)}
              OR ${ilikeUnaccent('c.description', like)}
              OR EXISTS (SELECT 1 FROM comment cm WHERE cm.issue_id = i.id
                          AND ${ilikeUnaccent('cm.body', like)}))`,
      ];
      if (o.teamId) conds.push(sql`i.team_id = ${o.teamId}`);
      {
         const sc = scopeCond(o, 'i.team_id');
         if (sc) conds.push(sc);
      }
      if (o.statusId) conds.push(sql`i.status_id = ${o.statusId}`);
      const r = await rows(
         db,
         sql`SELECT i.id, i.identifier, i.title, i.team_id, i.status_id, c.description AS snippet
             FROM issue i LEFT JOIN issue_content c ON c.issue_id = i.id
             WHERE ${sql.join(conds, sql` AND `)}
             ORDER BY i.updated_at DESC LIMIT ${limit}`
      );
      groups.push({
         type: 'issue',
         items: r.map((row) => ({
            id: row.id,
            identifier: row.identifier ?? null,
            title: row.title,
            snippet: plainSnippet(`${row.title} — ${row.snippet ?? ''}`, tokens),
            rank: 0,
            teamId: row.team_id ?? null,
            statusId: row.status_id ?? null,
            url: issueUrl(row.identifier ?? null),
         })),
      });
   }

   if (types.includes('project')) {
      const conds: SQL[] = [
         sql`(${ilikeUnaccent('p.name', like)} OR ${ilikeUnaccent('d.summary', like)})`,
      ];
      if (o.teamId) conds.push(sql`p.team_id = ${o.teamId}`);
      {
         const sc = scopeCond(o, 'p.team_id');
         if (sc) conds.push(sc);
      }
      const r = await rows(
         db,
         sql`SELECT p.id, p.name AS title, p.team_id, p.status_id, d.summary AS snippet
             FROM project p LEFT JOIN project_detail d ON d.project_id = p.id
             WHERE ${sql.join(conds, sql` AND `)}
             ORDER BY p.updated_at DESC LIMIT ${limit}`
      );
      groups.push({
         type: 'project',
         items: r.map((row) => ({
            id: row.id,
            identifier: null,
            title: row.title,
            snippet: plainSnippet(`${row.title} — ${row.snippet ?? ''}`, tokens),
            rank: 0,
            teamId: row.team_id ?? null,
            statusId: row.status_id ?? null,
            url: `/project/${row.id}/overview`,
         })),
      });
   }

   if (types.includes('initiative') && !o.teamId) {
      const r = await rows(
         db,
         sql`SELECT n.id, n.name AS title, n.description AS snippet FROM initiative n
             WHERE (${ilikeUnaccent('n.name', like)} OR ${ilikeUnaccent('n.description', like)})
             ${initiativeScopeCond(o) ? sql`AND ${initiativeScopeCond(o)!}` : sql``}
             ORDER BY n.created_at DESC LIMIT ${limit}`
      );
      groups.push({
         type: 'initiative',
         items: r.map((row) => ({
            id: row.id,
            identifier: null,
            title: row.title,
            snippet: plainSnippet(`${row.title} — ${row.snippet ?? ''}`, tokens),
            rank: 0,
            teamId: null,
            statusId: null,
            url: `/initiative/${row.id}`,
         })),
      });
   }

   if (types.includes('document')) {
      const conds: SQL[] = [ilikeUnaccent('t.name', like)];
      if (o.teamId) conds.push(sql`f.team_id = ${o.teamId}`);
      {
         const sc = scopeCond(o, 'f.team_id');
         if (sc) conds.push(sc);
      }
      const r = await rows(
         db,
         sql`SELECT t.id, t.name AS title, f.team_id FROM team_document t
             JOIN document_folder f ON f.id = t.folder_id
             WHERE ${sql.join(conds, sql` AND `)}
             ORDER BY t.updated_at DESC LIMIT ${limit}`
      );
      groups.push({
         type: 'document',
         items: r.map((row) => ({
            id: row.id,
            identifier: null,
            title: row.title,
            snippet: plainSnippet(row.title, tokens),
            rank: 0,
            teamId: row.team_id ?? null,
            statusId: null,
            url: `/team/${row.team_id ?? ''}/documents`,
         })),
      });
   }

   return groups.filter((g) => g.items.length > 0);
}

// ── entrada pública ─────────────────────────────────────────────────

/**
 * Busca léxica agrupada por tipo. Nunca lança por causa do índice: qualquer falha na
 * consulta full-text cai no `ilike` (`fallback: true` na resposta).
 */
export async function search(db: Db, opts: SearchOptions): Promise<SearchResult> {
   const q = (opts.q ?? '').trim();
   const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
   const base: SearchResult = { query: q, groups: [], fallback: false, semantic: false };
   if (!q) return base;

   const types = opts.types?.length ? opts.types : SEARCH_TYPES;
   const tsq = tsQuery(q);

   if (tsq) {
      try {
         const groups: SearchGroup[] = [];
         if (types.includes('issue'))
            groups.push({
               type: 'issue',
               items: await ftsIssues(db, opts, tsq, limit, `%${unaccent(q)}%`),
            });
         if (types.includes('project'))
            groups.push({ type: 'project', items: await ftsProjects(db, opts, tsq, limit) });
         // Initiative é de workspace (não tem time) — sai de cena quando há filtro de time.
         if (types.includes('initiative') && !opts.teamId)
            groups.push({ type: 'initiative', items: await ftsInitiatives(db, tsq, limit, opts) });
         if (types.includes('document'))
            groups.push({ type: 'document', items: await ftsDocuments(db, opts, tsq, limit) });
         const nonEmpty = groups.filter((g) => g.items.length > 0);
         if (nonEmpty.length > 0) return { ...base, groups: nonEmpty };
      } catch {
         // Índice ausente/consulta inválida: segue para o `ilike`.
      }
   }

   return { ...base, groups: await likeSearch(db, opts, limit), fallback: true };
}

/** Ids de issue em ordem de relevância — reuso pelas saved searches (`resolveView`). */
export async function searchIssueIds(db: Db, opts: SearchOptions): Promise<string[]> {
   const res = await search(db, { ...opts, types: ['issue'] });
   return res.groups.find((g) => g.type === 'issue')?.items.map((i) => i.id) ?? [];
}
