'use client';

import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/client';
import type { ProjectResource } from '@/data/project-details';
import { FileText, Link2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/** Domínio a partir de uma URL — vira o label default quando o usuário não dá um (padrão Linear). */
function domainOf(raw: string): string {
   try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      return u.hostname.replace(/^www\./, '');
   } catch {
      return raw;
   }
}
function normalizeUrl(raw: string): string {
   return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/**
 * Seção "Resources" do overview do projeto — mesma lógica do Linear:
 * "+ Add document or link" → menu (Create document / Add a link). "Add a link"
 * abre um input inline de URL (label = domínio quando vazio). Cada resource tem
 * um menu ⋮ (Edit label / Remove). Inline na div do projeto, sem prompt nativo.
 */
export function ProjectResources({
   projectId,
   resources,
   onChanged,
}: {
   projectId: string;
   resources: ProjectResource[];
   onChanged: () => void | Promise<void>;
}) {
   const [adding, setAdding] = useState(false);
   const [url, setUrl] = useState('');
   const [editingId, setEditingId] = useState<string | null>(null);
   const [editLabel, setEditLabel] = useState('');
   const [busy, setBusy] = useState(false);

   const addLink = async () => {
      const value = url.trim();
      if (!value || busy) return;
      setBusy(true);
      try {
         await api.projects.addResource(projectId, {
            url: normalizeUrl(value),
            label: domainOf(value),
         });
         setUrl('');
         setAdding(false);
         await onChanged();
      } catch {
         toast.error('Não foi possível adicionar o link');
      } finally {
         setBusy(false);
      }
   };

   const saveLabel = async (id: string) => {
      const value = editLabel.trim();
      if (!value || busy) return;
      setBusy(true);
      try {
         await api.projects.updateResource(projectId, id, { label: value });
         setEditingId(null);
         await onChanged();
      } catch {
         toast.error('Não foi possível renomear');
      } finally {
         setBusy(false);
      }
   };

   const remove = async (id: string) => {
      try {
         await api.projects.removeResource(projectId, id);
         await onChanged();
      } catch {
         toast.error('Não foi possível remover');
      }
   };

   return (
      <div className="flex min-h-7 items-start gap-3">
         <h3 className="w-24 shrink-0 py-1.5 text-[13px] font-medium leading-4 text-muted-foreground">
            Resources
         </h3>
         <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {resources.map((r) =>
               editingId === r.id ? (
                  <input
                     key={r.id}
                     value={editLabel}
                     onChange={(e) => setEditLabel(e.target.value)}
                     autoFocus
                     onBlur={() => setEditingId(null)}
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveLabel(r.id);
                        if (e.key === 'Escape') setEditingId(null);
                     }}
                     className="h-7 text-xs bg-transparent border rounded-md px-2 outline-none focus:border-ring"
                  />
               ) : (
                  <div
                     key={r.id}
                     className="group/res inline-flex items-center border rounded-md h-7 pl-2 pr-0.5 gap-1 hover:bg-accent/50 transition-colors"
                  >
                     <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs min-w-0"
                     >
                        <Link2 className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-48">{r.label}</span>
                     </a>
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <Button
                              size="icon"
                              variant="ghost"
                              className="size-5 shrink-0 opacity-0 group-hover/res:opacity-100 data-[state=open]:opacity-100"
                           >
                              <MoreHorizontal className="size-3.5" />
                           </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                           <DropdownMenuItem
                              onClick={() => {
                                 setEditLabel(r.label);
                                 setEditingId(r.id);
                              }}
                           >
                              <Pencil className="size-3.5 mr-2" /> Edit label
                           </DropdownMenuItem>
                           <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => remove(r.id)}
                           >
                              <Trash2 className="size-3.5 mr-2" /> Remove
                           </DropdownMenuItem>
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </div>
               )
            )}

            {adding ? (
               <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoFocus
                  placeholder="Paste a link…"
                  onBlur={() => {
                     if (!url.trim()) setAdding(false);
                  }}
                  onKeyDown={(e) => {
                     if (e.key === 'Enter') void addLink();
                     if (e.key === 'Escape') {
                        setUrl('');
                        setAdding(false);
                     }
                  }}
                  className="h-7 w-56 text-xs bg-transparent border rounded-md px-2 outline-none focus:border-ring"
               />
            ) : (
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <button className="inline-flex items-center gap-1 h-7 px-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors">
                        <Plus className="size-3.5" />
                        Add document or link…
                     </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                     <DropdownMenuItem disabled>
                        <FileText className="size-3.5 mr-2" /> Create document…
                        <span className="ml-2 text-[10px] text-muted-foreground">Soon</span>
                     </DropdownMenuItem>
                     <DropdownMenuItem
                        onClick={() => {
                           setUrl('');
                           setAdding(true);
                        }}
                     >
                        <Link2 className="size-3.5 mr-2" /> Add a link…
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            )}
         </div>
      </div>
   );
}
