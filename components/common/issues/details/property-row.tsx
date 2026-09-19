'use client';

import { cn } from '@/lib/utils';
import type { ReactNode, Ref } from 'react';

/**
 * Linha de propriedade no padrão Linear (is#13): 32 px de altura, rótulo de 13 px em
 * muted numa coluna de 96 px e o valor à esquerda, como botão fantasma. Usada no painel
 * da issue e reutilizável nos demais painéis de propriedade.
 */
export function PropertyRow({
   label,
   children,
   className,
}: {
   label: string;
   children: ReactNode;
   className?: string;
}) {
   return (
      <div
         data-property-row={label}
         className={cn('flex min-h-8 items-center gap-2 text-[13px]', className)}
      >
         <span className="w-24 shrink-0 text-[13px] text-muted-foreground">{label}</span>
         <div className="flex min-w-0 flex-1 items-center">{children}</div>
      </div>
   );
}

/** Pele do valor: botão fantasma de 28 px, raio 6, hover `bg-accent`. */
export const propertyValueClass =
   'inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left text-[13px] transition-colors hover:bg-accent disabled:opacity-40';

/**
 * Botão de valor de uma propriedade. Sem valor, mostra "Add X" em muted (o padrão do
 * Linear para propriedade vazia).
 */
export function PropertyValue({
   ref,
   empty,
   placeholder,
   icon,
   children,
   className,
   ...props
}: {
   ref?: Ref<HTMLButtonElement>;
   /** true = sem valor: usa o `placeholder` em muted. */
   empty?: boolean;
   placeholder: string;
   icon?: ReactNode;
   children?: ReactNode;
   className?: string;
} & React.ComponentProps<'button'>) {
   return (
      <button
         ref={ref}
         type="button"
         className={cn(propertyValueClass, empty && 'text-muted-foreground', className)}
         {...props}
      >
         {icon}
         <span className="truncate">{empty ? placeholder : children}</span>
      </button>
   );
}
