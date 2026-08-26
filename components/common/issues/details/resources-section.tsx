'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { FileText, Link as LinkIcon, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface Resource {
   id: string;
   kind: string;
   label: string;
   url: string;
}

/**
 * Seção "Resources" da issue (estilo Linear): Add link / Add document. Cada resource
 * é um label + URL externa. Backend real (`issue_resource`). `onChanged` refaz o fetch
 * do detail no pai (mesmo padrão de sub-issues/relations).
 */
export function ResourcesSection({
   issueId,
   resources,
   onChanged,
}: {
   issueId: string;
   resources: Resource[];
   onChanged: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [kind, setKind] = useState<'link' | 'document'>('link');
   const [label, setLabel] = useState('');
   const [url, setUrl] = useState('');
   const [busy, setBusy] = useState(false);

   const submit = async () => {
      if (!label.trim() || !url.trim() || busy) return;
      setBusy(true);
      try {
         await api.issues.addResource(issueId, { kind, label: label.trim(), url: url.trim() });
         setLabel('');
         setUrl('');
         setOpen(false);
         onChanged();
      } catch {
         toast.error('Falha ao adicionar resource (verifique a URL)');
      } finally {
         setBusy(false);
      }
   };

   const remove = async (rid: string) => {
      try {
         await api.issues.removeResource(issueId, rid);
         onChanged();
      } catch {
         toast.error('Falha ao remover resource');
      }
   };

   return (
      <div>
         <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Resources</h2>
            <Popover open={open} onOpenChange={setOpen}>
               <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="Add resource">
                     <Plus className="size-4" />
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-72 border-input p-3">
                  <div className="flex gap-1 mb-2">
                     <Button
                        variant={kind === 'link' ? 'secondary' : 'ghost'}
                        size="xs"
                        className="flex-1 gap-1.5"
                        onClick={() => setKind('link')}
                     >
                        <LinkIcon className="size-3.5" /> Link
                     </Button>
                     <Button
                        variant={kind === 'document' ? 'secondary' : 'ghost'}
                        size="xs"
                        className="flex-1 gap-1.5"
                        onClick={() => setKind('document')}
                     >
                        <FileText className="size-3.5" /> Document
                     </Button>
                  </div>
                  <Input
                     autoFocus
                     placeholder="Title"
                     value={label}
                     onChange={(e) => setLabel(e.target.value)}
                     className="mb-2 h-8"
                  />
                  <Input
                     placeholder="https://…"
                     value={url}
                     onChange={(e) => setUrl(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && void submit()}
                     className="mb-2 h-8"
                  />
                  <Button
                     size="xs"
                     className="w-full"
                     disabled={!label.trim() || !url.trim() || busy}
                     onClick={() => void submit()}
                  >
                     {busy ? 'Adding…' : `Add ${kind}`}
                  </Button>
               </PopoverContent>
            </Popover>
         </div>

         {resources.length > 0 && (
            <div className="mt-1 flex flex-col">
               {resources.map((r) => (
                  <div
                     key={r.id}
                     className="group flex items-center gap-2 h-9 px-2 -mx-2 rounded-md hover:bg-accent/40 text-sm min-w-0"
                  >
                     {r.kind === 'document' ? (
                        <FileText className="size-4 text-muted-foreground shrink-0" />
                     ) : (
                        <LinkIcon className="size-4 text-muted-foreground shrink-0" />
                     )}
                     <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="truncate hover:underline"
                     >
                        {r.label}
                     </a>
                     <button
                        onClick={() => void remove(r.id)}
                        className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                        aria-label="Remove resource"
                     >
                        <X className="size-3.5" />
                     </button>
                  </div>
               ))}
            </div>
         )}
      </div>
   );
}
