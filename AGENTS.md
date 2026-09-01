# AGENTS.md — guia do projeto Circle

Instruções para o Codex (e humanos) evoluírem o Circle. Complementa o
[README.md](./README.md). **Contexto em pt-BR, código em inglês.**

Circle é um gestor de issues inspirado no **Linear**, full-stack Next.js, em produção em
`circle.nimbloo.ai`. Toda mudança de UI busca **fidelidade ao Linear** (layout, cores,
ícones, espaçamentos, componentes, modais).

---

## Regras de ouro (não violar)

1. **Dev seam nunca é commitado.** `CIRCLE_DEV_AUTH_EMAIL` (bypass de login em dev) vive
   só no `.env.local` + no seam local de `lib/api/auth.ts`/`middleware.ts`/`_devseed.ts`.
   Antes de commitar, confirme: `git grep -c CIRCLE_DEV_AUTH_EMAIL HEAD -- lib/api/auth.ts middleware.ts` = 0.
2. **Nunca comite direto em `develop`/`main`.** Branch `<user>/<slug>` a partir da `develop`; PR para `develop`.
3. **Merge na `main` = deploy em produção.** Trate como release (ver [Deploy](#deploy)).
4. **Respeite as camadas** (UI → `lib/client.ts` → `app/api/v1` → `lib/api` → `db`). Sem
   `fetch` solto em componente; sem query drizzle fora de `lib/api/`.
5. **Cores sempre por token** (`bg-secondary`, `text-muted-foreground`, …), nunca hex
   literal em componente. A paleta é a do Linear e vive em `app/globals.css`.
6. **Mudança em contrato de API** (rotas consumidas, auth): pergunte antes.

---

## Onde cada coisa vive

| Preciso…                  | Vá em                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Endpoint REST             | `app/api/v1/<rota>/route.ts` (valida input, `requireEmail()` + `getOrCreateUser()`, delega) |
| Regra de negócio / query  | `lib/api/<domínio>.ts` (drizzle; retorna DTO)                                               |
| Chamar a API na UI        | `lib/client.ts` (client tipado)                                                             |
| DTO → tipo rico da UI     | `lib/adapters*.ts`                                                                          |
| Estado de UI              | `store/*.ts` (Zustand)                                                                      |
| Tabela / coluna           | `db/schema.ts` (+ gerar migration)                                                          |
| Tipos de domínio do front | `data/*.ts`                                                                                 |
| Componente de tela        | `components/common/<área>/`                                                                 |
| Primitivo shadcn          | `components/ui/` (tratar como vendored)                                                     |
| Tokens de cor/tema        | `app/globals.css`                                                                           |
| Realtime                  | `lib/api/events.ts` (publish) + `lib/use-live-sync.ts` (consume)                            |

---

## Receitas

**Novo endpoint:** cria `app/api/v1/x/route.ts` → dentro, `const me = await getOrCreateUser(db, await requireEmail())`
→ chama `lib/api/x.ts` → retorna `NextResponse.json(dto)`. Adiciona o método tipado em `lib/client.ts`.
Escreve teste em `test/` exercitando `lib/api/x.ts`.

**Nova coluna/tabela:** edita `db/schema.ts` → `pnpm db:generate` (gera migration em `db/migrations/`)
→ revisa o SQL (aditivo; sem DROP de dado) → `pnpm db:migrate`. As migrations rodam no boot,
idempotentes, com advisory lock entre pods — não edite migrations já aplicadas, gere novas.

**Nova mutation no store:** otimista + rollback. O toast de **sucesso** só depois que a API
confirma; no catch, faz rollback + `toast.error` e re-lança. Nada de toast de sucesso "no clique".

**Nova opção de display (issues):** o estado vive em `store/display-settings-store.ts` e a
UI em `components/layout/headers/display-options.tsx`; o consumo (grouping/ordering/filtros)
em `components/common/issues/grouped-issues-view.tsx`. O layout list/board é o
`store/view-store.ts` (`viewType`).

---

## Testes

`pnpm test` — Vitest + **PGlite** (Postgres em memória, sem banco externo). `test/helpers/db.ts`
(`makeTestDb`) roda as migrations; `test/helpers/fixtures.ts` semeia. Escreva um teste por
serviço de `lib/api/` que tocar. `pnpm typecheck` antes de commitar.

---

## UI — fidelidade ao Linear

- **Cores:** paleta do Linear em `app/globals.css` (brand `#5e6ad2`; dark bg `#0e0f11`,
  muted `#8a8f98`; light muted `#6b6f76`). Tema por `next-themes` (`.dark`) + variantes no
  `store/theme-store.ts`. Todo componente lê **tokens**, e funciona em light e dark.
- **Ícones:** `lucide-react` (estilo Linear). Status/prioridade têm SVGs próprios.
- **Componentes/modais:** shadcn/Radix de `components/ui/`. Reaproveite; não reinvente primitivo.
- **Feedback:** truthful (toast só na confirmação da API), skeletons no loading, transições
  suaves, hovers. Compare com o Linear ao mexer em layout/espaçamento.

---

## Commits

Conventional Commits em pt-BR: `feat|fix|docs|style|refactor|test|chore|perf(<escopo>): <descrição>`.
Sem emoji. **Não** referencie IA/assistente/Codex no commit (sem `Co-Authored-By`, sem 🤖).

---

## Deploy

`develop → main` (sem staging). Ver README para detalhes; resumo:

- Merge na `main` → CI builda `circle/prd:<versão package.json>` no ECR → ArgoCD Image
  Updater faz o rollout automático em `circle.nimbloo.ai`.
- Bump SemVer no `package.json` na promoção: MINOR se houver `feat:`, MAJOR se breaking,
  senão nenhum. **A versão precisa ser maior que a maior tag semver já no ECR.**
- Commit de release `chore: release vX.Y.Z` na `develop`, depois PR para a `main`.

---

## Comandos

`pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm build` · `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:seed`
