import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { appUser, issue as issueT } from '@/db/schema';
import { createNotification } from './notifications';
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

      await Promise.allSettled([
         sendSlack(`${summary}\n${iss.title}`),
         recipient?.email
            ? sendEmail(recipient.email, summary, html)
            : Promise.resolve({ sent: false }),
      ]);
   } catch (err) {
      console.error('[circle] dispatch de notificação falhou:', err);
   }
}
