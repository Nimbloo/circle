/**
 * E-mail via AWS SES. Best-effort: no-op se CIRCLE_MAIL_FROM ausente, nunca lança.
 * Credenciais via IRSA (o SDK pega o web-identity token do pod automaticamente).
 * Nimbloo já usa SES; exige uma IAM role com ses:SendEmail anexada à SA do circle.
 */
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import type { SendResult } from './slack';

let client: SESClient | null = null;
function ses(): SESClient {
   if (!client) client = new SESClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
   return client;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<SendResult> {
   const from = process.env.CIRCLE_MAIL_FROM;
   if (!from) return { sent: false, reason: 'no-from' };
   try {
      await ses().send(
         new SendEmailCommand({
            Source: from,
            Destination: { ToAddresses: [to] },
            Message: {
               Subject: { Data: subject, Charset: 'UTF-8' },
               Body: { Html: { Data: html, Charset: 'UTF-8' } },
            },
         })
      );
      return { sent: true };
   } catch (err) {
      console.error('[circle] SES send falhou:', err);
      return { sent: false, reason: 'error' };
   }
}
