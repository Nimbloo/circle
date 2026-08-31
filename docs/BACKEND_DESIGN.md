# Circle — Design do backend

Como o backend do Circle (`circle.nimbloo.ai`) realmente funciona. Complementa o
[CLAUDE.md](../CLAUDE.md) (regras de contribuição) e o [README.md](../README.md).

> **Histórico:** este documento já descreveu um serviço `circle-api` separado em Spring
> Boot native, com oauth2-proxy/Google SSO e Aurora. **Esse backend nunca foi construído.**
> O Circle é Next.js full-stack desde o início. O texto abaixo descreve o que existe.

---

## 1. Arquitetura

Não há serviço de backend separado. O Next.js (App Router) é o backend: cada endpoint é
um route handler, no runtime Node, no mesmo processo que serve a UI.

```
Browser (@nimbloo.ai)
   │  https://circle.nimbloo.ai
   ▼
Istio gateway-interno  ──►  circle (Next.js standalone, 1 processo)
                                 │
                     middleware.ts (Edge) — gate default-deny
                                 │
                     app/api/v1/**/route.ts — handlers
                                 │
                     lib/api/*.ts — regra de negócio (drizzle)
                                 │
                                 ▼
                     PostgreSQL (RDS interno compartilhado, database `circle`)
```

Camadas, de fora para dentro — a regra é não pular nenhuma:

`components/` → `lib/client.ts` (client HTTP tipado) → `app/api/v1/<rota>/route.ts`
(valida input, autentica, delega) → `lib/api/<domínio>.ts` (drizzle, devolve DTO) → `db/`.

Sem `fetch` solto em componente e sem query drizzle fora de `lib/api/`.

## 2. Autenticação — duas camadas

**Login é 100% SSO Keycloak** (realm `nimbloo-internal`, client `circle`), via NextAuth com
sessão JWT em cookie. Não existe login por senha: `passwordHash` é coluna vestigial e as
rotas de signup/convite nativo foram removidas.

O gate de acesso (`auth.config.ts`, `isAllowedKeycloakProfile`) exige as três coisas:
domínio `@nimbloo.ai`, `email_verified`, e pertencer ao grupo Keycloak **`app-circle`** —
que é concedido pelo **Orbis**, não pelo Circle. Isso depende do client emitir o claim
`groups` no ID token; sem o claim o gate fecha (fail-closed intencional).

O usuário é provisionado no primeiro login (`getOrCreateUser`, no callback `signIn`).
Adicionar alguém a um time **não** provisiona — quem não logou ainda não existe aqui.

**Auth de máquina:** `Authorization: Bearer <jwt>` emitido pelo Keycloak (service accounts),
validado contra o JWKS do realm (`lib/api/keycloak-jwt.ts`).

As duas camadas de enforcement:

1. **`middleware.ts`** (Edge) — default-deny. Sem sessão: `/api/*` responde 401
   problem+json, páginas redirecionam para `/login`. A allowlist pública vive em
   `lib/api/public-routes.ts`.
2. **Cada handler** repete a checagem com `requireEmail`. Não é redundância: um bypass do
   middleware do Next (houve vários CVEs high na série 15.x) chegaria direto no handler.

`test/route-auth-guard.test.ts` falha se um handler novo nascer sem checagem, e trava a
allowlist pública — ela e o middleware leem do mesmo módulo, então não podem divergir.

## 3. Modelo de dados

`db/schema.ts` é a fonte da verdade (drizzle). Para gerar migration: editar o schema →
`pnpm db:generate` → revisar o SQL (**aditivo**, sem DROP de dado) → `pnpm db:migrate`.

As migrations rodam **no boot** (`instrumentation.ts`), com advisory lock do Postgres
serializando os pods durante um rollout, e fail-fast: se sobrar migration no disco não
aplicada, o boot quebra em vez de subir com schema drift.

Nunca editar migration já aplicada — gerar nova.

## 4. Convenções de API

**Sucesso:** envelope `{ data, meta? }` (`ok()` em `lib/api/response.ts`).

**Erro:** RFC 7807 `application/problem+json` — `{ type, title, status, detail? }`
(`problem()`). O wrapper `handle()` converte `ApiError` e `ZodError`, e traduz SQLSTATE do
Postgres em status semântico (FK inexistente → 404, unique → 409, not-null → 400) em vez
de 500 opaco.

**Validação de input:** Zod no handler, antes de chamar `lib/api/`.

Rotas de listagem por domínio (`/projects`, `/initiatives`, `/views`, `/members`…) existem
como API canônica, mas **a UI não as usa**: o bootstrap `GET /workspace` traz tudo num só
GET e hidrata os stores.

## 5. Realtime

Barramento pub/sub in-process (`lib/api/events.ts`), com fan-out entre pods via **Postgres
LISTEN/NOTIFY** — sem Redis nem SaaS. Cada pod mantém uma conexão dedicada `LISTEN`,
ignora as próprias notificações (dedup por id de instância) e reconecta sozinho.

O cliente consome por **SSE** (`GET /api/v1/events`, heartbeat de 25s) e, a cada evento,
faz refetch coarse debounced do store afetado (`lib/use-live-sync.ts`).

Os eventos são grossos de propósito (`{entity, action}`), o que é simples e robusto mas
faz cada cliente re-hidratar o store inteiro. É o limite de escala conhecido — ver a issue
de payload fino. A decisão de **não** adotar Pusher, com os gatilhos que a revisariam,
está registrada em issue própria.

## 6. Observabilidade

Sentry nos três runtimes (server, edge, browser), inicializado em `instrumentation.ts`
antes dos early returns. `sendDefaultPii: false` mais scrubber de credencial/cookie — o
domínio tem PII. Sem DSN o SDK fica inerte, então dev e teste não emitem nada.

Métricas Prometheus em `/api/metrics`; probes em `/api/healthz` e `/api/readyz`.

## 7. Testes

Vitest + **PGlite** (Postgres em memória, sem banco externo). `test/helpers/db.ts` roda as
migrations; `test/helpers/fixtures.ts` semeia. Um teste por serviço de `lib/api/` que for
tocado.

Três testes são **guardas estruturais**, não de comportamento — varrem o código e falham
se um padrão perigoso voltar:

- `route-auth-guard.test.ts` — todo handler não-público exige autenticação;
- `store-selector-guard.test.ts` — nenhum componente assina um getter do zustand sem
  chamá-lo dentro do seletor (o padrão que congelava a tela e chegou a apagar vínculo);
- `view-filter-parity.test.ts` — o filtro de view do servidor e o do cliente devolvem o
  mesmo conjunto.

⚠️ Não há infra de teste de componente (vitest roda em `environment: 'node'`, sem
RTL/jsdom). Comportamento de UI é coberto indiretamente, pelos serviços e pelos guardas.

## 8. Deploy

`develop → main`, sem staging. Merge na `main` builda `circle/prd:<versão do package.json>`
no ECR; o ArgoCD Image Updater faz o rollout. A versão precisa ser maior que a maior tag
semver já no ECR. Detalhes no README.
