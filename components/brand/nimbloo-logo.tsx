import { cn } from '@/lib/utils';

interface NimblooLogoProps {
   /** Extra classes applied to the root element (controls color/size via text utilities). */
   className?: string;
   /** Height in pixels of the mark. Defaults to 24. */
   size?: number;
   /** Hide the "nimbloo" wordmark and render only the mark (lupinha). */
   markOnly?: boolean;
}

/**
 * Logo Nimbloo theme-aware: **roxo (#642878) no tema claro, branco no tema escuro**
 * (igual ao nimbloo-frontend). O mark é a "lupinha" oficial (path canônico do
 * favicon/icon do nimbloo-frontend), colorida via `currentColor`. Passe `className`
 * pra sobrescrever a cor (ex.: `text-muted-foreground`).
 */
export function NimblooLogo({ className, size = 24, markOnly = false }: NimblooLogoProps) {
   // Path canônico ocupa (0,0)–(110,137); viewBox com 4u de margem evita crop dos arcos.
   const width = Math.round((size * 118) / 145);
   return (
      <span
         className={cn(
            'inline-flex items-center gap-1.5 text-[#642878] dark:text-white',
            className
         )}
      >
         <svg
            width={width}
            height={size}
            viewBox="-4 -4 118 145"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="shrink-0"
         >
            <path
               fill="currentColor"
               d="M6.67,137A6.67,6.67,0,0,1,2,125.65L48.39,79.22a6.65,6.65,0,0,1,4.71-2h0a6.68,6.68,0,0,1,4.72,2A38.56,38.56,0,1,0,46.63,49L64.37,31.25A6.66,6.66,0,0,1,75.75,36V51.85L96.64,31a6.66,6.66,0,0,1,9.42,9.42L73.8,72.65a6.66,6.66,0,0,1-11.38-4.71V52.05L46.1,68.37a6.66,6.66,0,0,1-11.15-3A51.88,51.88,0,1,1,53.4,93.06l-42,42A6.65,6.65,0,0,1,6.67,137Z"
            />
         </svg>
         {!markOnly && <span className="truncate font-semibold tracking-tight">nimbloo</span>}
      </span>
   );
}
