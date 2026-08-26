'use client';

import * as React from 'react';
import { GripVerticalIcon } from 'lucide-react';
import * as ResizablePrimitive from 'react-resizable-panels';

import { cn } from '@/lib/utils';

function ResizablePanelGroup({
   className,
   ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
   return (
      <ResizablePrimitive.PanelGroup
         data-slot="resizable-panel-group"
         className={cn(
            'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
            className
         )}
         {...props}
      />
   );
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
   return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
   withHandle,
   className,
   ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
   withHandle?: boolean;
}) {
   return (
      <ResizablePrimitive.PanelResizeHandle
         data-slot="resizable-handle"
         className={cn(
            // Sem grip: só o cursor col-resize muda. `w-px` de largura visual, mas a
            // área de arraste real é expandida via `after` (9px) — invisível.
            'group relative w-px shrink-0 bg-transparent',
            'after:absolute after:inset-y-0 after:left-1/2 after:w-[9px] after:-translate-x-1/2',
            'focus-visible:outline-hidden',
            // Vertical (não usado hoje, mas mantém a hit-area coerente)
            'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-[9px] data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:translate-x-0',
            className
         )}
         {...props}
      >
         {/* Default: linha sólida simples (como era antes). */}
         <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-opacity duration-200 group-data-[resize-handle-state=hover]:opacity-0 group-data-[resize-handle-state=drag]:opacity-0 data-[panel-group-direction=vertical]:inset-x-0 data-[panel-group-direction=vertical]:inset-y-auto data-[panel-group-direction=vertical]:top-1/2 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:-translate-y-1/2 data-[panel-group-direction=vertical]:translate-x-0"
         />
         {/* Hover/drag: gradiente que DISSIPA o branco nas pontas (estilo Linear) — forte
             no miolo, transparente no topo/base. Crossfade a partir da linha sólida. */}
         <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-foreground/50 to-transparent opacity-0 transition-opacity duration-200 group-data-[resize-handle-state=hover]:opacity-100 group-data-[resize-handle-state=drag]:opacity-100 data-[panel-group-direction=vertical]:inset-x-0 data-[panel-group-direction=vertical]:inset-y-auto data-[panel-group-direction=vertical]:top-1/2 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:-translate-y-1/2 data-[panel-group-direction=vertical]:translate-x-0 data-[panel-group-direction=vertical]:bg-gradient-to-r"
         />
         {withHandle && (
            <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
               <GripVerticalIcon className="size-2.5" />
            </div>
         )}
      </ResizablePrimitive.PanelResizeHandle>
   );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
