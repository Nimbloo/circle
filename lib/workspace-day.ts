/**
 * Fuso do workspace para o "dia de hoje" do servidor (rollover e burn-up de ciclos).
 * Em UTC, um ciclo que termina no dia 14 fechava às 21h de Brasília do próprio dia 14.
 * Configurável por `CIRCLE_TIME_ZONE` (IANA); padrão `America/Sao_Paulo`.
 */
export function workspaceTimeZone(): string {
   return process.env.CIRCLE_TIME_ZONE?.trim() || 'America/Sao_Paulo';
}

/** Dia civil (`YYYY-MM-DD`) de `date` no fuso do workspace. */
export function workspaceDay(date: Date, timeZone: string = workspaceTimeZone()): string {
   // en-CA formata como YYYY-MM-DD.
   return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
   }).format(date);
}
