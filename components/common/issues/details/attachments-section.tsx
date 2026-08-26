'use client';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { FileText, Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface Attachment {
   id: string;
   name: string;
   contentType: string;
   size: number;
   url: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

function humanSize(bytes: number): string {
   if (bytes < 1024) return `${bytes} B`;
   if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
   return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readAsDataUrl(file: File): Promise<string> {
   return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
   });
}

/**
 * Anexos da issue ("Attach images, files, or videos", estilo Linear). Upload via
 * base64 (mesmo padrão do avatar) — backend real (`attachment`), servido por endpoint.
 * Imagens viram thumbnail; demais viram chip com nome + tamanho. `onChanged` refaz o
 * detail no pai.
 */
export function AttachmentsSection({
   issueId,
   attachments,
   onChanged,
}: {
   issueId: string;
   attachments: Attachment[];
   onChanged: () => void;
}) {
   const inputRef = useRef<HTMLInputElement>(null);
   const [busy, setBusy] = useState(false);

   const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // permite re-selecionar o mesmo arquivo
      if (!file) return;
      if (file.size > MAX_FILE_BYTES) {
         toast.error('Arquivo excede o tamanho máximo (5MB)');
         return;
      }
      if (/svg/i.test(file.type)) {
         toast.error('SVG não é suportado');
         return;
      }
      setBusy(true);
      try {
         const dataUrl = await readAsDataUrl(file);
         await api.issues.addAttachment(issueId, {
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            dataUrl,
         });
         onChanged();
      } catch {
         toast.error('Falha ao anexar (o storage pode não estar configurado)');
      } finally {
         setBusy(false);
      }
   };

   const remove = async (aid: string) => {
      try {
         await api.issues.removeAttachment(issueId, aid);
         onChanged();
      } catch {
         toast.error('Falha ao remover o anexo');
      }
   };

   return (
      <div>
         <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => void onPick(e)}
            accept="image/*,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.zip"
         />
         {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
               {attachments.map((a) =>
                  a.contentType.startsWith('image/') ? (
                     <a
                        key={a.id}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="group relative block size-20 overflow-hidden rounded-md border border-border/60"
                        title={a.name}
                     >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.name} className="size-full object-cover" />
                        <button
                           onClick={(e) => {
                              e.preventDefault();
                              void remove(a.id);
                           }}
                           className="absolute top-0.5 right-0.5 rounded bg-background/80 p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500"
                           aria-label="Remove attachment"
                        >
                           <X className="size-3" />
                        </button>
                     </a>
                  ) : (
                     <div
                        key={a.id}
                        className="group flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-sm min-w-0 max-w-xs"
                     >
                        <FileText className="size-4 text-muted-foreground shrink-0" />
                        <a
                           href={a.url}
                           target="_blank"
                           rel="noreferrer noopener"
                           className="truncate hover:underline"
                           title={a.name}
                        >
                           {a.name}
                        </a>
                        <span className="text-xs text-muted-foreground shrink-0">
                           {humanSize(a.size)}
                        </span>
                        <button
                           onClick={() => void remove(a.id)}
                           className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                           aria-label="Remove attachment"
                        >
                           <X className="size-3.5" />
                        </button>
                     </div>
                  )
               )}
            </div>
         )}
         <Button
            variant="ghost"
            size="xs"
            className="gap-1.5 text-muted-foreground -ml-1.5"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
         >
            <Paperclip className="size-3.5" />
            {busy ? 'Uploading…' : 'Attach'}
         </Button>
      </div>
   );
}
