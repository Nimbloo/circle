'use client';

import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { EMPTY_DOC, type EditorDoc } from '@/lib/editor-doc';
import { editorExtensions } from '@/lib/editor-extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import {
   Code,
   Heading1,
   Heading2,
   Heading3,
   Image as ImageIcon,
   List,
   ListChecks,
   ListOrdered,
   Minus,
   TextQuote,
   Type,
   type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { SlashCommand, type SlashItem } from './slash-command';

export interface BlockEditorProps {
   /** Documento a exibir. Trocas EXTERNAS (refetch) só entram enquanto o editor não tem foco. */
   doc: EditorDoc | null;
   editable?: boolean;
   placeholder?: string;
   /** A cada mudança, imediato (outline, contadores…). */
   onChange?: (doc: EditorDoc) => void;
   /** Persistência: com debounce de `saveDelayMs`, e flush no blur/unmount se houver pendência. */
   onSave?: (doc: EditorDoc) => void;
   saveDelayMs?: number;
   /** Editor pronto (foco programático, testes). */
   onReady?: (editor: Editor) => void;
   /** Upload de imagem (arrastar/colar/menu "/"): devolve a URL. Default: `POST /uploads`. */
   onUpload?: (file: File) => Promise<string>;
   className?: string;
}

function fileToDataUrl(file: File): Promise<string> {
   return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
   });
}

/** Upload padrão: S3 + CDN via a API (5 MB, `image/*`). */
async function uploadViaApi(file: File): Promise<string> {
   const dataUrl = await fileToDataUrl(file);
   const { url } = await api.uploads.create({
      dataUrl,
      contentType: file.type,
      fileName: file.name,
   });
   return url;
}

const SLASH_ICONS: Record<string, LucideIcon> = {
   paragraph: Type,
   heading1: Heading1,
   heading2: Heading2,
   heading3: Heading3,
   bulletList: List,
   orderedList: ListOrdered,
   taskList: ListChecks,
   codeBlock: Code,
   blockquote: TextQuote,
   divider: Minus,
   image: ImageIcon,
};

interface SlashState {
   items: SlashItem[];
   index: number;
   rect: DOMRect | null;
   command: (item: SlashItem) => void;
}

const SLASH_MENU_HEIGHT = 340;

/**
 * Editor de blocos (#16) — Tiptap sobre ProseMirror, com o mesmo conjunto de extensões
 * do servidor (`lib/editor-extensions.ts`). Só client: `immediatelyRender: false` evita
 * hydration mismatch no SSR (o editor nasce vazio e monta no cliente).
 *
 * Tipografia/cores do conteúdo vivem em `.ProseMirror` (app/globals.css), por token.
 */
