/**
 * Cores de progresso e health de planejamento (pl#12): sempre os tokens de
 * `app/globals.css`, nunca o hex do catálogo nem `chart-N`. Uma métrica, uma cor —
 * em gráfico, legenda, barra de timeline, board e menu.
 */
export const PROGRESS_COLORS = {
   scope: 'var(--progress-scope)',
   started: 'var(--progress-started)',
   completed: 'var(--progress-completed)',
} as const;

const HEALTH_COLORS: Record<string, string> = {
   'no-update': 'var(--health-no-update)',
   'on-track': 'var(--health-on-track)',
   'at-risk': 'var(--health-at-risk)',
   'off-track': 'var(--health-off-track)',
};

/** Cor do health pelo id (`on-track`, `at-risk`, `off-track`, `no-update`). */
export function healthColor(id: string | null | undefined): string {
   return (id && HEALTH_COLORS[id]) || 'var(--health-no-update)';
}
