import { emailFromRequest } from '@/lib/api/auth';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { problem } from '@/lib/api/response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Heartbeat: comentário SSE a cada 25s mantém a conexão viva pelo LB/gateway. */
const HEARTBEAT_MS = 25_000;

/**
 * Stream SSE do barramento em tempo real. Mesmo gate de auth do resto da API
 * (sessão NextAuth) — probes (healthz/readyz) não passam por aqui.
 *
 * Cada mutação nos serviços publica um `CircleEvent`; o cliente (`useLiveSync`)
 * consome via `EventSource` e faz refetch coarse debounced do store afetado.
 */
export async function GET(req: Request): Promise<Response> {
   const email = await emailFromRequest(req);
   if (!email) return problem(401, 'Unauthorized', 'Não autenticado');

   const encoder = new TextEncoder();
   let unsubscribe: (() => void) | null = null;
   let heartbeat: ReturnType<typeof setInterval> | null = null;
   let onAbort: (() => void) | null = null;

   const cleanup = () => {
      if (unsubscribe) {
         unsubscribe();
         unsubscribe = null;
      }
      if (heartbeat) {
         clearInterval(heartbeat);
         heartbeat = null;
      }
      if (onAbort) {
         req.signal.removeEventListener('abort', onAbort);
         onAbort = null;
      }
   };

   const stream = new ReadableStream<Uint8Array>({
      start(controller) {
         const send = (chunk: string) => {
            try {
               controller.enqueue(encoder.encode(chunk));
            } catch {
               // controller já fechado (cliente desconectou) — limpa e para.
               cleanup();
            }
         };

         // Comentário SSE inicial: destrava o buffer do proxy e confirma a conexão.
         send(': connected\n\n');

         unsubscribe = subscribe((event: CircleEvent) => {
            send(`data: ${JSON.stringify(event)}\n\n`);
         });

         heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);

         // Abort do request (cliente fecha a aba) → libera subscriber + timer.
         onAbort = () => {
            cleanup();
            try {
               controller.close();
            } catch {
               // já fechado
            }
         };
         if (req.signal.aborted) onAbort();
         else req.signal.addEventListener('abort', onAbort);
      },
      cancel() {
         cleanup();
      },
   });

   return new Response(stream, {
      headers: {
         'Content-Type': 'text/event-stream',
         'Cache-Control': 'no-cache, no-transform',
         'Connection': 'keep-alive',
         'X-Accel-Buffering': 'no',
      },
   });
}
