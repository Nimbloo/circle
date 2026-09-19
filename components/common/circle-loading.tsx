'use client';

import { cn } from '@/lib/utils';

const LOGO_PX = { sm: 16, md: 24, lg: 32 } as const;

/** Janela em que um loader novo conta como continuação do anterior (mesma área). */
const CONTINUATION_MS = 400;
let visibleLoaders = 0;
let lastLoaderGoneAt = 0;

/**
 * Continuidade entre instâncias (vi#12): numa carga fria a mesma área troca de loader duas
 * ou três vezes (fallback da rota → tela → componente). Cada instância recomeçaria o giro
 * do zero e repetiria o fade de entrada — na tela, um loader piscando. Aqui o arco é
 * alinhado ao relógio do documento (`startTime = 0`, mesma fase em qualquer instância) e o
 * fade de entrada é pulado quando o loader anterior acabou de sair: uma instância só por
 * área, do ponto de vista de quem olha. Efeito só no navegador — o jsdom não tem WAAPI.
 */
function trackLoader(node: HTMLElement | null) {
   if (!node) return;
   const continuing = visibleLoaders > 0 || performance.now() - lastLoaderGoneAt < CONTINUATION_MS;
   visibleLoaders += 1;
   if (typeof node.getAnimations === 'function') {
      for (const animation of node.getAnimations({ subtree: true })) {
         const name = (animation as CSSAnimation).animationName;
         if (name === 'circle-loading-spin') animation.startTime = 0;
         else if (name === 'circle-loading-in' && continuing) animation.finish();
      }
   }
   return () => {
      visibleLoaders -= 1;
      if (visibleLoaders <= 0) {
         visibleLoaders = 0;
         lastLoaderGoneAt = performance.now();
      }
   };
}

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
            ref={trackLoader}
            role="status"
            aria-live="polite"
            aria-label={label ?? 'Carregando'}
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
         ref={trackLoader}
         role="status"
         aria-live="polite"
         aria-label={label ?? 'Carregando'}
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
