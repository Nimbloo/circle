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
import { MOTION_MS } from '@/lib/motion';
import { PanelRight, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { create } from 'zustand';

/**
 * A que largura o painel responde: à do viewport (`xl`, páginas de detalhe) ou à do
 * container mais próximo (`@3xl`/`@5xl`/`@7xl`, painel de issue dentro do Inbox, cujo
 * pane é redimensionável e bem mais estreito que a janela).
 */
type DetailPanelLayout = 'viewport' | 'container';

const DetailPanelLayoutContext = createContext<DetailPanelLayout>('viewport');

/**
 * Marca a subárvore como query container (`@container`) e faz o `DetailSidePanel`, o
 * `DetailSidePanelTrigger` e o `DetailPanelToggle` dentro dela responderem à largura
 * DESTE elemento, não à do viewport.
 */
export function DetailPanelContainer({
   className,
   children,
}: {
   className?: string;
   children: ReactNode;
}) {
   return (
      <DetailPanelLayoutContext.Provider value="container">
         <div className={cn('@container', className)}>{children}</div>
      </DetailPanelLayoutContext.Provider>
   );
}

/**
 * Classes responsivas por layout — a única diferença entre os dois modos. `aside` mostra o
 * painel; `open` é a largura do aside aberto (fechado ele vai a `w-0`, animado pelo
 * `.motion-panel`) e `content` a largura FIXA do conteúdo, que não reflui na animação.
 */
const LAYOUT_CLASSES: Record<
   DetailPanelLayout,
   { aside: string; open: string; content: string; trigger: string; toggle: string }
> = {
   viewport: {
      aside: 'xl:flex',
      open: 'w-[400px]',
      content: 'w-[400px]',
      trigger: 'xl:hidden',
      toggle: 'xl:inline-flex',
   },
   // Larguras dos degraus medidos no Linear: 16rem (@3xl) → 20rem (@5xl) → 400px (@7xl).
   container: {
      aside: '@3xl:flex',
      open: '@3xl:w-64 @5xl:w-80 @7xl:w-[400px]',
      content: 'w-64 @5xl:w-80 @7xl:w-[400px]',
      trigger: '@3xl:hidden',
      toggle: '@3xl:inline-flex',
   },
};

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
   member: 'Member',
};

interface DetailSidePanelProps {
   kind: DetailPanelKind;
   /** Nome acessível do `aside` e título (sr-only) do Sheet. */
   title: string;
   description?: string;
   children: ReactNode;
   /** Classes do contêiner do conteúdo (largura fixa, `flex`). */
   className?: string;
}

/**
 * Painel lateral de propriedades das páginas de detalhe (initiative, project, issue,
 * member), com paridade Linear: 400 px à direita no desktop (`xl`), sem coluna residual
 * quando fechado; no mobile vira um Sheet aberto pelo `DetailSidePanelTrigger`. O estado
 * aberto/fechado do desktop é o `detail-panel-store` (por tipo, persistido). Dentro de
 * um `DetailPanelContainer` os degraus são do container, não do viewport.
 *
 * O `aside` fica SEMPRE montado: abrir/fechar anima a largura (0 ↔ 400 px, 200 ms,
 * `.motion-panel`) e o conteúdo, com largura fixa, desliza sem refluir nem remontar
 * (sem refetch nem pulo ao reabrir). Fechado, sai da árvore acessível (`aria-hidden` +
 * `inert`).
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
   const layout = useContext(DetailPanelLayoutContext);

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

         <aside
            aria-label={title}
            aria-hidden={open ? undefined : true}
            inert={!open}
            data-state={open ? 'open' : 'closed'}
            className={cn(
               'motion-panel hidden h-full shrink-0 overflow-hidden',
               LAYOUT_CLASSES[layout].aside,
               open ? LAYOUT_CLASSES[layout].open : 'w-0'
            )}
         >
            <div
               className={cn(
                  'flex h-full shrink-0 pl-1',
                  LAYOUT_CLASSES[layout].content,
                  className
               )}
            >
               {children}
            </div>
         </aside>
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
   const layout = useContext(DetailPanelLayoutContext);

   return (
      <Button
         type="button"
         size="xs"
         variant="outline"
         className={cn('gap-1.5', LAYOUT_CLASSES[layout].trigger, className)}
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
   const layout = useContext(DetailPanelLayoutContext);
   const label = KIND_LABEL[kind];

   return (
      <Button
         type="button"
         size="icon"
         variant="ghost"
         className={cn('hidden size-7', LAYOUT_CLASSES[layout].toggle)}
         onClick={() => toggle(kind)}
         aria-label={open ? `Close ${label} details` : `Open ${label} details`}
         aria-expanded={open}
      >
         {open ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
      </Button>
   );
}

/**
 * Painel lateral de lista (insights, breakdowns): mesma animação de largura do
 * `DetailSidePanel` (`.motion-panel`, 0 ↔ `width` px em 200 ms) com o conteúdo em largura
 * fixa. Diferente dele, o conteúdo só existe aberto — e durante a saída, até a largura
 * chegar a 0 —, porque painéis como o de insights recalculam sobre a lista inteira.
 * `className` vai no aside (ex.: `hidden lg:flex`); `panelClassName`, no conteúdo (borda,
 * fundo): no aside fechado a borda deixaria uma linha de 1 px.
 */
export function SidePanelSlot({
   open,
   width,
   label,
   className,
   panelClassName,
   children,
}: {
   open: boolean;
   width: number;
   label?: string;
   className?: string;
   panelClassName?: string;
   children: ReactNode;
}) {
   const [present, setPresent] = useState(open);
   if (open && !present) setPresent(true);

   useEffect(() => {
      if (open || !present) return;
      const timer = setTimeout(() => setPresent(false), MOTION_MS.modal);
      return () => clearTimeout(timer);
   }, [open, present]);

   return (
      <aside
         data-slot="side-panel-slot"
         data-state={open ? 'open' : 'closed'}
         aria-label={label}
         aria-hidden={open ? undefined : true}
         inert={!open}
         className={cn('motion-panel h-full shrink-0 overflow-hidden', className)}
         style={{ width: open ? width : 0 }}
      >
         {present && (
            <div className={cn('flex h-full shrink-0', panelClassName)} style={{ width }}>
               {children}
            </div>
         )}
      </aside>
   );
}
