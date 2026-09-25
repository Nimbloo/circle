import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';

/**
 * GUARDA DE TEMPO REAL NAS ESCRITAS.
 *
 * "A moral do Circle é tudo realtime": escrita que não publica evento é um lugar onde o
 * outro usuário volta a precisar de F5. Este teste lê `lib/api/**` e exige que TODA
 * função exportada que grava no banco (`.insert/.update/.delete` sobre uma tabela de
 * `@/db/schema`, direto ou por função chamada) também publique (`publish`,
 * `publishInternal` ou `dispatchWebhooksOnly`, direto ou por função chamada) — ou esteja
 * na lista de exceções abaixo, com a razão.
 *
 * O grafo segue só chamadas resolvíveis: funções do próprio arquivo e imports nomeados de
 * outros módulos de `lib/api`. `getOrCreateUser` é opaco: ele publica `member created` no
 * 1º acesso, e isso não pode "cobrir" a escrita de quem só o chama para achar o ator.
 *
 * Complementa (não substitui) os testes de comportamento (`realtime-cobertura.test.ts`):
 * aqui a pergunta é "essa escrita publica ALGUMA coisa?"; lá, "publica a coisa certa".
 * Também barra `publish` dentro de `db.transaction(...)`: o evento sairia antes do
 * commit, e um cliente que recarregasse na hora leria o estado antigo (ou um rollback).
 */

const ROOT = 'lib/api';
const PUBLISHERS = new Set(['publish', 'publishInternal', 'dispatchWebhooksOnly']);
const OPAQUE = new Set(['getOrCreateUser']);

/**
 * Funções exportadas que gravam SEM publicar, de propósito. Cada grupo é uma razão;
 * se a razão deixar de valer, a função precisa passar a publicar.
 */
const EXEMPT: ReadonlyMap<string, string> = new Map([
   // 1. Helper de transação: roda dentro da exclusão do comentário/issue — quem chama publica.
   ['attachments.ts#deleteAttachmentRowsOfComments', 'helper interno de exclusão'],
   // 2. Trilha append-only de auditoria: lida sob demanda na tela de admin.
   ['audit.ts#recordAudit', 'log de auditoria'],
   // 3. Semeadura preguiçosa e idempotente na LEITURA (todos veem o mesmo resultado).
   ['automations.ts#ensureDefaultAutomations', 'seed lazy'],
   ['automations.ts#listTeamAutomations', 'seed lazy'],
   ['reviews.ts#getReview', 'cache de profundidade do PR, preenchido na leitura'],
   // 4. Séries históricas derivadas (snapshot diário para gráficos), sem tela ao vivo.
   ['cycles.ts#snapshotCurrentCycles', 'snapshot'],
   ['project-snapshots.ts#snapshotProjects', 'snapshot'],
   ['project-snapshots.ts#getProjectSnapshots', 'snapshot'],
   ['project-snapshots.ts#getAggregatedSnapshots', 'snapshot'],
   ['roadmap.ts#getInitiativeSnapshots', 'snapshot'],
   // 5. Configuração de integração/convite, tela de admin que lê ao abrir. O convite
   //    aceito vira `member created` pelo provisionamento do usuário.
   ['integrations/slack.ts#updateSlackConfig', 'config de integração'],
   ['invites.ts#createInvite', 'convite (admin)'],
   ['invites.ts#revokeInvite', 'convite (admin)'],
   ['invites.ts#consumeInvite', 'convite consumido no login'],
   ['login-gate.ts#decideKeycloakLogin', 'consome convite no login'],
   // 6. Webhooks de SAÍDA: a própria fila de entregas é a consequência de um evento, e o
   //    CRUD é tela de admin. Publicar aqui realimentaria o barramento.
   ['webhooks.ts#createWebhook', 'webhook de saída'],
   ['webhooks.ts#updateWebhook', 'webhook de saída'],
   ['webhooks.ts#deleteWebhook', 'webhook de saída'],
   ['webhooks.ts#attemptDelivery', 'webhook de saída'],
   ['webhooks.ts#dispatchEvent', 'webhook de saída'],
   ['webhooks.ts#redeliver', 'webhook de saída'],
   ['webhooks.ts#sweepWebhookDeliveries', 'webhook de saída'],
   ['webhooks.ts#startWebhookSweepTimer', 'webhook de saída'],
   ['webhooks.ts#onCircleEvent', 'webhook de saída'],
]);

interface Fn {
   key: string;
   file: string;
   name: string;
   exported: boolean;
   writes: number;
   publishes: number;
   calls: Set<string>;
}

function listFiles(dir: string): string[] {
   return readdirSync(dir).flatMap((f) => {
      const p = posix.join(dir, f);
      if (statSync(p).isDirectory()) return listFiles(p);
      return p.endsWith('.ts') ? [p] : [];
   });
}

