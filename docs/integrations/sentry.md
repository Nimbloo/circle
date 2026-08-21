# Integração Sentry → Circle (criar card a partir de um erro)

Permite, na página de uma issue no Sentry, clicar **Link Issue → Circle → Create** e
gerar um card no Circle (ou **Link** um card existente por identifier). Usa o
**Integration Platform** do Sentry (UI component `issue-link`), autenticado por
assinatura HMAC — sem OAuth, sem expor a API do Circle.

## Como funciona

```
Sentry (issue) --POST assinado--> Circle /api/v1/integrations/sentry/...
   issue-link.create  -> cria card (status=triage, priority=high, label=sentry)
   issue-link.link    -> linka card existente (por identifier, ex.: CORE-12)
   <- { webUrl, project, identifier }   (Sentry mostra "project#identifier")
```

O Sentry assina cada request com `Sentry-Hook-Signature` = HMAC-SHA256 do corpo com o
**Client Secret** da integração; o Circle valida (`CIRCLE_SENTRY_CLIENT_SECRET`). Sem o
secret configurado, todos os requests do Sentry recebem **401** (integração desligada).

## Passo a passo (uma vez)

### 1. Criar a Internal Integration no Sentry

Sentry → org **nimbloo** → **Settings → Developer Settings → Custom Integrations →
New Internal Integration**.

- **Name:** `Circle`
- **Webhook URL:** `https://circle.nimbloo.ai` ← base; os `uri` do schema abaixo são
  anexados a ela.
- **Permissions:** `Issue & Event: Read`.
- **Schema** (cole em _Schema_):

```json
{
   "elements": [
      {
         "type": "issue-link",
         "link": {
            "uri": "/api/v1/integrations/sentry/issues/link",
            "required_fields": [
               { "type": "text", "name": "identifier", "label": "Card do Circle (ex.: CORE-12)" }
            ]
         },
         "create": {
            "uri": "/api/v1/integrations/sentry/issues/create",
            "required_fields": [
               { "type": "text", "name": "title", "label": "Title", "default": "issue.title" }
            ],
            "optional_fields": [
               {
                  "type": "textarea",
                  "name": "description",
                  "label": "Description",
                  "default": "issue.description"
               },
               {
                  "type": "select",
                  "name": "teamId",
                  "label": "Team",
                  "uri": "/api/v1/integrations/sentry/teams/options"
               }
            ]
         }
      }
   ]
}
```

**Save** → copie o **Client Secret** gerado.

### 2. Dar o Client Secret ao Circle

O secret entra em `circle-prd-secrets` (injetado via `envFrom`, não aparece em `env[]`):

```bash
# merge sem apagar as chaves existentes: recria o Secret com todas as chaves + a nova.
# (obtenha as chaves atuais antes; ou adicione a chave pelo seu fluxo de secrets)
kubectl -n circle-prd create secret generic circle-prd-secrets \
  --from-literal=CIRCLE_SENTRY_CLIENT_SECRET='<client-secret-do-sentry>' \
  --dry-run=client -o yaml | kubectl apply -f -   # ⚠️ merge, não overwrite — ver nota
kubectl -n circle-prd rollout restart deploy/circle-prd   # envFrom só recarrega no restart
```

> Nota: `create ... --dry-run | apply` **substitui** o Secret. Para só adicionar a chave
> preservando as demais (DATABASE_URL, GITHUB_TOKEN, SLACK_WEBHOOK_URL…), use
> `kubectl patch secret circle-prd-secrets --type=merge -p '{"stringData":{"CIRCLE_SENTRY_CLIENT_SECRET":"..."}}'`
> (se o classificador bloquear o patch, recrie o Secret com TODAS as chaves).

### 3. Usar

Em qualquer issue do Sentry → **Link Issue → Circle → aba Create** → ajuste
título/descrição/time → **Create**. O card nasce no Circle e o Sentry passa a mostrar o
link `Time#CORE-N`. A aba **Link** conecta a um card já existente pelo identifier.

## Config (env) — defaults sensatos, só o secret é obrigatório

| Var                           | Default                                                | Uso                                |
| ----------------------------- | ------------------------------------------------------ | ---------------------------------- |
| `CIRCLE_SENTRY_CLIENT_SECRET` | — (**obrigatório**)                                    | valida a assinatura do Sentry      |
| `CIRCLE_APP_URL`              | `https://circle.nimbloo.ai`                            | base da `webUrl` do card           |
| `CIRCLE_WORKSPACE_SLUG`       | `nimbloo`                                              | segmento `/{org}/issue/...` da URL |
| `CIRCLE_SENTRY_ACTOR_EMAIL`   | 1º de `CIRCLE_ADMIN_EMAILS`, senão `sentry@nimbloo.ai` | autor do card                      |
| `CIRCLE_SENTRY_DEFAULT_TEAM`  | 1º time                                                | time quando não escolhido no form  |
| `CIRCLE_SENTRY_STATUS_ID`     | `triage`                                               | status inicial do card             |
| `CIRCLE_SENTRY_PRIORITY_ID`   | `high`                                                 | prioridade do card                 |

## Teste rápido (sem o Sentry)

```bash
SECRET='<client-secret>'
BODY='{"fields":{"title":"Teste Sentry","description":"corpo"},"webUrl":"https://nimbloo.sentry.io/issues/1/"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
curl -s -X POST https://circle.nimbloo.ai/api/v1/integrations/sentry/issues/create \
  -H "content-type: application/json" -H "sentry-hook-signature: $SIG" -d "$BODY"
# → {"webUrl":".../nimbloo/issue/CORE-N","project":"<time>","identifier":"CORE-N"}
```

## Segurança

- Endpoints públicos no middleware **só** porque autenticam por HMAC (não por sessão).
- Assinatura inválida/ausente → 401. Secret ausente → integração inteira em 401.
- `teams/options` não exige assinatura (Sentry busca via GET sem corpo assinável; expõe
  só nomes/ids de time — baixa sensibilidade).
- Nunca commitar o Client Secret; ele vive só no `circle-prd-secrets`.
