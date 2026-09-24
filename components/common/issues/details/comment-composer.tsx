'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/client';
import { ATTACHMENT_ACCEPT } from '@/lib/attachment-types';
import { attachmentRejection, filesOf, uploadAttachmentFiles } from '@/lib/attachments-client';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Paperclip } from 'lucide-react';
import {
   useEffect,
   useId,
   useImperativeHandle,
   useMemo,
   useRef,
   useState,
   type DragEvent,
   type Ref,
} from 'react';
import { toast } from 'sonner';
import { AttachmentChip } from './attachment-chip';
import { isCommentSubmitKey } from '@/lib/comment-submit-key';
import { textWithEmoticons } from '@/lib/comment-emoticons';
import { trimMentionSlug } from '@/lib/mentions';
import { COMMENT_COUNTER_FROM, COMMENT_MAX_LENGTH } from '@/lib/comment-limits';

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

/** Arquivo de um comentário JÁ criado: subindo, ou falhou e espera "Retry upload". */
interface CommentUpload extends PendingFile {
   commentId: string;
   status: 'uploading' | 'failed';
}

/** Altura máxima da autoexpansão (o resto rola dentro do textarea), como no Linear. */
const MAX_HEIGHT_PX = 320;

/** Rascunho por issue (e por thread, no reply): sobrevive à troca de issue na aba. */
const draftKey = (issueId: string, parentId: string | null) =>
   `circle:comment-draft:${issueId}:${parentId ?? 'root'}`;

function readDraft(key: string): string {
   try {
      return window.sessionStorage.getItem(key) ?? '';
   } catch {
      return '';
   }
}

function writeDraft(key: string, value: string): void {
   try {
      if (value) window.sessionStorage.setItem(key, value);
      else window.sessionStorage.removeItem(key);
   } catch {
      /* storage indisponível (aba privada, bloqueado): o rascunho só não persiste */
   }
}

/**
 * Autoexpansão: `field-sizing: content` (CSS) resolve sem medir nada; sem suporte,
 * ajusta a altura pelo `scrollHeight` — só no input, nunca por render.
 */
