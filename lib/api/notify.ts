import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, issue as issueT } from '@/db/schema';
import { createNotification } from './notifications';
import { getUserSettings } from './settings';
import { sendSlack } from './integrations/slack';
import { sendEmail } from './integrations/mailer';
import { notificationEmailHtml } from './integrations/email-templates';

/** Escapa dados de usuário antes de interpolar em HTML (previne injeção). */
export function escapeHtml(input: string): string {
   return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

export interface NotifyInput {
   type: string; // assignment|comment|mention|status|...
   issueId: string;
   recipientId: string;
   actorId?: string | null;
   content?: string | null;
   /** Texto citado no e-mail como contexto (ex.: comentário-raiz de uma resposta). */
   contextText?: string | null;
}

/**
 * Cria a notificação in-app e dispara os canais externos (Slack + Email), best-effort.
 * Nunca lança — a notificação é secundária ao request principal.
 */
export async function dispatchNotification(db: Db, input: NotifyInput): Promise<void> {
   try {
      await createNotification(db, input);
   } catch (err) {
      console.error('[circle] createNotification falhou:', err);
   }

   try {
      const [recipient] = await db
         .select()
         .from(appUser)
         .where(eq(appUser.id, input.recipientId))
         .limit(1);
      const [iss] = await db
         .select({ identifier: issueT.identifier, title: issueT.title })
         .from(issueT)
         .where(eq(issueT.id, input.issueId))
         .limit(1);
      if (!iss) return;

      const rawContent = input.content ?? input.type;
      const summary = `[Circle] ${iss.identifier}: ${rawContent}`;
      const html = notificationEmailHtml({
         content: rawContent,
         identifier: iss.identifier,
         issueTitle: iss.title,
         contextText: input.contextText,
      });

      // Respeita as preferências do destinatário (`settings.notifications.*`). O in-app
      // (createNotification acima) já gravou — é o histórico e ignora as prefs. Fail-open:
      // erro ao ler settings → canal habilitado (não silenciar notificação por acidente).
      const [emailEnabled, slackEnabled] = await channelPrefs(db, input.recipientId);

      // Slack de 'assignment' é coberto pelo feed do canal (notifySlackEvent, gated pelo
      // slack_config admin) — não duplicar aqui. Comment/mention/etc seguem no Slack.
      const slackForType = slackEnabled && input.type !== 'assignment';

      await Promise.allSettled([
         slackForType ? sendSlack(`${summary}\n${iss.title}`) : Promise.resolve({ sent: false }),
         recipient?.email && emailEnabled
            ? sendEmail(recipient.email, summary, html)
            : Promise.resolve({ sent: false }),
      ]);
   } catch (err) {
      console.error('[circle] dispatch de notificação falhou:', err);
   }
}

/**
 * Preferências de canal do destinatário: [emailEnabled, slackEnabled] a partir de
 * `settings.notifications.{emailNotifications,slackNotifications}`. Cada canal é
 * permitido a menos que explicitamente `false`. Fail-open: erro ao ler settings →
 * ambos habilitados (não silenciar notificação por acidente).
 */
async function channelPrefs(db: Db, userId: string): Promise<[boolean, boolean]> {
   try {
      const settings = await getUserSettings(db, userId);
      const notifs = settings.notifications;
      if (notifs && typeof notifs === 'object' && !Array.isArray(notifs)) {
         const n = notifs as Record<string, unknown>;
         return [n.emailNotifications !== false, n.slackNotifications !== false];
      }
      return [true, true];
   } catch (err) {
      console.error('[circle] leitura de settings de notificação falhou (fail-open):', err);
      return [true, true];
   }
}
