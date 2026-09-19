import { cn } from '@/lib/utils';

const LOGO_PX = { sm: 16, md: 24, lg: 32 } as const;

/** Comprimento do anel (r = 9): o arco em destaque cobre ~1/4 dele. */
const RING = 2 * Math.PI * 9;
const ARC = RING / 4;

/**
 * Loading padrão do app: a marca do Circle (anel + ponto central) com um arco girando
 * sobre o anel apagado — o logo é simétrico, girá-lo inteiro não mostraria movimento.
 * Server-compatible (sem estado). A animação vive em `app/globals.css`
 * (`.circle-loading`): aparece com atraso curto — carga rápida não pisca — e
 * `prefers-reduced-motion` deixa o arco parado.
 *
 * `inline`: variante para botões e linhas (span, sem coluna, herda a cor do texto).
 */
export function CircleLoading({
   label,
   size = 'md',
   inline = false,
   className,
}: {
   label?: string;
   size?: 'sm' | 'md' | 'lg';
   inline?: boolean;
   className?: string;
}) {
   const px = LOGO_PX[size];
   const mark = (
      <svg
         width={px}
         height={px}
         viewBox="0 0 24 24"
         fill="none"
         aria-hidden="true"
         className="circle-loading-mark shrink-0"
      >
         <circle
            data-part="track"
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="2.5"
            opacity="0.2"
         />
         <g data-part="arc" className="circle-loading-arc">
            <circle
               cx="12"
               cy="12"
               r="9"
               stroke="currentColor"
               strokeWidth="2.5"
               strokeLinecap="round"
               strokeDasharray={`${ARC} ${RING - ARC}`}
            />
         </g>
         <circle data-part="dot" cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
   );
   const text = label ? (
      <span className={inline ? undefined : 'text-[13px]'}>{label}</span>
   ) : (
      <span className="sr-only">Carregando</span>
   );

   if (inline) {
      return (
         <span
            role="status"
            aria-live="polite"
            data-size={size}
            className={cn('circle-loading inline-flex items-center gap-1.5', className)}
         >
            {mark}
            {text}
         </span>
      );
   }
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
         {mark}
         {text}
      </div>
   );
}
