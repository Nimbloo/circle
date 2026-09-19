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
