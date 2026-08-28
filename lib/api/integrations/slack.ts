/**
 * Slack via Incoming Webhook. Best-effort: no-op se SLACK_WEBHOOK_URL ausente,
 * nunca lança (não bloqueia a request). O usuário cria o webhook e provê a URL.
 */
import type { Db } from '@/db';
import { slackConfig } from '@/db/schema';
import { eq } from 'drizzle-orm';

export interface SendResult {
   sent: boolean;
   reason?: string;
}

export async function sendSlack(text: string): Promise<SendResult> {
   const url = process.env.SLACK_WEBHOOK_URL;
   if (!url) return { sent: false, reason: 'no-webhook' };
   try {
      const res = await fetch(url, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ text }),
         // Timeout duro: webhook pendurado NÃO pode acoplar latência à request da API.
         signal: AbortSignal.timeout(3000),
      });
      return res.ok ? { sent: true } : { sent: false, reason: `http ${res.status}` };
   } catch (err) {
      console.error('[circle] Slack webhook falhou:', err);
      return { sent: false, reason: 'error' };
   }
}

/* --------------------------- Config de eventos ---------------------------- */

const CONFIG_ID = 'default';

export interface SlackConfigDto {
   onIssueCreated: boolean;
   onIssueCompleted: boolean;
   onIssueAssigned: boolean;
   onPrMerged: boolean;
}

const DEFAULT_CONFIG: SlackConfigDto = {
   onIssueCreated: true,
   onIssueCompleted: true,
   onIssueAssigned: true,
   onPrMerged: true,
};

/** Config singleton dos eventos que notificam o Slack (default: todos ligados). */
export async function getSlackConfig(db: Db): Promise<SlackConfigDto> {
   const [row] = await db.select().from(slackConfig).where(eq(slackConfig.id, CONFIG_ID)).limit(1);
   if (!row) return DEFAULT_CONFIG;
   return {
      onIssueCreated: row.onIssueCreated,
      onIssueCompleted: row.onIssueCompleted,
      onIssueAssigned: row.onIssueAssigned,
      onPrMerged: row.onPrMerged,
   };
}

export async function updateSlackConfig(
   db: Db,
   patch: Partial<SlackConfigDto>
): Promise<SlackConfigDto> {
   // Update PARCIAL atômico: o `set` toca só as colunas do patch (não o row inteiro),
   // então patches concorrentes de toggles diferentes não se sobrescrevem. O insert
   // (1ª vez) semeia os defaults; colunas ausentes no patch mantêm o default/valor atual.
   const updatedAt = new Date();
   await db
      .insert(slackConfig)
      .values({ id: CONFIG_ID, ...DEFAULT_CONFIG, ...patch, updatedAt })
      .onConflictDoUpdate({ target: slackConfig.id, set: { ...patch, updatedAt } });
   return getSlackConfig(db);
}

/* --------------------------- Notificação por evento ----------------------- */

export type SlackEvent =
   | { type: 'issue.created'; identifier: string; title: string; actor?: string | null }
   | { type: 'issue.completed'; identifier: string; title: string }
   | { type: 'issue.assigned'; identifier: string; title: string; assignee: string }
   | { type: 'pr.merged'; identifier: string; title: string };

const TOGGLE: Record<SlackEvent['type'], keyof SlackConfigDto> = {
   'issue.created': 'onIssueCreated',
   'issue.completed': 'onIssueCompleted',
   'issue.assigned': 'onIssueAssigned',
   'pr.merged': 'onPrMerged',
};

/**
 * Escapa texto controlado pelo usuário antes de interpolar no mrkdwn do Slack.
 * Sem isto, um título de issue como `<!channel>` ou `<@U123>` viraria menção real
 * (spam/abuso disparável por qualquer Member). Spec do Slack: escapar & < >.
 */
function esc(s: string): string {
   return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatEvent(ev: SlackEvent): string {
   const id = esc(ev.identifier);
   const title = esc(ev.title);
   switch (ev.type) {
      case 'issue.created':
         return `:sparkles: *${id}* criada${ev.actor ? ` por ${esc(ev.actor)}` : ''}: ${title}`;
      case 'issue.completed':
         return `:white_check_mark: *${id}* concluída: ${title}`;
      case 'issue.assigned':
         return `:bust_in_silhouette: *${id}* atribuída a ${esc(ev.assignee)}: ${title}`;
      case 'pr.merged':
         return `:git-merge: PR mergeado → *${id}* concluída: ${title}`;
   }
}

/**
 * Notifica o Slack sobre um evento, se o toggle correspondente estiver ligado.
 * Best-effort: nunca lança (chamadores fazem fire-and-forget). Retorna o resultado
 * do envio (útil em teste). No-op silencioso se o toggle está off ou sem webhook.
 */
export async function notifySlackEvent(db: Db, ev: SlackEvent): Promise<SendResult> {
   try {
      const cfg = await getSlackConfig(db);
      if (!cfg[TOGGLE[ev.type]]) return { sent: false, reason: 'event-disabled' };
      return await sendSlack(formatEvent(ev));
   } catch (err) {
      console.error('[circle] notifySlackEvent falhou:', err);
      return { sent: false, reason: 'error' };
   }
}
