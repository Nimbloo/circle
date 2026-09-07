# Auth de máquina na API (service accounts do Keycloak)

Scripts, CI e automações chamam a API do circle (`/api/v1/*` e `/api/public/v1/*`) sem
browser usando um **Bearer JWT emitido pelo Keycloak** — o mesmo IdP do SSO humano. O
circle **não** mantém cofre de tokens próprio: a credencial, a identidade e o papel do
robô vivem no Keycloak, e dar ou tirar acesso não passa por deploy nenhum.

## Como funciona

1. O cliente obtém um access token via **client credentials grant** no realm.
2. Manda `Authorization: Bearer <token>` na requisição.
3. O gate valida o JWT contra o JWKS público do realm
   (`${issuer}/protocol/openid-connect/certs`) — RS256, `iss` e `exp` conferidos.
   `alg` é travado em RS256 (rejeita `none`/HS\*).
4. O token precisa ser de **service account**. O Keycloak nomeia o usuário do service
   account como `service-account-<clientId>`, e é esse claim que separa a máquina da
   pessoa. Token de gente é recusado aqui — gente entra pela sessão.
5. A identidade é sempre `service-account-<clientId>@circle.local`. O `email` do token é
   ignorado de propósito: um robô é ele mesmo, nunca uma pessoa.
6. O **papel** vem da client role de `circle` no token (`member`, `admin` ou `guest`).
   Sem papel, 403. Ele é gravado no `app_user` a cada chamada, então promover ou rebaixar
   no Orbis vale na requisição seguinte.

A única variável de ambiente envolvida é a `AUTH_KEYCLOAK_ISSUER`, que o SSO humano já
usa. Não existe allowlist de clients no app: **quem pode chamar é quem tem service account
com client role de `circle`**, e isso é uma decisão do IdP.

> Por que não basta validar a audiência: `grafana` e `kiali` emitem token com escopo
> completo, então o token de uma pessoa logada no Grafana carrega as roles do Circle e,
> por tabela, a audiência do Circle. O corte por service account não depende de como os
> outros clients estão configurados.

## Setup no Keycloak (ops, uma vez por robô)

- Criar um **client** confidencial no realm com **Service Accounts Enabled**.
- Atribuir ao service account a client role de `circle` que corresponde ao que ele pode
  fazer: `member` (ou `admin`), ou `guest` quando o robô deve ficar preso a alguns times
  — nesse caso, adicione o usuário dele aos times no próprio Circle.
- Guardar `client_id` + `client_secret` no cofre de quem consome (CI secret, etc).

Para tirar o acesso: revogar a role. Para cortar na hora, sem passar pelo IdP: desativar o
membro no Circle.

## Exemplo

```bash
# 1. token (client credentials)
TOKEN=$(curl -s -X POST \
  "$AUTH_KEYCLOAK_ISSUER/protocol/openid-connect/token" \
  -d grant_type=client_credentials \
  -d client_id=circle-ci \
  -d client_secret=$CIRCLE_CI_SECRET | jq -r .access_token)

# 2. chamada à API do circle
curl -s https://circle.nimbloo.ai/api/public/v1/issues \
  -H "Authorization: Bearer $TOKEN"
```

## Notas de segurança

- O gate valida a assinatura no **próprio middleware** (Edge, Web Crypto), então rota que
  esqueça a checagem não fica exposta.
- JWKS é cacheado em memória por 10 min, com refresh forçado quando aparece um `kid`
  desconhecido (rotação de chave), throttled em 1x/min contra cache-thrash pré-auth.
- O token é validado **duas vezes** (gate + rota) por defesa em profundidade.
- Validações aplicadas: assinatura RS256 (alg travado), `iss` exato, `exp` **obrigatório**,
  `nbf` quando presente, e o corte de service account — este último conferido antes da
  verificação cara (para descartar token alheio barato) e de novo sobre o payload já
  verificado, porque o primeiro olha bytes ainda não conferidos.
