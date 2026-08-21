import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, issue as issueT } from '@/db/schema';
import { createNotification } from './notifications';
import { getUserSettings } from './settings';
import { sendSlack } from './integrations/slack';
import { sendEmail } from './integrations/mailer';

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
      const html = `<p>${escapeHtml(rawContent)}</p><p><strong>${escapeHtml(iss.identifier)}</strong> — ${escapeHtml(iss.title)}</p><p><a href="https://circle.nimbloo.ai">Abrir no Circle</a></p>`;

      // Respeita a preferência do destinatário: e-mail só sai se `emailNotifications`
      // não estiver explicitamente desativado. O in-app (createNotification acima) já
      // gravou — é o histórico e ignora a pref. Fail-open: erro ao ler settings → manda.
      const emailEnabled = recipient?.email ? await emailAllowedFor(db, input.recipientId) : false;

      await Promise.allSettled([
         sendSlack(`${summary}\n${iss.title}`),
         recipient?.email && emailEnabled
            ? sendEmail(recipient.email, summary, html)
            : Promise.resolve({ sent: false }),
      ]);
   } catch (err) {
      console.error('[circle] dispatch de notificação falhou:', err);
   }
}

/**
 * True se o usuário permite e-mail (pref `notifications.emailNotifications`).
 * Default = permite (true) quando a chave está ausente. Fail-open: qualquer erro
 * ao ler as settings retorna true (o e-mail é enviado — não silenciar por acidente).
 */
async function emailAllowedFor(db: Db, userId: string): Promise<boolean> {
   try {
      const settings = await getUserSettings(db, userId);
      const notifs = settings.notifications;
      if (notifs && typeof notifs === 'object' && !Array.isArray(notifs)) {
         return (notifs as Record<string, unknown>).emailNotifications !== false;
      }
      return true;
   } catch (err) {
      console.error('[circle] leitura de settings de e-mail falhou (fail-open):', err);
      return true;
   }
}
