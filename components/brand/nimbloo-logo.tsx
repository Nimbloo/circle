import { cn } from '@/lib/utils';

interface NimblooLogoProps {
   /** Extra classes applied to the root element (controls color/size via text utilities). */
   className?: string;
   /** Size in pixels of the square mark. Defaults to 24. */
   size?: number;
   /** Hide the "Nimbloo" wordmark and render only the mark. */
   markOnly?: boolean;
}

/**
 * Logo Nimbloo theme-aware: **roxo no tema claro, branco no tema escuro** (igual ao
 * nimbloo-frontend). Cor via `text-[#6D28D9] dark:text-white`; mark e nome usam
 * `currentColor`. Passe `className` pra sobrescrever (ex.: `text-foreground`).
 *
 * {/* TODO: trocar pelo SVG oficial da Nimbloo *\/}
 */
export function NimblooLogo({ className, size = 24, markOnly = false }: NimblooLogoProps) {
   return (
      <span
         className={cn('inline-flex items-center gap-2 text-[#6D28D9] dark:text-white', className)}
      >
         <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
         >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="12" r="3.5" fill="currentColor" />
         </svg>
         {!markOnly && <span className="truncate font-semibold tracking-tight">Nimbloo</span>}
      </span>
   );
}
