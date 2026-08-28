# Integração Slack (notificações de canal)

O circle posta um **feed de eventos** no Slack via **Incoming Webhook**. Saída apenas
(sem slash commands por ora). Best-effort: nunca bloqueia nem falha a request da API.

## Setup

1. Crie um **Incoming Webhook** no workspace Slack (app "Incoming Webhooks") apontando
   pro canal desejado.
2. Coloque a URL em `SLACK_WEBHOOK_URL` (secret) no circle. Sem ela, tudo é no-op.
3. Em **Settings → Integrations**, com o Slack conectado, aparecem os toggles por evento
   ("Notificações no canal"). Admin liga/desliga cada um.

## Eventos (configuráveis — `slack_config`, default todos ligados)

| Evento          | Dispara quando                                      | Toggle             |
| --------------- | --------------------------------------------------- | ------------------ |
| Issue criada    | qualquer issue nova                                 | `onIssueCreated`   |
| Issue concluída | issue entra em status `completed`                   | `onIssueCompleted` |
| Issue atribuída | issue recebe um responsável                         | `onIssueAssigned`  |
| PR mergeado     | webhook/sync do GitHub conclui a issue via PR merge | `onPrMerged`       |

Config em `GET/PATCH /api/v1/integrations/slack/config` (PATCH admin-only).

## Notas de design

- **Canal único.** Todos os eventos vão pro mesmo webhook/canal. Roteamento por
  time/canal fica pra depois (exigiria Slack App + OAuth, não só Incoming Webhook).
- **Sem duplicação com a notificação por-usuário.** O `dispatchNotification` (in-app +
  e-mail + Slack por preferência do destinatário) cobre comment/mention; o Slack de
  **assignment** foi movido pra este feed de canal (gated por `onIssueAssigned`) pra não
  postar duas vezes no mesmo canal.
- **Fire-and-forget.** As notificações são disparadas com `void` — não acoplam latência
  nem derrubam a mutação se o Slack estiver fora.