export function BlockEditor({
   doc,
   editable = true,
   placeholder,
   onChange,
   onSave,
   saveDelayMs = 800,
   onReady,
   onUpload,
   className,
}: BlockEditorProps) {
   // Callbacks em refs: o editor é criado uma vez e não deve ser recriado quando o pai
   // re-renderiza com closures novas.
   const onChangeRef = useRef(onChange);
   const onSaveRef = useRef(onSave);
   const onReadyRef = useRef(onReady);
   const onUploadRef = useRef(onUpload);
   useEffect(() => {
      onChangeRef.current = onChange;
      onSaveRef.current = onSave;
      onReadyRef.current = onReady;
      onUploadRef.current = onUpload;
   });

   // Debounce do save + flush (blur/unmount) para não perder a última edição.
   const pendingRef = useRef<EditorDoc | null>(null);
   const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
   const flush = useCallback(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) onSaveRef.current?.(pending);
   }, []);
   const schedule = useCallback(
      (next: EditorDoc) => {
         pendingRef.current = next;
         if (timerRef.current) clearTimeout(timerRef.current);
         timerRef.current = setTimeout(flush, saveDelayMs);
      },
      [flush, saveDelayMs]
   );
   useEffect(() => flush, [flush]);

   // Menu "/" — estado em React, alimentado pelos hooks do Suggestion.
   const [slash, setSlash] = useState<SlashState | null>(null);
   const slashRef = useRef<SlashState | null>(null);
   useEffect(() => {
      slashRef.current = slash;
   }, [slash]);

   const extensions = useMemo(
      () => [
         ...editorExtensions({
            placeholder,
            upload: (file) => (onUploadRef.current ?? uploadViaApi)(file),
            onUploadError: (error) => {
               const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
               toast.error(`Falha ao enviar a imagem${detail}`);
            },
         }),
         SlashCommand.configure({
            suggestion: {
               render: () => {
                  const sync = (props: SuggestionProps<SlashItem, SlashItem>) =>
                     setSlash({
                        items: props.items,
                        index: 0,
                        rect: props.clientRect?.() ?? null,
                        command: props.command,
                     });
                  return {
                     onStart: sync,
                     onUpdate: sync,
                     onExit: () => setSlash(null),
                     onKeyDown: ({ event, view }) => {
                        const state = slashRef.current;
                        if (!state || state.items.length === 0) return false;
                        const len = state.items.length;
                        if (event.key === 'ArrowDown') {
                           setSlash({ ...state, index: (state.index + 1) % len });
                           return true;
                        }
                        if (event.key === 'ArrowUp') {
                           setSlash({ ...state, index: (state.index - 1 + len) % len });
                           return true;
                        }
                        if (event.key === 'Enter') {
                           state.command(state.items[state.index]);
                           return true;
                        }
                        if (event.key === 'Escape') {
                           exitSuggestion(view);
                           return true;
                        }
                        return false;
                     },
                  };
               },
            },
         }),
      ],
      [placeholder]
   );

   const editor = useEditor({
      extensions,
      content: doc ?? EMPTY_DOC,
      editable,
      immediatelyRender: false,
      onCreate: ({ editor: created }) => onReadyRef.current?.(created),
      onUpdate: ({ editor: updated }) => {
         const json = updated.getJSON();
         onChangeRef.current?.(json);
         if (onSaveRef.current) schedule(json);
      },
      onBlur: () => flush(),
   });

   useEffect(() => {
      if (editor && editor.isEditable !== editable) editor.setEditable(editable);
   }, [editor, editable]);

   // Doc externo (refetch/realtime): entra só sem foco, para não pisar no que o usuário
   // está digitando. Sem emitir update — não é uma edição do usuário.
   useEffect(() => {
      if (!editor || !doc || editor.isFocused) return;
      if (JSON.stringify(editor.getJSON()) === JSON.stringify(doc)) return;
      editor.commands.setContent(doc, { emitUpdate: false });
   }, [editor, doc]);

   const menuOpen = editable && slash !== null && slash.items.length > 0 && slash.rect !== null;

   return (
      <div className={cn('block-editor', className)} data-editable={editable}>
         <EditorContent editor={editor} />
         {menuOpen && typeof document !== 'undefined'
            ? createPortal(<SlashMenu state={slash} setState={setSlash} />, document.body)
            : null}
      </div>
   );
}

function SlashMenu({
   state,
   setState,
}: {
   state: SlashState;
   setState: (next: SlashState) => void;
}) {
   const rect = state.rect!;
   // Abre abaixo do cursor; acima quando não cabe na viewport.
   const flip = rect.bottom + SLASH_MENU_HEIGHT > window.innerHeight;
   const style = flip
      ? { position: 'fixed' as const, bottom: window.innerHeight - rect.top + 4, left: rect.left }
      : { position: 'fixed' as const, top: rect.bottom + 4, left: rect.left };

   return (
      <div
         role="listbox"
         aria-label="Insert block"
         style={style}
         className="z-50 w-56 rounded-xl border border-[var(--popover-border)] bg-popover p-1 text-popover-foreground shadow-[var(--popover-shadow)]"
      >
         {state.items.map((item, i) => {
            const Icon = SLASH_ICONS[item.id] ?? Type;
            const selected = i === state.index;
            return (
               <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  // mousedown (não click) para não tirar o foco do editor antes do comando.
                  onMouseDown={(event) => {
                     event.preventDefault();
                     state.command(item);
                  }}
                  onMouseEnter={() => setState({ ...state, index: i })}
                  className={cn(
                     'flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13px] outline-hidden select-none',
                     selected && 'bg-accent text-accent-foreground'
                  )}
               >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  {item.title}
               </button>
            );
         })}
      </div>
   );
}
