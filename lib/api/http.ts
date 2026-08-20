import { z } from 'zod';
import { emailFromRequest } from './auth';
import { problem } from './response';
import { ApiError } from './errors';
import type { IssueListOptions } from './issues';

/** E-mail do usuário autenticado (header do oauth2-proxy) ou 401. */
export function requireEmail(req: Request): string {
   const email = emailFromRequest(req);
   if (!email) throw new ApiError(401, 'Não autenticado');
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
      default:
         return 'Internal Server Error';
   }
}

/** Envolve um handler mapeando ApiError/ZodError para ProblemDetail. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
   try {
      return await fn();
   } catch (e) {
      if (e instanceof ApiError) return problem(e.status, titleFor(e.status), e.message);
      if (e instanceof z.ZodError) {
         return problem(400, 'Bad Request', 'Payload inválido', { errors: e.flatten() });
      }
      console.error('[circle-api] erro não tratado:', e);
      return problem(500, 'Internal Server Error');
   }
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
   };
   if (sp.get('assignee') === 'me' || sp.get('mine') === 'true') opts.assigneeMe = meEmail;
   if (sp.get('createdBy') === 'me') opts.createdByMe = meEmail;
   return { opts, meEmail };
}
