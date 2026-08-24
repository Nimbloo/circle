'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar';
import { useSidebarSectionsStore } from '@/store/sidebar-sections-store';

/**
 * Grupo de sidebar COLAPSÁVEL pelo próprio label (estilo Linear): um chevron que gira e
 * expande/colapsa os itens da seção com animação suave. O estado persiste por-usuário.
 */
export function CollapsibleSidebarGroup({
   label,
   sectionKey,
   className,
   children,
}: {
   label: string;
   sectionKey: string;
   className?: string;
   children: React.ReactNode;
}) {
   const collapsed = useSidebarSectionsStore((s) => s.collapsed[sectionKey] ?? false);
   const toggle = useSidebarSectionsStore((s) => s.toggle);

   return (
      <SidebarGroup className={className}>
         <Collapsible open={!collapsed} onOpenChange={() => toggle(sectionKey)} className="group/section">
            <SidebarGroupLabel asChild>
               <CollapsibleTrigger className="w-full flex items-center gap-1 hover:text-foreground transition-colors">
                  <ChevronRight className="size-3 shrink-0 transition-transform duration-200 ease-out group-data-[state=open]/section:rotate-90" />
                  <span>{label}</span>
               </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
               {children}
            </CollapsibleContent>
         </Collapsible>
      </SidebarGroup>
   );
}
