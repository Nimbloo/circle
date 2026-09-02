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
            // Padrão Linear: linha fina que destaca (accent) no hover/drag; hit-area
            // maior via ::after pra facilitar a pega.
            'group bg-border relative flex w-px cursor-col-resize items-center justify-center transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-1.5 after:-translate-x-1/2 data-[resize-handle-state=hover]:bg-primary data-[resize-handle-state=drag]:bg-primary focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1.5 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90',
            className
         )}
         {...props}
      >
         {withHandle && (
            // Grip aparece só no hover/drag (Linear), não fixo.
            <div className="bg-primary text-primary-foreground z-10 flex h-4 w-3 items-center justify-center rounded-xs opacity-0 transition-opacity group-data-[resize-handle-state=hover]:opacity-100 group-data-[resize-handle-state=drag]:opacity-100">
               <GripVerticalIcon className="size-2.5" />
            </div>
         )}
      </ResizablePrimitive.PanelResizeHandle>
   );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
