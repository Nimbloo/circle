'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { ATTACHMENT_ACCEPT } from '@/lib/attachment-types';
import { attachmentRejection, filesOf, uploadAttachmentFiles } from '@/lib/attachments-client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Paperclip } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { AttachmentChip } from './attachment-chip';

/** Slug do usuário: o real (do backend) quando disponível, senão o prefixo do e-mail. */
function slugOf(user: { email: string; slug?: string }): string {
   return (user.slug ?? user.email.split('@')[0]).toLowerCase();
}

/** Detecta o token de menção (@algo) imediatamente antes do caret. */
function mentionTokenAt(text: string, caret: number): { query: string; start: number } | null {
   const upto = text.slice(0, caret);
   const match = upto.match(/@([a-z0-9._-]*)$/i);
   if (!match) return null;
   return { query: match[1].toLowerCase(), start: caret - match[0].length };
}

interface PendingFile {
   id: string;
   file: File;
}

/**
 * Composer de comentário com autocomplete de @menção (ao digitar "@" sugere membros do
 * workspace; selecionar insere "@slug") e anexos: clipe, Ctrl/Cmd+Shift+A, arrastar e
 * colar arquivo — os chips ficam no composer até enviar. Posta via api.issues.addComment,
 * sobe os anexos ligados ao comentário criado e chama onPosted (o pai refetch o feed).
 */
