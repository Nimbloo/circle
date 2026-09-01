'use client';

import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

/** Centered settings page: big title, optional description, stacked sections. */
export function SettingsShell({
   title,
   description,
   action,
   children,
}: {
   title: string;
   description?: string;
   action?: React.ReactNode;
   children: React.ReactNode;
}) {
   return (
      <div className="h-full w-full overflow-y-scroll">
         <div className="relative -left-[2.5px] mx-auto w-full max-w-[640px] py-16 pb-20 max-md:left-0 max-md:px-5 max-md:py-8">
            <div className="relative px-4 max-md:px-0">
               <div className="min-w-0">
                  <h1 className="text-2xl font-medium leading-8">{title}</h1>
                  {description && (
                     <p className="mt-1 text-[13px] leading-[22px] text-muted-foreground">
                        {description}
                     </p>
                  )}
               </div>
               {action && <div className="absolute right-4 top-0 max-md:right-0">{action}</div>}
            </div>
            <div className={cn('mt-8 flex flex-col gap-12', description && 'mt-[34px]')}>
               {children}
            </div>
         </div>
      </div>
   );
}

export function SettingsSection({
   title,
   description,
   action,
   children,
}: {
   title?: string;
   description?: React.ReactNode;
   action?: React.ReactNode;
   children: React.ReactNode;
}) {
   return (
      <section>
         {(title || action) && (
            <div className="flex items-end justify-between gap-4 px-4 max-md:px-0">
               <div>
                  {title && <h2 className="text-[15px] font-medium leading-[23px]">{title}</h2>}
                  {description && (
                     <p className="mt-0.5 text-[13px] leading-4 text-muted-foreground">
                        {description}
                     </p>
                  )}
               </div>
               {action}
            </div>
         )}
         <div className={cn('flex flex-col gap-3', (title || action) && 'mt-4')}>{children}</div>
      </section>
   );
}

export function SettingsCard({
   children,
   className,
}: {
   children: React.ReactNode;
   className?: string;
}) {
   return (
      <div
         className={cn(
            'divide-y divide-border/60 overflow-hidden rounded-[10px] bg-card',
            className
         )}
      >
         {children}
      </div>
   );
}

/** A single settings row: optional icon, title + description, trailing control. */
export function SettingsRow({
   icon,
   title,
   description,
   trailing,
   chevron,
   onClick,
   muted,
}: {
   icon?: React.ReactNode;
   title: React.ReactNode;
   description?: React.ReactNode;
   trailing?: React.ReactNode;
   chevron?: boolean;
   onClick?: () => void;
   muted?: boolean;
}) {
   const Comp = onClick ? 'button' : 'div';
   return (
      <Comp
         onClick={onClick}
         className={cn(
            'flex min-h-[60px] w-full items-center gap-3 px-4 py-[15.5px] text-left last:min-h-[66px]',
            onClick && 'cursor-pointer transition-colors hover:bg-accent/40',
            muted && 'opacity-60'
         )}
      >
         {icon && (
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground">
               {icon}
            </span>
         )}
         <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[13px] font-medium leading-4">{title}</div>
            {description && (
               <div className="mt-0.5 text-[13px] leading-4 text-muted-foreground">
                  {description}
               </div>
            )}
         </div>
         {trailing && (
            <div className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
               {trailing}
            </div>
         )}
         {chevron && <ChevronRight className="size-4 text-muted-foreground shrink-0" />}
      </Comp>
   );
}

/** Small functional select (local state) used across the settings pages. */
export function SelectMenu({
   options,
   defaultValue,
   value: controlledValue,
   onChange,
}: {
   options: string[];
   defaultValue?: string;
   /** Optional controlled value (e.g. wired to next-themes). */
   value?: string;
   onChange?: (value: string) => void;
}) {
   const [internal, setInternal] = useState(defaultValue ?? options[0]);
   const value = controlledValue ?? internal;
   return (
      <Select
         value={value}
         onValueChange={(nextValue) => {
            setInternal(nextValue);
            onChange?.(nextValue);
         }}
      >
         <SelectTrigger className="h-[30px] w-auto min-w-24 bg-accent px-2.5 hover:bg-accent/80">
            <SelectValue />
         </SelectTrigger>
         <SelectContent position="item-aligned" className="min-w-40">
            {options.map((option) => (
               <SelectItem key={option} value={option}>
                  {option}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}

/** "● Enabled ..." green-dot status text. */
export function EnabledDot({ children }: { children: React.ReactNode }) {
   return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
         <span className="size-1.5 shrink-0 rounded-full bg-[var(--online-indicator)]" />
         {children}
      </span>
   );
}
