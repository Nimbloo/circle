# Integração GitHub (link PR ↔ issue)

O circle vincula pull requests às issues e move a issue para **Done** quando o PR é
mergeado — paridade com o Linear. Duas fontes, complementares:

1. **Webhook (tempo real)** — `POST /api/v1/integrations/github/webhook`. GitHub manda
   eventos `pull_request` (opened/edited/synchronize/closed/reopened); o circle
   verifica a assinatura HMAC e reconcilia na hora.
2. **Polling (reconciliação)** — `reviews.sync` (`syncFromGitHub`) puxa os PRs dos repos
   configurados. Cobre o que o webhook perder (downtime, evento não entregue) e o
   backfill inicial.

## Como o vínculo é resolvido

O identifier da issue (ex.: `ENG-42`) é procurado no **título**, no **nome do branch**
e no **corpo** do PR (`parseResolves`). Casou com uma issue real → cria/atualiza a linha
em `issue_pr_link` (id determinístico = idempotente) e popula o painel "PR links".
PR **merged** → move a issue para o status `completed` de menor position (`done`), a
menos que já esteja completed/canceled.

## Setup

### Webhook (recomendado — tempo real)

1. No repo (ou org) → Settings → Webhooks → Add webhook.
2. **Payload URL**: `https://circle.nimbloo.com/api/v1/integrations/github/webhook`
3. **Content type**: `application/json`
4. **Secret**: um valor forte → também em `CIRCLE_GITHUB_WEBHOOK_SECRET` no circle.
5. **Events**: "Let me select" → apenas **Pull requests**.

Assinatura verificada via `X-Hub-Signature-256` (HMAC-SHA256 do body cru). Sem o secret
configurado no circle, o endpoint rejeita tudo com 401 (integração desligada por padrão).

### Polling (backfill / reconciliação)

- `GITHUB_TOKEN` — token com acesso de leitura aos repos.
- `CIRCLE_GITHUB_REPOS` — csv `owner/repo`.
- Dispara via `POST /api/v1/reviews/sync` (ou o botão na aba Reviews).

## Notas

- O webhook responde **200 mesmo em erro de processamento** (evita retry storm do
  GitHub); o polling reconcilia o que faltar.
- `additions`/`deletions` vêm no payload do webhook; no polling só o GET individual do
  PR os traz (por isso o sync busca detalhe só dos PRs abertos).
