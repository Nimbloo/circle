/**
 * Slack via Incoming Webhook. Best-effort: no-op se SLACK_WEBHOOK_URL ausente,
 * nunca lança (não bloqueia a request). O usuário cria o webhook e provê a URL.
 */
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
      });
      return res.ok ? { sent: true } : { sent: false, reason: `http ${res.status}` };
   } catch (err) {
      console.error('[circle] Slack webhook falhou:', err);
      return { sent: false, reason: 'error' };
   }
}
