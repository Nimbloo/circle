import { cn } from '@/lib/utils';

interface CircleLogoProps {
   /** Extra classes (controla cor via text utilities e tamanho). */
   className?: string;
   /** Tamanho em px do quadrado. Default 28. */
   size?: number;
}

/**
 * Logo do Circle: a marca de círculos concêntricos (anel + ponto central), igual ao
 * `public/images/icon.png` do template. Usa `currentColor` → adapta ao tema (foreground).
 */
export function CircleLogo({ className, size = 28 }: CircleLogoProps) {
   return (
      <svg
         width={size}
         height={size}
         viewBox="0 0 24 24"
         fill="none"
         xmlns="http://www.w3.org/2000/svg"
         aria-hidden="true"
         className={cn('shrink-0', className)}
      >
         <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
         <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
   );
}