export function CommentComposer({
   issueId,
   onPosted,
   parentId = null,
   placeholder = 'Leave a comment... (@ to mention)',
   autoFocus = false,
   onCancel,
}: {
   issueId: string;
   onPosted: () => void;
   /** Se definido, o comentário vira resposta a este comentário (threading). */
   parentId?: string | null;
   placeholder?: string;
   autoFocus?: boolean;
   onCancel?: () => void;
}) {
   const users = useWorkspaceStore((s) => s.users);
   const [draft, setDraft] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
   const [active, setActive] = useState(0);
   const [files, setFiles] = useState<PendingFile[]>([]);
   const [dragging, setDragging] = useState(false);
   const ref = useRef<HTMLTextAreaElement>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const seq = useRef(0);

   const suggestions = useMemo(() => {
      if (!mention) return [];
      const q = mention.query;
      return users
         .filter((u) => u.name.toLowerCase().includes(q) || slugOf(u).includes(q))
         .slice(0, 6);
   }, [mention, users]);

   const sync = (value: string) => {
      setDraft(value);
      const caret = ref.current?.selectionStart ?? value.length;
      setMention(mentionTokenAt(value, caret));
      setActive(0);
   };

   const insertMention = (slug: string) => {
      if (!mention) return;
      const el = ref.current;
      const caret = el?.selectionStart ?? draft.length;
      const before = draft.slice(0, mention.start);
      const after = draft.slice(caret);
      const inserted = `@${slug} `;
      const next = before + inserted + after;
      setDraft(next);
      setMention(null);
      requestAnimationFrame(() => {
         if (el) {
            const pos = before.length + inserted.length;
            el.focus();
            el.setSelectionRange(pos, pos);
         }
      });
   };

   /** Valida localmente (mesma allow-list do servidor) e enfileira como chip. */
   const addFiles = (incoming: File[]) => {
      const accepted: PendingFile[] = [];
      for (const file of incoming) {
         const reason = attachmentRejection(file);
         if (reason) toast.error(reason);
         else accepted.push({ id: `f${++seq.current}`, file });
      }
      if (accepted.length) setFiles((f) => [...f, ...accepted]);
   };

   const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = filesOf(e.dataTransfer?.files);
      if (dropped.length) addFiles(dropped);
   };

   const submit = async () => {
      const text = draft.trim();
      if (!text || submitting) return;
      setSubmitting(true);
      try {
         const created = await api.issues.addComment(issueId, text, parentId);
         if (files.length) {
            const { failed } = await uploadAttachmentFiles(
               issueId,
               files.map((f) => f.file),
               created.id
            );
            for (const f of failed) toast.error(`${f.file.name}: ${f.error}`);
         }
         setDraft('');
         setFiles([]);
         setMention(null);
         onPosted();
      } catch {
         toast.error('Could not post the comment');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div
         onDragOver={(e) => {
            if (e.dataTransfer?.types.includes('Files')) {
               e.preventDefault();
               setDragging(true);
            }
         }}
         onDragLeave={() => setDragging(false)}
         onDrop={onDrop}
         className={cn(
            'mt-3 rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-2 relative transition-colors',
            dragging && 'border-primary/50 bg-accent/40'
         )}
      >
         {mention && suggestions.length > 0 && (
            <div className="absolute bottom-full left-3 mb-1 w-64 max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-lg z-20 py-1">
               {suggestions.map((user, index) => (
                  <button
                     key={user.id}
                     type="button"
                     onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(slugOf(user));
                     }}
                     className={cn(
                        'w-full flex items-center gap-2 px-2.5 py-1.5 text-sm text-left',
                        index === active ? 'bg-accent' : 'hover:bg-accent/60'
                     )}
                  >
                     <Avatar className="size-5">
                        <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                        <AvatarFallback className="text-[9px]">{user.name[0]}</AvatarFallback>
                     </Avatar>
                     <span className="truncate">{user.name}</span>
                     <span className="ml-auto text-xs text-muted-foreground shrink-0">
                        @{slugOf(user)}
                     </span>
                  </button>
               ))}
            </div>
         )}
         <textarea
            ref={ref}
            autoFocus={autoFocus}
            value={draft}
            onChange={(event) => sync(event.target.value)}
            onPaste={(event) => {
               const pasted = filesOf(event.clipboardData?.files);
               if (pasted.length) {
                  event.preventDefault();
                  addFiles(pasted);
               }
            }}
            onKeyDown={(event) => {
               if (mention && suggestions.length > 0) {
                  if (event.key === 'ArrowDown') {
                     event.preventDefault();
                     setActive((a) => (a + 1) % suggestions.length);
                     return;
                  }
                  if (event.key === 'ArrowUp') {
                     event.preventDefault();
                     setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
                     return;
                  }
                  if (event.key === 'Enter' || event.key === 'Tab') {
                     event.preventDefault();
                     insertMention(slugOf(suggestions[active]));
                     return;
                  }
                  if (event.key === 'Escape') {
                     event.preventDefault();
                     setMention(null);
                     return;
                  }
               }
               if (
                  (event.metaKey || event.ctrlKey) &&
                  event.shiftKey &&
                  event.key.toLowerCase() === 'a'
               ) {
                  event.preventDefault();
                  fileInputRef.current?.click();
                  return;
               }
               if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  void submit();
               }
            }}
            placeholder={placeholder}
            rows={2}
            disabled={submitting}
            className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:opacity-60"
         />
         {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
               {files.map((f) => (
                  <AttachmentChip
                     key={f.id}
                     item={{
                        id: f.id,
                        fileName: f.file.name,
                        contentType: f.file.type,
                        size: f.file.size,
                     }}
                     confirmRemove={false}
                     onRemove={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))}
                  />
               ))}
            </div>
         )}
         <div className="flex items-center justify-between">
            <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               disabled={submitting}
               aria-label="Attach file"
               title="Attach file (Ctrl+Shift+A)"
               className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
               <Paperclip className="size-4" />
            </button>
            <input
               ref={fileInputRef}
               type="file"
               multiple
               accept={ATTACHMENT_ACCEPT}
               className="hidden"
               aria-label="Attach file"
               onChange={(event) => {
                  const picked = filesOf(event.target.files);
                  event.target.value = '';
                  if (picked.length) addFiles(picked);
               }}
            />
            <div className="flex items-center gap-2">
               {onCancel && (
                  <Button size="xs" variant="ghost" onClick={onCancel} disabled={submitting}>
                     Cancel
                  </Button>
               )}
               <Button
                  size="xs"
                  onClick={() => void submit()}
                  disabled={!draft.trim() || submitting}
               >
                  {submitting ? 'Posting…' : parentId ? 'Reply' : 'Comment'}
               </Button>
            </div>
         </div>
      </div>
   );
}
