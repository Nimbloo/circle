/**
 * Cores de prioridade e health para quem precisa da cor como valor (fill de gráfico,
 * `style`). Os valores vivem em `app/globals.css` (`--priority-*`, `--health-*`), com
 * light e dark; aqui só o mapa id → token, para as telas não divergirem.
 */
export const PRIORITY_COLORS: Record<string, string> = {
   'no-priority': 'var(--priority-none)',
   'urgent': 'var(--priority-urgent)',
   'high': 'var(--priority-high)',
   'medium': 'var(--priority-medium)',
   'low': 'var(--priority-low)',
};

export const HEALTH_COLORS: Record<string, string> = {
   'no-update': 'var(--health-no-update)',
   'on-track': 'var(--health-on-track)',
   'at-risk': 'var(--health-at-risk)',
   'off-track': 'var(--health-off-track)',
};
