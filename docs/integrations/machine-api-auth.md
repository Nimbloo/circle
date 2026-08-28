# Auth de máquina na API (service accounts do Keycloak)

Scripts, CI e automações chamam a API do circle (`/api/v1/*`) sem browser usando um
**Bearer JWT emitido pelo Keycloak** — o mesmo IdP do SSO humano. O circle **não**
mantém um cofre de tokens próprio; a identidade e o ciclo de vida da credencial vivem
no Keycloak (princípio "IdP único").

## Como funciona

1. O cliente obtém um access token via **client credentials grant** no realm.
2. Manda `Authorization: Bearer <token>` na requisição.
3. O **gate do middleware** (Edge) valida o JWT contra o JWKS público do realm
   (`${issuer}/protocol/openid-connect/certs`) — RS256, `iss` e `exp` conferidos.
   `alg` é travado em RS256 (rejeita `none`/HS\*).
4. A rota resolve a **identidade** do token: usa o claim `email` se presente; senão
   sintetiza `service-account-<clientId>@circle.local`. O usuário é provisionado JIT
   como **Member** (elevar role é ação de admin, igual ao fluxo humano).

Nenhuma env nova: reusa `AUTH_KEYCLOAK_ISSUER`.

## Setup no Keycloak (ops, uma vez por cliente)

- Criar um **client** confidencial no realm com **Service Accounts Enabled**.
- (Opcional) mapear um claim `email` no service account para atribuição legível;
  senão a identidade cai no formato sintético acima.
- Guardar `client_id` + `client_secret` no cofre de quem consome (CI secret, etc).

## Exemplo

```bash
# 1. token (client credentials)
TOKEN=$(curl -s -X POST \
  "$AUTH_KEYCLOAK_ISSUER/protocol/openid-connect/token" \
  -d grant_type=client_credentials \
  -d client_id=circle-ci \
  -d client_secret=$CIRCLE_CI_SECRET | jq -r .access_token)

# 2. chamada à API do circle
curl -s https://circle.nimbloo.com/api/v1/issues \
  -H "Authorization: Bearer $TOKEN"
```

## Notas de segurança

- O gate valida a assinatura no **próprio middleware** (Edge, Web Crypto) — rotas sem
  `requireEmail` também ficam protegidas.
- JWKS é cacheado em memória por 10 min, com refresh forçado quando aparece um `kid`
  desconhecido (rotação de chave).
- O token é validado **duas vezes** (gate + rota) por defesa em profundidade.
