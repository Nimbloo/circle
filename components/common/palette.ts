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

/** Cores NOMEADAS do catálogo de labels (seed) → tokens do tema (light e dark). */
const LABEL_NAMED_COLORS: Record<string, string> = {
   purple: 'var(--primary)',
   indigo: 'var(--primary)',
   red: 'var(--destructive)',
   green: 'var(--review-open)',
   yellow: 'var(--cycle-started)',
   orange: 'var(--chart-4)',
   pink: 'var(--chart-5)',
   blue: 'var(--chart-3)',
   cyan: 'var(--chart-2)',
   teal: 'var(--chart-2)',
   gray: 'var(--muted-foreground)',
};

/**
 * Cor de uma label para `style`: nome do catálogo vira token; cor custom (hex) passa
 * direto. Fonte única — as telas não mantêm mapas próprios.
 */
export function labelColor(color: string | null | undefined): string {
   if (!color) return 'var(--muted-foreground)';
   return LABEL_NAMED_COLORS[color] ?? color;
}
