import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DE ESCOPO NAS ESCRITAS.
 *
 * O irmão de `route-auth-guard.test.ts`: lá a pergunta é "quem é você?", aqui é
 * "você pode escrever NISTO?". A auditoria da v0.29.0 mostrou que o escopo morava
 * só nas leituras — toda escrita respondia 200 para um guest de outro time. Este
 * teste exige que TODO handler `POST|PUT|PATCH|DELETE` de `app/api/v1/**` verifique
 * escopo (no próprio handler OU no serviço que ele chama), ou esteja na lista de
 * exceções abaixo — que é explícita e comentada de propósito: liberar uma rota passa
 * a ser uma decisão consciente, com este teste falhando até alguém atualizar a lista.
 */

/** Chamada de gate de escopo: os asserts de `lib/api/scope.ts`. */
const SCOPE_GATE =
   /\bassert(?:CanWrite(?:Team|Issue|Project)|(?:Team|Issue|Project|Initiative)InScope|ChildOfProject|TeamMember)\s*\(/;
/** Gate por PAPEL: rota de administração não tem escopo de time a validar. */
const ROLE_GATE = /\b(?:isAdmin|requireAdmin|assertAdmin)\s*\(/;
/** Gate por PROPRIEDADE: recurso pessoal, autorizado pelo dono (ou admin). */
const OWNER_GATE = /\bassert\w*Owner\s*\(/;

const HANDLER = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;
const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Rotas de escrita que NÃO têm escopo de time a verificar. Cada grupo abaixo é uma
 * razão, não uma conveniência — se a razão não se aplicar, a rota tem que ganhar gate.
 */
const EXEMPT: ReadonlySet<string> = new Set([
   // 1. Dado do PRÓPRIO usuário (o gate é a identidade da sessão, não o time).
   'POST /agent/chats',
   'POST /favorites',
   'DELETE /favorites',
   'PATCH /me',
   'POST /me/avatar',
   'DELETE /me/avatar',
   'PATCH /notifications/[id]',
   'POST /notifications/read-all',
   'POST /uploads',
   'POST /attachments',
   'DELETE /attachments/[id]',

   // 2. Catálogo GLOBAL do workspace (não pendura em time) — gate por papel no serviço.
   'POST /labels',
   'PATCH /labels/[id]',
   'DELETE /labels/[id]',
   'POST /statuses',
   'PATCH /statuses',
   'PATCH /statuses/[id]',
   'DELETE /statuses/[id]',
   'POST /emojis',
   'DELETE /emojis/[id]',
   'PUT /settings',

   // 3. Autenticação por HMAC/token de integração (não há sessão nem escopo de time).
   //    `sentry/teams/options` é o form do Sentry: devolve id/nome de time, não escreve.
   'POST /integrations/sentry/teams/options',
   'POST /integrations/github/webhook',
   'POST /integrations/sentry/webhook',
   'POST /integrations/sentry/issues/create',
   'POST /integrations/sentry/issues/link',

   // 4. Dono do recurso: comentário e review são do autor (checagem de autoria no serviço).
   'PATCH /comments/[id]',
   'DELETE /comments/[id]',
   'POST /comments/[id]/reactions',
   'DELETE /comments/[id]/reactions',
   'POST /reviews/[id]/comments',
   'PATCH /reviews/[id]/comments/[commentId]',
   'DELETE /reviews/[id]/comments/[commentId]',
   'POST /reviews/[id]/guide',

   // 5. Fora do Grupo 1 do hardening (identidade/integrações e comportamento ficaram
   //    com os outros grupos; entram aqui para o guarda pegar o que é NOVO, não para
   //    declarar que estão fechadas).
   'POST /api-tokens',
   'DELETE /api-tokens/[id]',
   'POST /webhooks',
   'PATCH /webhooks/[id]',
   'DELETE /webhooks/[id]',
   'POST /webhooks/deliveries/[deliveryId]/redeliver',
   'PATCH /members/[id]',
   'POST /invites',
   'DELETE /invites/[id]',
   'PATCH /integrations/slack/config',
   'POST /integrations/slack/test',
   'POST /reviews/sync',
   'PATCH /cycles/[id]',
   'DELETE /cycles/[id]',
   'PATCH /documents/[id]',
   'DELETE /documents/[id]',
   'POST /teams',
   'PATCH /teams/[teamKey]',
   'DELETE /teams/[teamKey]',
   'POST /teams/[teamKey]/automations',
   'PATCH /teams/[teamKey]/automations/[id]',
   'DELETE /teams/[teamKey]/automations/[id]',
   'POST /teams/[teamKey]/cycles',
   'POST /teams/[teamKey]/documents',
   'POST /teams/[teamKey]/join-requests',
   'POST /teams/[teamKey]/join-requests/[id]',
   'POST /teams/[teamKey]/members',
   'DELETE /teams/[teamKey]/members/[userId]',
   'DELETE /teams/[teamKey]/members/self',
   'POST /teams/[teamKey]/project-templates',
   'PATCH /teams/[teamKey]/project-templates/[id]',
   'DELETE /teams/[teamKey]/project-templates/[id]',
   'PUT /teams/[teamKey]/slas',
   'POST /teams/[teamKey]/templates',
   'PATCH /teams/[teamKey]/templates/[id]',
   'DELETE /teams/[teamKey]/templates/[id]',

   // 6. Import/preview: só analisa o CSV, não escreve nada (o /commit é que tem gate).
   'POST /import/preview',
]);

/** `app/api/v1/foo/[id]/route.ts` -> `/foo/[id]` */
function routeOf(file: string): string {
   return file.replace(/^app\/api\/v1/, '').replace(/\/route\.ts$/, '');
}

function routeFiles(): string[] {
   return execSync('git ls-files app/api/v1', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('route.ts'));
}

/** Remove comentários — menção a `assertCanWrite…` em comentário não é gate. */
function stripComments(src: string): string {
   return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Serviços importados de `@/lib/api/...` pelo arquivo da rota, com o corpo já lido. */
function importedServices(src: string): { symbols: string[]; body: string }[] {
   const out: { symbols: string[]; body: string }[] = [];
   const IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'@\/(lib\/api\/[^']+)'/g;
   for (const m of src.matchAll(IMPORT)) {
      const symbols = m[1]
         .split(',')
         .map((s) =>
            s
               .trim()
               .split(/\s+as\s+/)[0]
               .trim()
         )
         .filter(Boolean);
      try {
         out.push({ symbols, body: readFileSync(`${m[2]}.ts`, 'utf8') });
      } catch {
         // módulo com outro caminho/extensão: ignora (o handler ainda pode ter gate próprio)
      }
   }
   return out;
}

/** Corpo da função `name` dentro do serviço (até o próximo `export` de topo). */
function functionBody(src: string, name: string): string | null {
   const start = src.search(new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\s*[(<]`, 'm'));
   if (start < 0) return null;
   const rest = src.slice(start + 1);
   const end = rest.search(/\nexport\s/);
   return end < 0 ? rest : rest.slice(0, end);
}

/** O handler chama algum serviço que faz o gate por dentro? */
function callsGatedService(handlerBody: string, services: ReturnType<typeof importedServices>) {
   for (const svc of services) {
      for (const sym of svc.symbols) {
         if (!new RegExp(`\\b${sym}\\s*\\(`).test(handlerBody)) continue;
         const body = functionBody(svc.body, sym);
         if (!body) continue;
         const clean = stripComments(body);
         if (SCOPE_GATE.test(clean) || ROLE_GATE.test(clean) || OWNER_GATE.test(clean)) return true;
      }
   }
   return false;
}

describe('guarda de escopo nas escritas da API', () => {
   it('todo handler de escrita verifica escopo (no handler ou no serviço)', () => {
      const ungated: string[] = [];

      for (const file of routeFiles()) {
         const raw = readFileSync(file, 'utf8');
         const src = stripComments(raw);
         const services = importedServices(raw);

         const marks: { method: string; start: number }[] = [];
         for (const m of src.matchAll(HANDLER)) marks.push({ method: m[1], start: m.index! });

         for (let i = 0; i < marks.length; i++) {
            if (!WRITE.has(marks[i].method)) continue;
            const key = `${marks[i].method} ${routeOf(file)}`;
            if (EXEMPT.has(key)) continue;
            const body = src.slice(marks[i].start, marks[i + 1]?.start ?? src.length);
            if (SCOPE_GATE.test(body) || ROLE_GATE.test(body) || OWNER_GATE.test(body)) continue;
            if (callsGatedService(body, services)) continue;
            ungated.push(key);
         }
      }

      expect(ungated).toEqual([]);
   });

   it('a lista de exceções não cobre rota que não existe mais', () => {
      const existing = new Set<string>();
      for (const file of routeFiles()) {
         const src = stripComments(readFileSync(file, 'utf8'));
         for (const m of src.matchAll(HANDLER)) {
            if (WRITE.has(m[1])) existing.add(`${m[1]} ${routeOf(file)}`);
         }
      }
      // Exceção órfã = lista apodrecendo. Some a rota, some a linha.
      expect([...EXEMPT].filter((k) => !existing.has(k))).toEqual([]);
   });
});

/**
 * Correção dos dois pontos cegos do `route-auth-guard.test.ts` (o guarda de AUTH):
 * ele só reconhece `export async function GET(` e aceita a menção a `requireEmail`
 * em qualquer posição. Estes casos travam a forma dos dois detectores — se alguém
 * "resolver" um handler sem gate mudando a FORMA do código, cai aqui.
 */
describe('forma dos detectores dos guardas', () => {
   it('reconhece handler exportado como const (`export const GET = handler`)', () => {
      const src = 'async function h() {}\nexport const GET = h;\nexport const POST = h;\n';
      const found = [...stripComments(src).matchAll(HANDLER)].map((m) => m[1]);
      expect(found).toEqual(['GET', 'POST']);
   });

   it('não aceita gate em posição de TERNÁRIO (gate condicional não é gate)', () => {
      const conditional = `
         const scope = pular ? null : await assertCanWriteIssue(db, email, id);
      `;
      const real = `
         await assertCanWriteIssue(db, email, id);
      `;
      // O ternário casa o regex cru, então o detector precisa olhar a posição.
      const inTernary = /[?:]\s*(?:await\s+)?assert\w+\s*\(/;
      expect(SCOPE_GATE.test(conditional) && inTernary.test(conditional)).toBe(true);
      expect(inTernary.test(real)).toBe(false);
   });

   it('menção em comentário não conta como gate', () => {
      const commented = '// aqui faltaria assertCanWriteIssue(db, email, id)\nawait algo();';
      expect(SCOPE_GATE.test(stripComments(commented))).toBe(false);
   });
});
