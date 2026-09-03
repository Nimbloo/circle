'use client';

import { Button } from '@/components/ui/button';
import {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useDetailPanelStore, type DetailPanelKind } from '@/store/detail-panel-store';
import { PanelRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { create } from 'zustand';

interface DetailSheetState {
   /** Tipo cujo Sheet (mobile) está aberto; um só por vez. */
   openKind: DetailPanelKind | null;
   setOpenKind: (kind: DetailPanelKind | null) => void;
}

/**
 * Estado do Sheet mobile, separado do `detail-panel-store`: o trigger fica no cabeçalho
 * do conteúdo e o Sheet ao lado do `aside`, em subárvores diferentes — e abrir o Sheet
 * não deve mexer na preferência persistida do painel desktop.
 */
const useDetailSheetStore = create<DetailSheetState>((set) => ({
   openKind: null,
   setOpenKind: (kind) => set({ openKind: kind }),
}));

const KIND_LABEL: Record<DetailPanelKind, string> = {
   initiative: 'Initiative',
   project: 'Project',
   issue: 'Issue',
};

interface DetailSidePanelProps {
   kind: DetailPanelKind;
   /** Nome acessível do `aside` e título (sr-only) do Sheet. */
   title: string;
   description?: string;
   children: ReactNode;
   className?: string;
}

/**
 * Painel lateral de propriedades das páginas de detalhe (initiative, project, issue),
 * com paridade Linear: 400 px à direita no desktop (`xl`), sem coluna residual quando
 * fechado; no mobile vira um Sheet aberto pelo `DetailSidePanelTrigger`. O estado
 * aberto/fechado do desktop é o `detail-panel-store` (por tipo, persistido).
 */
export function DetailSidePanel({
   kind,
   title,
   description,
   children,
   className,
}: DetailSidePanelProps) {
   const open = useDetailPanelStore((s) => s.openByKind[kind]);
   const sheetOpen = useDetailSheetStore((s) => s.openKind === kind);
   const setOpenKind = useDetailSheetStore((s) => s.setOpenKind);

   return (
      <>
         <Sheet open={sheetOpen} onOpenChange={(next) => setOpenKind(next ? kind : null)}>
            <SheetContent className="w-[92vw] overflow-y-auto p-3 pt-12 sm:max-w-[400px]">
               <SheetHeader className="sr-only">
                  <SheetTitle>{title}</SheetTitle>
                  {description && <SheetDescription>{description}</SheetDescription>}
               </SheetHeader>
               {children}
            </SheetContent>
         </Sheet>

         {open && (
            <aside
               aria-label={title}
               className={cn(
                  'hidden h-full w-[400px] shrink-0 overflow-hidden pl-1 xl:flex',
                  className
               )}
            >
               {children}
            </aside>
         )}
      </>
   );
}

/**
 * Botão "Properties" do mobile (`xl:hidden`). O consumidor posiciona no canto superior
 * direito do cabeçalho do conteúdo — mesmo lugar em initiative, project e issue.
 */
export function DetailSidePanelTrigger({
   kind,
   className,
}: {
   kind: DetailPanelKind;
   className?: string;
}) {
   const setOpenKind = useDetailSheetStore((s) => s.setOpenKind);

   return (
      <Button
         type="button"
         size="xs"
         variant="outline"
         className={cn('gap-1.5 xl:hidden', className)}
         onClick={() => setOpenKind(kind)}
      >
         <PanelRight className="size-3.5" />
         Properties
      </Button>
   );
}

/** Toggle 28 × 28 do painel desktop; vai no header (ViewBar) das três páginas. */
export function DetailPanelToggle({ kind }: { kind: DetailPanelKind }) {
   const open = useDetailPanelStore((s) => s.openByKind[kind]);
   const toggle = useDetailPanelStore((s) => s.toggle);
   const label = KIND_LABEL[kind];

   return (
      <Button
         type="button"
         size="icon"
         variant="ghost"
         className="hidden size-7 xl:inline-flex"
         onClick={() => toggle(kind)}
         aria-label={open ? `Close ${label} details` : `Open ${label} details`}
         aria-expanded={open}
      >
         {open ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
      </Button>
   );
}
