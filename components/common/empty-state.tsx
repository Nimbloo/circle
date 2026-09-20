import { cn } from '@/lib/utils';
import { Activity, CircleDashed, ListFilter, Search } from 'lucide-react';

export type EmptyStateVariant = 'empty' | 'activity' | 'search' | 'filtered';

type IconComponent = React.ComponentType<{ className?: string }>;

const VARIANT_ICON: Record<EmptyStateVariant, IconComponent> = {
   empty: CircleDashed,
   activity: Activity,
   search: Search,
   filtered: ListFilter,
};

/**
 * Vazio de conteúdo de página/seção (não de combobox — lá fica o `CommandEmpty`).
 * Mesma linguagem do `ErrorState`: ícone num chip de card, título curto, descrição
 * opcional e ação só quando há próximo passo útil. Só aparece depois da primeira carga.
 */
export function EmptyState({
   variant = 'empty',
   icon,
   title,
   description,
   action,
   className,
}: {
   variant?: EmptyStateVariant;
   /** Sobrescreve o ícone da variante (ícone de domínio: Goal, Users, …). */
   icon?: IconComponent;
   title: string;
   description?: string;
   action?: React.ReactNode;
   className?: string;
}) {
   const Icon = icon ?? VARIANT_ICON[variant];
   return (
      <div
         role="status"
         data-variant={variant}
         className={cn(
            'content-enter mx-auto flex w-full max-w-sm flex-col items-center justify-center px-6 py-16 text-center',
            className
         )}
      >
         <div className="mb-4 flex size-10 items-center justify-center rounded-[10px] border bg-card text-muted-foreground shadow-[var(--card-shadow)]">
            <Icon className="size-[18px]" aria-hidden="true" />
         </div>
         <h3 className="text-sm font-medium text-foreground">{title}</h3>
         {description && (
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
         )}
         {action && <div className="mt-4">{action}</div>}
      </div>
   );
}
