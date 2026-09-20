'use client';

import { Fragment, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
   Sheet,
   SheetContent,
   SheetDescription,
   SheetHeader,
   SheetTitle,
} from '@/components/ui/sheet';
import { SHORTCUT_GROUPS, SHORTCUTS, shortcutAlternatives } from '@/lib/shortcuts';

/** Chip de tecla (mesma pele das dicas do ⌘K). */
export function Kbd({ children }: { children: React.ReactNode }) {
   return (
      <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted/50 px-1 font-sans text-[11px] text-muted-foreground">
         {children}
      </kbd>
   );
}

/** Uma alternativa: passos separados por "then" (G then I), tokens lado a lado. */
function KeySequence({ steps }: { steps: string[][] }) {
   return (
      <span className="flex items-center gap-1">
         {steps.map((tokens, index) => (
            <Fragment key={index}>
               {index > 0 && <span className="text-[11px] text-muted-foreground">then</span>}
               {tokens.map((token, t) => (
                  <Kbd key={t}>{token}</Kbd>
               ))}
            </Fragment>
         ))}
      </span>
   );
}

/**
 * Painel de atalhos (`?`) — paridade Linear: painel lateral com busca e os atalhos por
 * grupo. Lê a MESMA tabela do listener e do ⌘K (`lib/shortcuts.ts`).
 */
export function ShortcutsHelp({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const [query, setQuery] = useState('');
   const groups = useMemo(() => {
      const q = query.trim().toLowerCase();
      return SHORTCUT_GROUPS.map((group) => ({
         group,
         items: SHORTCUTS.filter(
            (s) => s.group === group && (!q || s.label.toLowerCase().includes(q))
         ),
      })).filter((g) => g.items.length > 0);
   }, [query]);

   return (
      <Sheet
         open={open}
         onOpenChange={(next) => {
            onOpenChange(next);
            if (!next) setQuery('');
         }}
      >
         <SheetContent side="right" className="flex w-[92vw] flex-col gap-0 p-0 sm:max-w-[380px]">
            <SheetHeader className="border-b border-border px-4 py-3">
               <SheetTitle className="text-[13px] font-medium">Keyboard shortcuts</SheetTitle>
               <SheetDescription className="sr-only">
                  Every keyboard shortcut available in the workspace
               </SheetDescription>
            </SheetHeader>
            <div className="flex items-center gap-2 border-b border-border px-4">
               <Search className="size-3.5 shrink-0 text-muted-foreground" />
               <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search shortcuts"
                  aria-label="Search shortcuts"
                  className="h-10 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
               />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
               {groups.length === 0 && (
                  <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">
                     No shortcuts found
                  </p>
               )}
               {groups.map(({ group, items }) => (
                  <section key={group} className="mb-3">
                     <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        {group}
                     </h3>
                     <ul>
                        {items.map((s) => (
                           <li
                              key={s.id}
                              className="flex h-8 items-center justify-between gap-3 rounded-md px-2 text-[13px] hover:bg-accent"
                           >
                              <span className="truncate">{s.label}</span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                 {shortcutAlternatives(s.id).map((steps, index) => (
                                    <Fragment key={index}>
                                       {index > 0 && (
                                          <span className="text-[11px] text-muted-foreground">
                                             or
                                          </span>
                                       )}
                                       <KeySequence steps={steps} />
                                    </Fragment>
                                 ))}
                              </span>
                           </li>
                        ))}
                     </ul>
                  </section>
               ))}
            </div>
         </SheetContent>
      </Sheet>
   );
}
