/**
 * Identidade da ABA que faz uma mutação (If#16). O cliente manda o id em todo request
 * de escrita; o servidor o carimba no evento SSE (`clientId`) e a própria aba reconhece
 * o eco da sua mutação — sem refazer um GET do que a resposta do PATCH já trouxe.
 *
 * Um id por carregamento de página (módulo): cada aba tem o seu, e uma aba duplicada
 * (que copia o `sessionStorage`) não herda o da original.
 */
export const CLIENT_ID_HEADER = 'x-circle-client-id';

/** Formato aceito pelo servidor (o resto é descartado). */
export const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

let tabClientId: string | null = null;

function randomId(): string {
   const c = globalThis.crypto;
   if (c?.randomUUID) return c.randomUUID();
   return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Id desta aba (gerado na 1ª chamada). */
export function getClientId(): string {
   if (!tabClientId) tabClientId = randomId();
   return tabClientId;
}

/**
 * Mutações desta aba cujo resultado já foi (ou será) aplicado a partir da RESPOSTA
 * (If#16). O eco SSE da mesma aba para essa entidade é ignorado enquanto a marca vale —
 * sem o GET redundante. Só vale para eventos com o `clientId` desta aba: mudança de
 * outra aba/usuário na mesma entidade nunca é engolida.
 */
const OWN_ECHO_TTL_MS = 10_000;
const ownMarks = new Map<string, number>();

export function markOwnMutation(entity: string, id: string): void {
   ownMarks.set(`${entity}:${id}`, Date.now() + OWN_ECHO_TTL_MS);
}

/** O evento é o eco de uma mutação desta aba já tratada pela resposta. */
export function isOwnEcho(event: { entity?: string; id?: string; clientId?: string }): boolean {
   if (!event.clientId || event.clientId !== getClientId() || !event.entity || !event.id)
      return false;
   const key = `${event.entity}:${event.id}`;
   const until = ownMarks.get(key);
   if (until === undefined) return false;
   if (until < Date.now()) {
      ownMarks.delete(key);
      return false;
   }
   return true;
}

/** Evento originado nesta aba (tenha ou não marca): telas podem ignorar o próprio eco. */
export function isFromThisTab(event: { clientId?: string }): boolean {
   return !!event.clientId && event.clientId === getClientId();
}
