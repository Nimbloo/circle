/**
 * Durações do sistema de motion em ms, para timers em JS (desmontar depois da saída,
 * remover a linha depois do `list-exit`). Espelham os tokens `--dur-*` de `app/globals.css`
 * — mudou lá, muda aqui.
 */
export const MOTION_MS = {
   instant: 80,
   fast: 120,
   base: 160,
   modal: 200,
   sheet: 240,
   sheetExit: 180,
   content: 150,
} as const;
