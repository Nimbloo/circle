'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import { FileText, Link as LinkIcon, Plus, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
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
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [open, setOpen] = useState(false);
   // 'menu' = escolha inicial (Add link / Add document); 'link' = form de URL.
   const [mode, setMode] = useState<'menu' | 'link'>('menu');
   const [label, setLabel] = useState('');
   const [url, setUrl] = useState('');
   const [busy, setBusy] = useState(false);

   const reset = () => {
      setMode('menu');
      setLabel('');
      setUrl('');
   };

   // Add link: form com URL externa.
   const submit = async () => {
      if (!label.trim() || !url.trim() || busy) return;
      setBusy(true);
      try {
         await api.issues.addResource(issueId, { kind: 'link', label: label.trim(), url: url.trim() });
         setOpen(false);
         reset();
         onChanged();
      } catch {
         toast.error('Falha ao adicionar link (verifique a URL)');
      } finally {
         setBusy(false);
      }
   };

   // Add document: cria o documento, linka na issue como resource e REDIRECIONA
   // para o editor (estilo Linear — o document é uma entidade própria).
   const createDocument = async () => {
      if (busy) return;
      setBusy(true);
      try {
         const doc = await api.documents.create();
         const href = `/${orgId ?? 'nimbloo'}/document/${doc.id}`;
         await api.issues.addResource(issueId, {
            kind: 'document',
            label: doc.title,
            url: href,
         });
         setOpen(false);
         reset();
         // Navega para o editor do documento. NÃO chamamos onChanged aqui (refetch do
         // detail dispara re-render que cancelava o router.push) — o resource já está
         // linkado e aparece quando o usuário voltar.
         router.push(href);
      } catch {
         toast.error('Falha ao criar o documento');
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
            <Popover
               open={open}
               onOpenChange={(o) => {
                  setOpen(o);
                  if (!o) reset();
               }}
            >
               <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground" aria-label="Add resource">
                     <Plus className="size-4" />
                  </Button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-72 border-input p-1.5">
                  {mode === 'menu' ? (
                     // Passo 1: escolha distinta entre link e document (estilo Linear)
                     <div className="flex flex-col">
                        <button
                           type="button"
                           onClick={() => setMode('link')}
                           className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60 text-left"
                        >
                           <LinkIcon className="size-4 text-muted-foreground" /> Add link
                        </button>
                        <button
                           type="button"
                           onClick={() => void createDocument()}
                           disabled={busy}
                           className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60 text-left disabled:opacity-50"
                        >
                           <FileText className="size-4 text-muted-foreground" /> Add document
                        </button>
                     </div>
                  ) : (
                     // Passo 2: form de link (document é criado direto, sem form)
                     <div className="p-1.5">
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                           <LinkIcon className="size-3.5" />
                           Add link
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
                        <div className="flex gap-1.5">
                           <Button
                              variant="ghost"
                              size="xs"
                              className="flex-1"
                              onClick={reset}
                           >
                              Back
                           </Button>
                           <Button
                              size="xs"
                              className="flex-1"
                              disabled={!label.trim() || !url.trim() || busy}
                              onClick={() => void submit()}
                           >
                              {busy ? 'Adding…' : `Add ${mode}`}
                           </Button>
                        </div>
                     </div>
                  )}
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
