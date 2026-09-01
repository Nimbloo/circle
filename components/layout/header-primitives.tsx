import React, { type ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function LocationBar({ className, ...props }: ComponentProps<'header'>) {
   return (
      <header
         data-slot="location-bar"
         className={cn(
            'flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-2',
            className
         )}
         {...props}
      />
   );
}

export function ViewBar({ className, ...props }: ComponentProps<'div'>) {
   return (
      <div
         data-slot="view-bar"
         className={cn(
            'flex h-[43px] shrink-0 items-center justify-between border-b border-border/40 px-2',
            className
         )}
         {...props}
      />
   );
}

export function HeaderGroup({ className, ...props }: ComponentProps<'div'>) {
   return <div className={cn('flex min-w-0 items-center gap-2', className)} {...props} />;
}

export function HeaderTitle({ className, ...props }: ComponentProps<'h2'>) {
   return <h2 className={cn('truncate text-[13px] font-medium', className)} {...props} />;
}

export function HeaderActions({ className, ...props }: ComponentProps<'div'>) {
   return <div className={cn('flex shrink-0 items-center gap-1', className)} {...props} />;
}
