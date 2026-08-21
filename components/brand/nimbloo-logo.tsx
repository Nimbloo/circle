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
 * Theme-aware Nimbloo wordmark.
 *
 * Uses `currentColor` for the mark and `text-foreground` for the name, so it
 * renders dark on light backgrounds and light on dark backgrounds automatically.
 *
 * {/* TODO: trocar pelo SVG oficial da Nimbloo *\/}
 */
export function NimblooLogo({ className, size = 24, markOnly = false }: NimblooLogoProps) {
   return (
      <span className={cn('inline-flex items-center gap-2 text-foreground', className)}>
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
