import { CircleLogo } from '@/components/brand/circle-logo';
import { cn } from '@/lib/utils';

const LOGO_PX = { sm: 16, md: 24, lg: 32 } as const;

/**
 * Loading com a marca do Circle. Server-compatible (sem estado). A animação vive em
 * `app/globals.css` (`.circle-loading`): aparece com atraso curto — navegação rápida não
 * pisca — e pulsa de leve; `prefers-reduced-motion` deixa o ícone estático.
 */
export function CircleLoading({
   label,
   size = 'md',
   className,
}: {
   label?: string;
   size?: 'sm' | 'md' | 'lg';
   className?: string;
}) {
   return (
      <div
         role="status"
         aria-live="polite"
         data-size={size}
         className={cn(
            'circle-loading flex flex-col items-center justify-center gap-3 text-muted-foreground',
            className
         )}
      >
         <CircleLogo size={LOGO_PX[size]} className="circle-loading-mark" />
         {label ? (
            <span className="text-[13px]">{label}</span>
         ) : (
            <span className="sr-only">Carregando</span>
         )}
      </div>
   );
}