function analyze() {
   const files = listFiles(ROOT);
   const fns = new Map<string, Fn>();
   const imports = new Map<string, Map<string, string>>();
   const inTransaction: string[] = [];

   const resolveSpec = (from: string, spec: string): string | null => {
      let p: string;
      if (spec.startsWith('@/')) p = spec.slice(2);
      else if (spec.startsWith('.')) p = posix.normalize(posix.join(posix.dirname(from), spec));
      else return null;
      return [`${p}.ts`, `${p}/index.ts`].find((c) => files.includes(c)) ?? null;
   };

   for (const file of files) {
      const src = ts.createSourceFile(
         file,
         readFileSync(file, 'utf8'),
         ts.ScriptTarget.Latest,
         true
      );
      const tables = new Set<string>();
      const imp = new Map<string, string>();
      imports.set(file, imp);
      for (const s of src.statements) {
         if (!ts.isImportDeclaration(s) || !s.importClause) continue;
         const spec = (s.moduleSpecifier as ts.StringLiteral).text;
         const nb = s.importClause.namedBindings;
         if (!nb || !ts.isNamedImports(nb)) continue;
         if (/db\/schema$/.test(spec)) {
            for (const e of nb.elements) tables.add(e.name.text);
            continue;
         }
         const target = resolveSpec(file, spec);
         if (target)
            for (const e of nb.elements)
               imp.set(e.name.text, `${target}::${(e.propertyName ?? e.name).text}`);
      }

      const add = (name: string, node: ts.Node, exported: boolean) => {
         const fn: Fn = {
            key: `${file}::${name}`,
            file,
            name,
            exported,
            writes: 0,
            publishes: 0,
            calls: new Set(),
         };
         const visit = (n: ts.Node) => {
            if (ts.isCallExpression(n)) {
               const c = n.expression;
               const arg = n.arguments[0];
               if (
                  ts.isPropertyAccessExpression(c) &&
                  ['insert', 'update', 'delete'].includes(c.name.text) &&
                  arg &&
                  ts.isIdentifier(arg) &&
                  tables.has(arg.text)
               )
                  fn.writes++;
               if (ts.isIdentifier(c)) {
                  if (PUBLISHERS.has(c.text)) fn.publishes++;
                  else fn.calls.add(c.text);
               }
            }
            // Função passada como callback (`opts.defer(fn)`, `list.map(fn)`).
            if (ts.isIdentifier(n) && n.parent && ts.isCallExpression(n.parent)) {
               if (n.parent.arguments.some((a) => a === n)) fn.calls.add(n.text);
            }
            ts.forEachChild(n, visit);
         };
         visit(node);
         fns.set(fn.key, fn);
      };

      for (const s of src.statements) {
         const exported = !!ts
            .getModifiers(s as ts.HasModifiers)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
         if (ts.isFunctionDeclaration(s) && s.name && s.body) add(s.name.text, s, exported);
         if (ts.isVariableStatement(s))
            for (const d of s.declarationList.declarations)
               if (
                  ts.isIdentifier(d.name) &&
                  d.initializer &&
                  (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
               )
                  add(d.name.text, d.initializer, exported);
      }

      // `publish` lexicamente dentro do callback de `.transaction(...)`.
      const scanTx = (n: ts.Node, inside: boolean) => {
         if (
            ts.isCallExpression(n) &&
            ts.isPropertyAccessExpression(n.expression) &&
            n.expression.name.text === 'transaction'
         ) {
            scanTx(n.expression, inside);
            for (const a of n.arguments) scanTx(a, true);
            return;
         }
         if (
            inside &&
            ts.isCallExpression(n) &&
            ts.isIdentifier(n.expression) &&
            PUBLISHERS.has(n.expression.text)
         ) {
            const line = src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
            inTransaction.push(`${file}:${line}`);
         }
         ts.forEachChild(n, (c) => scanTx(c, inside));
      };
      scanTx(src, false);
   }

   const resolve = (fn: Fn, name: string): Fn | undefined => {
      if (OPAQUE.has(name)) return undefined;
      return fns.get(`${fn.file}::${name}`) ?? fns.get(imports.get(fn.file)?.get(name) ?? '');
   };
   const reaches = (fn: Fn, prop: 'writes' | 'publishes', seen = new Set<string>()): boolean => {
      if (seen.has(fn.key)) return false;
      seen.add(fn.key);
      if (fn[prop] > 0) return true;
      for (const c of fn.calls) {
         const target = resolve(fn, c);
         if (target && reaches(target, prop, seen)) return true;
      }
      return false;
   };

   const silentWriters = [...fns.values()]
      .filter((f) => f.exported && reaches(f, 'writes') && !reaches(f, 'publishes'))
      .map((f) => `${f.file.slice(ROOT.length + 1)}#${f.name}`)
      .sort();
   return { silentWriters, inTransaction, count: fns.size };
}

describe('guarda de tempo real (lib/api)', () => {
   const { silentWriters, inTransaction, count } = analyze();

   it('a análise enxerga as funções (sanidade do parser)', () => {
      expect(count).toBeGreaterThan(300);
   });

   it('toda função exportada que grava publica evento (ou é exceção justificada)', () => {
      const semEvento = silentWriters.filter((k) => !EXEMPT.has(k));
      expect(semEvento).toEqual([]);
   });

   it('a lista de exceções não apodrece (toda exceção ainda grava sem publicar)', () => {
      const obsoletas = [...EXEMPT.keys()].filter((k) => !silentWriters.includes(k));
      expect(obsoletas).toEqual([]);
   });

   it('nenhum publish dentro de db.transaction (o evento sairia antes do commit)', () => {
      expect(inTransaction).toEqual([]);
   });
});