function fitHeight(el: HTMLTextAreaElement | null): void {
   if (!el) return;
   if (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')) return;
   el.style.height = 'auto';
   if (el.scrollHeight) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
}

/**
 * Composer de comentário com autocomplete de @menção (ao digitar "@" sugere membros do
 * workspace; selecionar insere "@slug") e anexos: clipe, Ctrl/Cmd+Shift+A, arrastar e
 * colar arquivo — os chips ficam no composer até enviar. Posta via api.issues.addComment,
 * sobe os anexos ligados ao comentário criado e chama onPosted (o pai refetch o feed).
 * Anexo que falha fica no composer com "Retry upload" (no mesmo comentário). O rascunho
 * é guardado por issue/thread na sessão e limpo ao enviar.
 */
export function CommentComposer({
   issueId,
   onPosted,
   parentId = null,
   placeholder = 'Leave a comment... (@ to mention)',
   autoFocus = false,
   onCancel,
   onSubmitStart,
   inputRef,
}: {
   issueId: string;
   /**
    * Comentário publicado (e, se havia arquivos, depois dos uploads — de novo a cada
    * "Retry upload" que suba algo). `failed` = arquivos que continuam no composer.
    */
   onPosted: (result?: { failed: number }) => void;
   /** Se definido, o comentário vira resposta a este comentário (threading). */
   parentId?: string | null;
   placeholder?: string;
   autoFocus?: boolean;
   onCancel?: () => void;
   /** Chamado ANTES do POST: o eco do SSE pode chegar antes da resposta. */
   onSubmitStart?: () => void;
   /** Expõe o textarea (o feed devolve o foco a ele depois de excluir um comentário). */
   inputRef?: Ref<HTMLTextAreaElement>;
}) {
   const users = useWorkspaceStore((s) => s.users);
   const key = draftKey(issueId, parentId);
   const [draft, setDraft] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
   const [active, setActive] = useState(0);
   const [files, setFiles] = useState<PendingFile[]>([]);
   const [uploads, setUploads] = useState<CommentUpload[]>([]);
   const [dragging, setDragging] = useState(false);
   const ref = useRef<HTMLTextAreaElement>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
   const seq = useRef(0);
   const listId = useId();
   useImperativeHandle(inputRef, () => ref.current as HTMLTextAreaElement, []);

   // Restaura o rascunho desta issue/thread (efeito, não estado inicial: o SSR não tem
   // sessionStorage). A escrita acontece no input, não num efeito — senão o render vazio
   // de antes da restauração apagava o rascunho guardado.
   useEffect(() => {
      const saved = readDraft(key);
      if (!saved) return;
      setDraft(saved);
      requestAnimationFrame(() => fitHeight(ref.current));
   }, [key]);

   const suggestions = useMemo(() => {
      if (!mention) return [];
      const q = mention.query;
      // Membros desativados (#100) não aparecem no `@`.
      const candidates = users.filter((u) => !u.deactivatedAt);
      // `@danilo.` com um `danilo` existente é a menção seguida de pontuação: a lista fecha
      // (senão Enter trocava por `danilo.simei`). Continuar digitando o slug reabre.
      const trimmed = trimMentionSlug(q);
      if (trimmed !== q && candidates.some((u) => slugOf(u) === trimmed)) return [];
      return candidates
         .filter((u) => u.name.toLowerCase().includes(q) || slugOf(u).includes(q))
         .slice(0, 6);
   }, [mention, users]);
   const open = !!mention && suggestions.length > 0;
   const optionId = (index: number) => `${listId}-opt-${index}`;

   const sync = (value: string) => {
      setDraft(value);
      writeDraft(key, value);
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
      writeDraft(key, next);
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

   /**
    * Sobe arquivos para um comentário já criado. Os que sobem saem do composer; os que
    * falham ficam (com "Retry upload"). Devolve quantos falharam.
    */
   const uploadTo = async (commentId: string, list: PendingFile[]): Promise<number> => {
      const ids = new Set(list.map((f) => f.id));
      setUploads((cur) => [
         ...cur.filter((u) => !ids.has(u.id)),
         ...list.map((f) => ({ ...f, commentId, status: 'uploading' as const })),
      ]);
      const idOf = new Map(list.map((f) => [f.file, f.id]));
      const { failed } = await uploadAttachmentFiles(
         issueId,
         list.map((f) => f.file),
         commentId,
         (file, ok) => {
            const id = idOf.get(file);
            setUploads((cur) =>
               ok
                  ? cur.filter((u) => u.id !== id)
                  : cur.map((u) => (u.id === id ? { ...u, status: 'failed' } : u))
            );
         }
      );
      for (const f of failed) toast.error(`${f.file.name}: ${f.error}`);
      return failed.length;
   };

   const submit = async () => {
      const text = draft.trim();
      if (!text || submitting) return;
      setSubmitting(true);
      onSubmitStart?.();
      let created: { id: string };
      try {
         created = await api.issues.addComment(issueId, text, parentId);
      } catch {
         toast.error('Could not post the comment');
         setSubmitting(false);
         return;
      }
      // Comentário criado: o composer já fica livre (rascunho limpo) enquanto os anexos
      // sobem — upload longo não o prende em "Posting…".
      const pending = files;
      setDraft('');
      writeDraft(key, '');
      setFiles([]);
      setMention(null);
      setSubmitting(false);
      if (ref.current) ref.current.style.height = '';
      const failed = pending.length ? await uploadTo(created.id, pending) : 0;
      onPosted({ failed });
   };

   /** Tenta de novo os anexos que falharam, no MESMO comentário (sem recriá-lo). */
   const retryUploads = async () => {
      const failed = uploads.filter((u) => u.status === 'failed');
      if (failed.length === 0) return;
      const byComment = new Map<string, PendingFile[]>();
      for (const u of failed)
         byComment.set(u.commentId, [
            ...(byComment.get(u.commentId) ?? []),
            { id: u.id, file: u.file },
         ]);
      let stillFailed = 0;
      for (const [commentId, list] of byComment) stillFailed += await uploadTo(commentId, list);
      if (stillFailed < failed.length) onPosted({ failed: stillFailed });
   };
   const hasFailedUploads = uploads.some((u) => u.status === 'failed');

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
         {open && (
            <div
               id={listId}
               role="listbox"
               aria-label="Mention suggestions"
               className="absolute bottom-full left-3 mb-1 w-64 max-h-56 overflow-y-auto rounded-lg border bg-popover shadow-lg z-20 py-1"
            >
               {suggestions.map((user, index) => (
                  <div
                     key={user.id}
                     id={optionId(index)}
                     role="option"
                     aria-selected={index === active}
                     onMouseDown={(event) => {
                        event.preventDefault();
                        insertMention(slugOf(user));
                     }}
                     className={cn(
                        'w-full flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm text-left',
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
                  </div>
               ))}
            </div>
         )}
         {/* aria-expanded no textbox: estado da lista de menções junto do campo (o textarea
             não pode virar `combobox` sem perder o multilinha). */}
         {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
         <textarea
            ref={ref}
            autoFocus={autoFocus}
            value={draft}
            aria-label={parentId ? 'Reply' : 'Comment'}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open ? optionId(active) : undefined}
            maxLength={COMMENT_MAX_LENGTH}
            onChange={(event) => {
               sync(textWithEmoticons(event));
               fitHeight(event.currentTarget);
            }}
            onPaste={(event) => {
               const pasted = filesOf(event.clipboardData?.files);
               if (pasted.length) {
                  event.preventDefault();
                  addFiles(pasted);
               }
            }}
            onKeyDown={(event) => {
               // Composição de IME (japonês, chinês, acentos no Safari): Enter/Tab confirmam
               // a composição — não escolhem a sugestão nem enviam.
               if (event.nativeEvent.isComposing || event.keyCode === 229) return;
               if (open) {
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
               // Tecla de envio conforme "Send comments on..." (Settings → Preferences).
               if (isCommentSubmitKey(event)) {
                  event.preventDefault();
                  void submit();
               }
            }}
            placeholder={placeholder}
            rows={2}
            // is#22: readOnly (e não disabled) durante o envio — desabilitar tira o foco do
            // textarea e ele ia parar no body; assim o próximo comentário já sai digitando.
            readOnly={submitting}
            aria-busy={submitting}
            // Cresce com o texto até ~320px (como no Linear); depois rola por dentro.
            className="field-sizing-content min-h-10 max-h-80 w-full resize-none overflow-y-auto bg-transparent outline-none text-sm placeholder:text-muted-foreground read-only:opacity-60"
         />
         {draft.length >= COMMENT_COUNTER_FROM && (
            <span
               aria-live="polite"
               className={cn(
                  'self-end text-xs tabular-nums',
                  draft.length >= COMMENT_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'
               )}
            >
               {draft.length}/{COMMENT_MAX_LENGTH}
            </span>
         )}
         {uploads.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
               {uploads.map((u) => (
                  <AttachmentChip
                     key={u.id}
                     item={{
                        id: u.id,
                        fileName: u.file.name,
                        contentType: u.file.type,
                        size: u.file.size,
                        uploading: u.status === 'uploading',
                     }}
                     confirmRemove={false}
                     onRemove={
                        u.status === 'failed'
                           ? () => setUploads((cur) => cur.filter((x) => x.id !== u.id))
                           : undefined
                     }
                  />
               ))}
               {hasFailedUploads && (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                     Upload failed
                     <Button size="xs" variant="ghost" onClick={() => void retryUploads()}>
                        Retry upload
                     </Button>
                  </span>
               )}
            </div>
         )}
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
