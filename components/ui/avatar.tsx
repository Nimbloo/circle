'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '@/lib/utils';

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
   return (
      <AvatarPrimitive.Root
         data-slot="avatar"
         className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
         {...props}
      />
   );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
   return (
      <AvatarPrimitive.Image
         data-slot="avatar-image"
         className={cn('aspect-square size-full', className)}
         {...props}
      />
   );
}

/** Hash estável de string → hue [0,360) para cor determinística das iniciais. */
function hueFromString(seed: string): number {
   let h = 0;
   for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
   return h % 360;
}

function AvatarFallback({
   className,
   children,
   style,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
   // Iniciais em fundo colorido determinístico (padrão Slack/Google/Linear) quando o
   // conteúdo é texto e o caller NÃO definiu um `bg-*` próprio (ex.: cor de status).
   const seed = typeof children === 'string' ? children.trim() : '';
   const colorize = seed.length > 0 && !/(^|\s)bg-/.test(className ?? '');
   return (
      <AvatarPrimitive.Fallback
         data-slot="avatar-fallback"
         className={cn(
            'flex size-full items-center justify-center rounded-full',
            colorize ? 'font-medium text-white' : 'bg-muted',
            className
         )}
         style={
            colorize
               ? { backgroundColor: `hsl(${hueFromString(seed.toLowerCase())} 52% 48%)`, ...style }
               : style
         }
         {...props}
      >
         {children}
      </AvatarPrimitive.Fallback>
   );
}

export { Avatar, AvatarImage, AvatarFallback };
