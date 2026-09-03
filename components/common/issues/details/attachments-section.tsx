'use client';

import type { Attachment } from '@/data/issue-details';
import { api } from '@/lib/client';
import { ATTACHMENT_ACCEPT } from '@/lib/attachment-types';
import { filesOf } from '@/lib/attachments-client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Paperclip, Plus } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { AttachmentChip, type AttachmentChipItem } from './attachment-chip';

/**
 * Seção "Attachments" do detalhe da issue (abaixo da descrição, acima de Sub-issues):
 * grade de chips (ícone por tipo, nome, tamanho, miniatura pra imagem), "Add attachment"
 * e drag-and-drop na seção. Remoção só pelo uploader/admin, com confirmação inline.
 * O upload em si vive no `useAttachmentUploader` (compartilhado com o colar na descrição).
 */
export function AttachmentsSection({
   attachments,
   pending,
   onAddFiles,
   onChanged,
}: {
   attachments: Attachment[];
   pending: AttachmentChipItem[];
   onAddFiles: (files: File[]) => void;
   onChanged: () => void;
}) {
   const me = useWorkspaceStore((s) => s.me);
   const inputRef = useRef<HTMLInputElement>(null);
   const [dragging, setDragging] = useState(false);

   const canRemove = (a: Attachment) => !!me && (me.admin || a.uploadedById === me.id);

   const remove = async (a: Attachment) => {
      try {
         await api.attachments.remove(a.id);
         onChanged();
      } catch {
         toast.error('Could not remove the attachment');
      }
   };

   const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = filesOf(e.dataTransfer?.files);
      if (files.length) onAddFiles(files);
   };

   const empty = attachments.length === 0 && pending.length === 0;

   return (
      <section
         aria-label="Attachments"
         onDragOver={(e) => {
            if (e.dataTransfer?.types.includes('Files')) {
               e.preventDefault();
               setDragging(true);
            }
         }}
         onDragLeave={() => setDragging(false)}
         onDrop={onDrop}
         className={cn(
            'mt-8 rounded-lg transition-colors',
            dragging && 'bg-accent/40 ring-1 ring-primary/40'
         )}
      >
         <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-medium">
               Attachments{' '}
               {attachments.length > 0 && (
                  <span className="text-muted-foreground">{attachments.length}</span>
               )}
            </h2>
            <button
               type="button"
               onClick={() => inputRef.current?.click()}
               className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
               <Plus className="size-3.5" />
               Add attachment
            </button>
            <input
               ref={inputRef}
               type="file"
               multiple
               accept={ATTACHMENT_ACCEPT}
               className="hidden"
               aria-label="Add attachment"
               onChange={(e) => {
                  const files = filesOf(e.target.files);
                  e.target.value = '';
                  if (files.length) onAddFiles(files);
               }}
            />
         </div>

         {empty ? (
            <p
               className={cn(
                  'flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground',
                  dragging && 'border-primary/50 text-foreground'
               )}
            >
               <Paperclip className="size-3.5" />
               Drop files here or paste them in the description.
            </p>
         ) : (
            <div className="flex flex-wrap gap-2">
               {attachments.map((a) => (
                  <AttachmentChip
                     key={a.id}
                     item={a}
                     onRemove={canRemove(a) ? () => remove(a) : undefined}
                  />
               ))}
               {pending.map((p) => (
                  <AttachmentChip key={p.id} item={p} />
               ))}
            </div>
         )}
      </section>
   );
}
