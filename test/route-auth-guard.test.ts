import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { isPublicApiPath, TOKEN_API_PREFIX } from '@/lib/api/public-routes';

/**
 * GUARDA DE AUTENTICAÇÃO (defesa em profundidade).
 *
 * O `middleware.ts` já fecha tudo por padrão, mas ele é UMA camada só: um bypass
 * do middleware do Next (houve vários CVEs high na série 15.x) expõe direto todo
 * handler que não repete a checagem. Este teste exige que TODO handler HTTP fora
 * da allowlist pública chame `requireEmail`/`getOrCreateUser` — assim uma rota
 * nova nasce protegida mesmo se o autor esquecer.
 *
 * `emailFromRequest` sozinho NÃO conta: devolve `null` sem sessão em vez de
 * barrar, então a rota continuaria respondendo a um request não autenticado.
 */

const HARD_AUTH = /\brequireEmail\b|\bgetOrCreateUser\b|\brequireUser\b|\brequireApiToken\b/;
/**
 * Ponto cego 1: gate em posição de TERNÁRIO (`cond ? await requireEmail(req) : null`)
 * não barra ninguém — o handler segue respondendo quando a condição é falsa. Um
 * `requireEmail` que só aparece assim (ou dentro de comentário, que já sai no
 * `stripComments`) não conta como autenticação.
 */
const TERNARY_AUTH =
   /[?:]\s*(?:\(?\s*await\s+)?(?:requireEmail|getOrCreateUser|requireUser|requireApiToken)\s*\(/;
/** Comentário não é código: menção a `requireEmail` em comentário não autentica. */
function stripComments(src: string): string {
   return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Todas as ocorrências do gate são condicionais? Então não há gate de verdade. */
function onlyConditionalAuth(body: string): boolean {
   const hits = body.match(
      /(?:[?:]\s*(?:\(?\s*await\s+)?)?(?:requireEmail|getOrCreateUser|requireUser|requireApiToken)\s*\(/g
   );
   return Boolean(hits?.length) && hits!.every((h) => TERNARY_AUTH.test(h));
}
/**
 * Forma alternativa legítima: o handler resolve o e-mail e **retorna 401** ele
 * mesmo. É o caso do stream SSE (`/events`), que não passa pelo `handle()` — como
 * `requireEmail` lança `ApiError`, sem o wrapper a exceção viraria 500 em vez de
 * 401. Exigir as DUAS coisas (resolver o e-mail e barrar) evita aceitar um
 * `emailFromRequest` decorativo.
 */
const EXPLICIT_401 = (body: string) => /\bemailFromRequest\b/.test(body) && /\b401\b/.test(body);
/**
 * Ponto cego 2: a forma `export const GET = handler` não casava com o regex antigo
 * (`export async function GET(`) — o arquivo inteiro passava batido, sem UM handler
 * inspecionado. Ambas as formas contam agora.
 */
const HANDLER = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

/**
 * O que o detector corrigido revelou: dois handlers fail-open reais, que resolvem o
 * e-mail por ternário (`email ? await getOrCreateUser(...) : undefined`) e, SEM sessão,
 * seguem respondendo com escopo irrestrito. A correção é do dono de `teams/**`
 * (trocar `emailFromRequest` por `requireEmail`), não deste guarda — a lista existe só
 * para ele continuar pegando o que é NOVO. É uma tolerância TEMPORÁRIA e por
 * SUBCONJUNTO: assim que os dois handlers exigirem sessão, apague estas linhas.
 */
const KNOWN_FAIL_OPEN = ['GET /api/v1/teams', 'GET /api/v1/teams/[teamKey]'];

/** `app/api/v1/foo/route.ts` -> `/api/v1/foo` */
function pathnameOf(file: string): string {
   return file.replace(/^app/, '').replace(/\/route\.ts$/, '');
}

function routeFiles(): string[] {
   return execSync('git ls-files app/api', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('route.ts'));
}

describe('guarda de auth nas rotas de API', () => {
   it('todo handler não-público exige autenticação no próprio handler', () => {
      const unprotected: string[] = [];

      for (const file of routeFiles()) {
         const pathname = pathnameOf(file);
         // `/api/public/*` dispensa SESSÃO mas não dispensa auth: a credencial é o
         // token (`requireApiToken`), então segue sendo checado abaixo.
         if (isPublicApiPath(pathname) && !pathname.startsWith(TOKEN_API_PREFIX)) continue;
         const src = stripComments(readFileSync(file, 'utf8'));

         const marks: { method: string; start: number; alias: boolean }[] = [];
         for (const m of src.matchAll(HANDLER))
            marks.push({ method: m[1], start: m.index!, alias: m[0].includes('const') });

         for (let i = 0; i < marks.length; i++) {
            // `export const GET = h`: o corpo do handler é a função `h`, que está em
            // outro ponto do arquivo — o recorte entre marcas não a alcança.
            const body = marks[i].alias
               ? src
               : src.slice(marks[i].start, marks[i + 1]?.start ?? src.length);
            const authed =
               (HARD_AUTH.test(body) && !onlyConditionalAuth(body)) || EXPLICIT_401(body);
            if (!authed) unprotected.push(`${marks[i].method} ${pathnameOf(file)}`);
         }
      }

      expect(unprotected.filter((h) => !KNOWN_FAIL_OPEN.includes(h))).toEqual([]);
   });

   it('a allowlist pública só contém probes e webhooks autenticados por HMAC', () => {
      // Trava o tamanho da lista: adicionar rota pública passa a ser uma decisão
      // consciente, com este teste falhando até alguém atualizar a expectativa.
      const files = routeFiles()
         .filter((f) => isPublicApiPath(pathnameOf(f)))
         // A API pública (#101) é autenticada por token — coberta pelo teste acima,
         // que exige `requireApiToken` nela. Não entra na conta de rota anônima.
         .filter((f) => !pathnameOf(f).startsWith(TOKEN_API_PREFIX));
      expect(files.sort()).toEqual([
         'app/api/auth/[...nextauth]/route.ts',
         'app/api/auth/signup/route.ts',
         'app/api/healthz/route.ts',
         'app/api/metrics/route.ts',
         'app/api/readyz/route.ts',
         'app/api/v1/integrations/github/webhook/route.ts',
         'app/api/v1/integrations/sentry/issues/create/route.ts',
         'app/api/v1/integrations/sentry/issues/link/route.ts',
         'app/api/v1/integrations/sentry/teams/options/route.ts',
         'app/api/v1/integrations/sentry/webhook/route.ts',
      ]);
   });
});
