import { z } from 'zod';
import { db } from '@/db';
import { emailFromRequest } from './auth';
import { assertActiveEmail } from './users';
import { problem } from './response';
import { ApiError } from './errors';
import { captureServerError } from './observe-error';
import { observeHttp } from '@/lib/metrics';
import type { IssueListOptions } from './issues';

/**
 * E-mail do usuário autenticado (sessão NextAuth; header em teste) ou 401.
 *
 * Também recusa com 403 quem está desativado (#100): é o chokepoint de TODA rota,
 * inclusive das que nunca resolvem o `app_user`. `getOrCreateUser` repete a checagem —
 * defesa em profundidade, porque nem todo serviço passa por aqui.
 */
export async function requireEmail(req?: Request): Promise<string> {
   const email = await emailFromRequest(req);
   if (!email) throw new ApiError(401, 'Não autenticado');
   await assertActiveEmail(db, email);
   return email;
}

function titleFor(status: number): string {
   switch (status) {
      case 400:
         return 'Bad Request';
      case 401:
         return 'Unauthorized';
      case 403:
         return 'Forbidden';
      case 404:
         return 'Not Found';
      case 409:
         return 'Conflict';
      case 502:
         return 'Bad Gateway';
      case 503:
         return 'Service Unavailable';
      default:
         return 'Internal Server Error';
   }
}

/**
 * Traduz erros do Postgres (SQLSTATE) para ProblemDetail semântico em vez de 500.
 * Cobre os casos em que a validação da borda não pegou (FK inexistente, unique,
 * texto acima do limite da coluna, data malformada) — o contrato de erro passa a
 * ser 400/404/409 correto, não 500 opaco. Retorna null se não for erro de DB conhecido.
 */
function mapDbError(e: unknown): Response | null {
   if (!e || typeof e !== 'object' || !('code' in e)) return null;
   const code = String((e as { code: unknown }).code);
   switch (code) {
      case '23503': // foreign_key_violation — id referenciado não existe
         return problem(404, 'Not Found', 'Recurso referenciado não existe');
      case '23505': // unique_violation
         return problem(409, 'Conflict', 'Registro já existe');
      case '23502': // not_null_violation
         return problem(400, 'Bad Request', 'Campo obrigatório ausente');
      case '23514': // check_violation
         return problem(400, 'Bad Request', 'Valor viola restrição do banco');
      case '22001': // string_data_right_truncation — texto acima do limite da coluna
         return problem(400, 'Bad Request', 'Valor de texto excede o tamanho permitido');
      case '22003': // numeric_value_out_of_range
         return problem(400, 'Bad Request', 'Valor numérico fora do intervalo');
      case '22007': // invalid_datetime_format
      case '22008': // datetime_field_overflow
      case '22P02': // invalid_text_representation (data/enum/uuid malformado)
         return problem(400, 'Bad Request', 'Formato de valor inválido');
      default:
         return null;
   }
}

/** Contexto `METHOD /path` da request pra correlacionar o log com o endpoint. */
function reqTag(req?: Request): string {
   if (!req) return '';
   try {
      return ` ${req.method} ${new URL(req.url).pathname}`;
   } catch {
      return '';
   }
}

/**
 * Envolve um handler mapeando ApiError/ZodError/erros do Postgres para ProblemDetail.
 * Passe `req` (opcional) pra correlacionar os logs de erro com rota/método.
 */
export async function handle(fn: () => Promise<Response>, req?: Request): Promise<Response> {
   const start = Date.now();
   let res: Response;
   try {
      res = await fn();
   } catch (e) {
      if (e instanceof ApiError) {
         res = problem(e.status, titleFor(e.status), e.message);
      } else if (e instanceof z.ZodError) {
         res = problem(400, 'Bad Request', 'Payload inválido', { errors: e.flatten() });
      } else {
         const dbMapped = mapDbError(e);
         if (dbMapped) {
            // 4xx derivado de SQLSTATE: loga warn pra não mascarar query malformada como erro do cliente.
            const code = (e as { code?: unknown })?.code;
            console.warn(`[circle-api]${reqTag(req)} db-mapped (SQLSTATE ${String(code)})`, e);
            res = dbMapped;
         } else {
            console.error(`[circle-api]${reqTag(req)} erro não tratado:`, e);
            // O ProblemDetail abaixo faz o erro "sumir" antes do onRequestError do Next
            // — sem esta linha nenhum 5xx da API chega ao Sentry (auditoria v0.29.0).
            captureServerError(e, req);
            res = problem(500, 'Internal Server Error');
         }
      }
   }
   observeHttp(req?.method ?? 'UNKNOWN', res.status, (Date.now() - start) / 1000);
   return res;
}

/** Lê um parâmetro multivalorado: repetido (?x=a&x=b) ou CSV (?x=a,b). */
export function multi(sp: URLSearchParams, key: string): string[] | undefined {
   const all = sp.getAll(key);
   if (all.length === 0) return undefined;
   const flat = all
      .flatMap((v) => v.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
   return flat.length ? flat : undefined;
}

/** Traduz a query string nas opções de listagem de issues. */
export function parseIssueListOptions(
   sp: URLSearchParams,
   meEmail?: string
): { opts: IssueListOptions; meEmail?: string } {
   const opts: IssueListOptions = {
      team: sp.get('team') ?? undefined,
      status: multi(sp, 'status'),
      statusType: multi(sp, 'statusType') ?? multi(sp, 'category'),
      assignee: multi(sp, 'assignee'),
      priority: multi(sp, 'priority'),
      labels: multi(sp, 'labels'),
      project: multi(sp, 'project'),
      cycle: multi(sp, 'cycle'),
      q: sp.get('q') ?? undefined,
      orderBy: (sp.get('orderBy') as IssueListOptions['orderBy']) ?? undefined,
      cursor: sp.get('cursor') ?? undefined,
   };
   const rawLimit = Number(sp.get('limit'));
   if (Number.isFinite(rawLimit) && rawLimit > 0) opts.limit = Math.min(Math.floor(rawLimit), 200);
   if (sp.get('assignee') === 'me' || sp.get('mine') === 'true') opts.assigneeMe = meEmail;
   if (sp.get('createdBy') === 'me') opts.createdByMe = meEmail;
   return { opts, meEmail };
}
