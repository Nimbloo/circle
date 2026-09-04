/**
 * Catálogo de eventos assináveis por webhook (#101).
 *
 * Vive num módulo próprio, SEM dependência de Node/drizzle, porque a tela de Settings
 * (client component) precisa da lista em runtime — importá-la de `lib/api/webhooks.ts`
 * arrastaria `node:crypto` e o schema do banco para o bundle do navegador.
 */
export const WEBHOOK_EVENTS = [
   'issue.created',
   'issue.updated',
   'issue.deleted',
   'project.created',
   'project.updated',
   'project.deleted',
   'comment.created',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
