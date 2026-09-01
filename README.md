# Circle

Gestor de issues, projetos e times inspirado no **Linear** — a ferramenta interna de
engenharia da Nimbloo. Roda em produção em **[circle.nimbloo.ai](https://circle.nimbloo.ai)**.

Diferente do template original (que era só front-end com dados mock), este Circle é uma
aplicação **full-stack Next.js** com banco Postgres, autenticação SSO via Keycloak,
realtime por SSE e deploy contínuo no EKS da Nimbloo.

---

## Stack

| Camada          | Escolha                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| Framework       | Next.js 15 (App Router, React 19, Turbopack no dev)                               |
| Linguagem       | TypeScript (strict), alias `@/*` → raiz do repo                                   |
| Estilo          | Tailwind CSS v4 — tokens em `app/globals.css` (paleta do Linear)                  |
| UI              | shadcn/ui (Radix) em `components/ui/` + ícones `lucide-react`                     |
| Estado          | Zustand (`store/`) + nuqs (filtros/sort na URL)                                   |
| Banco           | PostgreSQL + drizzle-orm (`db/schema.ts`, migrations em `db/migrations/`)         |
| Auth            | NextAuth v5 + provider Keycloak (SSO OIDC) — ver [Autenticação](#autenticação)    |
| Realtime        | SSE sobre Postgres `LISTEN/NOTIFY` (`lib/api/events.ts` → `lib/use-live-sync.ts`) |
| Testes          | Vitest + PGlite (Postgres em memória, sem banco externo)                          |
| Observabilidade | Sentry (`@sentry/nextjs`), `/api/metrics` (Prometheus)                            |

---

## Arquitetura

O fluxo de uma feature atravessa camadas bem definidas — **respeite esta separação** ao
contribuir:

```
UI (components/) ──chama──▶ lib/client.ts (fetch tipado)
                                  │
                                  ▼
                        app/api/v1/<rota>/route.ts   ← valida input + resolve o usuário (auth)
                                  │
                                  ▼
                        lib/api/<domínio>.ts         ← regra de negócio + acesso ao banco (drizzle)
                                  │
                                  ▼
                              db/schema.ts            ← tabelas Postgres
```

- **`app/api/v1/*`** — route handlers REST. Cada rota chama `requireEmail()` +
  `getOrCreateUser()` (de `lib/api/auth.ts`) e delega a lógica para `lib/api/`.
- **`lib/api/*`** — toda a lógica de domínio e queries drizzle. Retorna **DTOs** (nunca
  entidades cruas). É o que os testes exercitam.
- **`lib/client.ts`** — client HTTP tipado que a UI usa (nada de `fetch` solto nos componentes).
- **`lib/adapters*.ts`** — convertem DTO → tipos ricos que a UI consome.
- **`store/*`** — estado de UI (Zustand). Mutations são **otimistas com rollback** e
  feedback _truthful_ (toast de sucesso só quando a API confirma).
- **`data/*`** — tipos de domínio do front + dados de exemplo.
- **`instrumentation.ts`** — no boot, aplica migrations (advisory-lock entre pods) e
  semeia os catálogos (status, prioridades, labels). Idempotente.
- **`middleware.ts`** — gate de auth: valida a sessão (ou Bearer JWT de máquina) antes de
  liberar `/api/*`.

Aprofundamento por área: `docs/`. O que está pendente e por quê — incluindo bloqueios
que vivem em outro repositório e decisões em aberto — em [`docs/PENDENCIAS.md`](docs/PENDENCIAS.md)
(as issues seguem sendo a fonte da verdade sobre escopo).

---

## Rodando localmente

Pré-requisitos: **Node 22+**, **pnpm**, e um **PostgreSQL** acessível.

```bash
git clone https://github.com/Nimbloo/circle.git
cd circle
pnpm install
```

Crie um `.env.local` (nunca commitado):

```bash
# Banco local
DATABASE_URL=postgresql://circle:circle@localhost:5432/circle

# Bypass de auth SÓ para desenvolvimento — entra como este e-mail sem passar pelo
# Keycloak. NUNCA comitar esta variável nem código que a referencie fora do dev seam.
CIRCLE_DEV_AUTH_EMAIL=voce@nimbloo.ai

# Opcional em dev
CIRCLE_WORKSPACE_SLUG=nimbloo
CIRCLE_ADMIN_EMAILS=voce@nimbloo.ai
CIRCLE_SEED_DEMO=true   # popula dados de demonstração ao rodar `pnpm db:seed`
```

Aplique o schema e (opcional) semeie dados:

```bash
pnpm db:migrate     # aplica as migrations do db/migrations
pnpm db:seed        # catálogos + dados demo (se CIRCLE_SEED_DEMO=true)
pnpm dev            # http://localhost:3000
```

> As migrations também rodam **sozinhas no boot** (via `instrumentation.ts`); `pnpm db:migrate`
> é útil para aplicar sem subir o servidor. `pnpm db:migrate` e `pnpm db:seed` carregam o
> `.env.local` quando `DATABASE_URL` não foi injetada no processo; uma variável de ambiente
> explícita sempre tem precedência.

### Scripts

| Comando                     | O que faz                                                  |
| --------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                  | Servidor de desenvolvimento (Turbopack)                    |
| `pnpm build` / `pnpm start` | Build de produção / serve o build                          |
| `pnpm test`                 | Testes (Vitest + PGlite — não precisa de Postgres externo) |
| `pnpm typecheck`            | `tsc --noEmit`                                             |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                          |
| `pnpm db:generate`          | Gera uma migration a partir do diff do `db/schema.ts`      |
| `pnpm db:migrate`           | Aplica migrations pendentes                                |
| `pnpm db:seed`              | Semeia catálogos (+ demo)                                  |

---

## Autenticação

Em produção o acesso é **100% via SSO Keycloak** (realm `nimbloo-internal`, que federa o
Google). O gate exige: e-mail `@nimbloo.ai` verificado **e** pertencer ao grupo Keycloak
**`app-circle`**. Quem controla quem entra é o Keycloak — não há cadastro nem senha na app.

Em desenvolvimento, use `CIRCLE_DEV_AUTH_EMAIL` para pular o SSO. **Esse "dev seam" é
local e jamais entra no repositório** — o CI trata qualquer commit que referencie
`CIRCLE_DEV_AUTH_EMAIL` no gate como erro.

Detalhes de auth de máquina (Bearer JWT / service accounts): `docs/integrations/machine-api-auth.md`.

---

## Testes

```bash
pnpm test
```

Vitest sobe um Postgres **em memória (PGlite)** por teste (`test/helpers/db.ts` →
`makeTestDb`), roda as migrations e usa fixtures (`test/helpers/fixtures.ts`). Escreva um
teste por endpoint/serviço de `lib/api/` que você tocar. Padrão AAA.

---

## Contribuindo

Qualquer pessoa pode contribuir. O fluxo:

1. **Branch a partir da `develop`** (sempre atualizada): `<seu-usuario>/<slug-curto>`.
   Nunca comite direto em `develop`/`main`.
2. Código em **inglês**; commits, PRs e docs em **português (pt-BR)**.
3. **Conventional Commits**: `feat|fix|docs|style|refactor|test|chore|perf(<escopo>): <descrição>`.
   Sem emoji. Não referencie IA/assistente nos commits.
4. Rode `pnpm typecheck && pnpm test` antes de abrir o PR.
5. Abra o PR **para a `develop`**. Descreva o quê e o porquê; referencie a issue com `Closes #N`.

Convenções detalhadas (e como o Claude deve mexer no projeto) estão no **[CLAUDE.md](./CLAUDE.md)**.

---

## CI/CD e Deploy

**O deploy de produção acontece ao dar merge na `main`.** Não há staging/hml neste projeto
— o fluxo é `develop → main`:

1. Merge de um PR `develop → main` → o workflow `.github/workflows/build-and-push.yml`
   builda a imagem Docker e faz push para o ECR `circle/prd:<versão do package.json>`.
2. O **ArgoCD Image Updater** detecta a nova tag semver, atualiza o chart em `nimbloo-k8s`
   e sincroniza — o rollout em `circle.nimbloo.ai` é **automático**.

Regras de versão (SemVer em `package.json`):

- Commits em `develop` **não** bumpam versão.
- Na promoção `develop → main`, bumpe **MINOR** se houver `feat:`, **MAJOR** se houver
  breaking change, senão sem bump. A nova versão precisa ser **maior que a maior tag já no ECR**
  (o Image Updater sempre pega a maior semver).
- Commit de release: `chore: release vX.Y.Z` na `develop`, depois PR para a `main`.

Migrations aplicam no boot do novo pod (idempotentes, serializadas por advisory lock).

---

## Vibecoding com o Claude

Este repositório é feito para ser evoluído com o **Claude Code**. Antes de pedir mudanças,
o Claude lê o **[CLAUDE.md](./CLAUDE.md)** automaticamente — ele descreve onde cada tipo de
lógica vive, as convenções, o padrão de testes e o fluxo de deploy, para que qualquer
alteração respeite a arquitetura e chegue segura em produção.
