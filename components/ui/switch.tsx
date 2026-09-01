'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
   return (
      <SwitchPrimitive.Root
         data-slot="switch"
         className={cn(
            'peer relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent bg-transparent outline-none before:absolute before:left-0 before:top-[-2px] before:h-5 before:w-[30px] before:rounded-full before:bg-input before:transition-colors data-[state=checked]:before:bg-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            className
         )}
         {...props}
      >
         <SwitchPrimitive.Thumb
            data-slot="switch-thumb"
            className={cn(
               'pointer-events-none z-10 block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-2.5 data-[state=unchecked]:translate-x-0'
            )}
         />
      </SwitchPrimitive.Root>
   );
}

export { Switch };
