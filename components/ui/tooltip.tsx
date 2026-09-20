'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

/**
 * Tooltip no padrão do sistema de motion: aparece após 300 ms de hover e sem "skip" (cada
 * trigger espera o seu atraso), entra em 160 ms e sai em 120 ms (`.motion-pop`).
 */
function TooltipProvider({
   delayDuration = 300,
   skipDelayDuration = 0,
   ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
   return (
      <TooltipPrimitive.Provider
         data-slot="tooltip-provider"
         delayDuration={delayDuration}
         skipDelayDuration={skipDelayDuration}
         {...props}
      />
   );
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
   return (
      <TooltipProvider>
         <TooltipPrimitive.Root data-slot="tooltip" {...props} />
      </TooltipProvider>
   );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
   return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
   className,
   sideOffset = 8,
   children,
   ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
   return (
      <TooltipPrimitive.Portal>
         <TooltipPrimitive.Content
            data-slot="tooltip-content"
            sideOffset={sideOffset}
            className={cn(
               'motion-pop bg-popover text-popover-foreground z-50 w-fit rounded-lg border border-[var(--popover-border)] px-2.5 py-1.5 text-xs text-balance shadow-[var(--popover-shadow)]',
               className
            )}
            {...props}
         >
            {children}
         </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
   );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
