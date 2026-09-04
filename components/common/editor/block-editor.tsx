'use client';

import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import { EMPTY_DOC, type EditorDoc } from '@/lib/editor-doc';
import { editorExtensions } from '@/lib/editor-extensions';
import { IssueRef } from '@/lib/editor-issue-ref';
import { TaskItemExt, linkedIssueIdentifier } from '@/lib/editor-tasks';
import type { Issue } from '@/data/issues';
import { useCatalogStore } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { EditorContent, ReactNodeViewRenderer, useEditor, type Editor } from '@tiptap/react';
import { exitSuggestion, type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
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
   Video as VideoIcon,
   type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { IssueRefChip } from './issue-ref-chip';
import { SlashCommand, type SlashItem } from './slash-command';
import { TaskItemView } from './task-item-view';

/** Issue dona do documento — habilita converter item da checklist em sub-issue. */
export interface BlockEditorContext {
   issueId: string;
   teamId: string;
   projectId?: string | null;
}

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
   /** `compact`: altura mínima e tipografia menores (modais de criação). */
   variant?: 'default' | 'compact';
   className?: string;
   /**
    * Contexto da issue (detalhe): com ele, cada task item ganha "Create sub-issue"
    * (hover ou `Mod-Shift-O`) e o check de um item já convertido reflete a sub-issue.
    * Fixo por montagem — o editor não é recriado quando muda.
    */
   context?: BlockEditorContext;
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
   video: VideoIcon,
};

const MENU_HEIGHT = 340;
const ISSUE_SUGGESTIONS_MAX = 8;

/** Sugestões do `#`: identifier por prefixo ou título por texto, vindas do `issues-store`. */
export function searchIssueRefs(query: string, issues: Issue[]): Issue[] {
   const q = query.trim().toLowerCase();
   const hits = q
      ? issues.filter(
           (i) => i.identifier.toLowerCase().startsWith(q) || i.title.toLowerCase().includes(q)
        )
      : issues;
   return hits.slice(0, ISSUE_SUGGESTIONS_MAX);
}

/* ------------------------------ menu de sugestões ------------------------------ */

interface MenuState<T> {
   items: T[];
   index: number;
   rect: DOMRect | null;
   command: (item: T) => void;
}

/**
 * Estado React de um menu do Suggestion (`/` e `#`): o `render` alimenta o estado a partir
 * dos hooks do plugin e trata teclado; é estável (refs) para o editor não ser recriado.
 */
function useSuggestionMenu<T>() {
   const [state, setState] = useState<MenuState<T> | null>(null);
   const stateRef = useRef<MenuState<T> | null>(null);
   useEffect(() => {
      stateRef.current = state;
   }, [state]);

   const render = useCallback((): ReturnType<NonNullable<SuggestionOptions<T, T>['render']>> => {
      const sync = (props: SuggestionProps<T, T>) =>
         setState({
            items: props.items,
            index: 0,
            rect: props.clientRect?.() ?? null,
            command: props.command,
         });
      return {
         onStart: sync,
         onUpdate: sync,
         onExit: () => setState(null),
         onKeyDown: ({ event, view }) => {
            const current = stateRef.current;
            if (!current || current.items.length === 0) return false;
            const len = current.items.length;
            if (event.key === 'ArrowDown') {
               setState({ ...current, index: (current.index + 1) % len });
               return true;
            }
            if (event.key === 'ArrowUp') {
               setState({ ...current, index: (current.index - 1 + len) % len });
               return true;
            }
            if (event.key === 'Enter') {
               current.command(current.items[current.index]);
               return true;
            }
            if (event.key === 'Escape') {
               exitSuggestion(view);
               return true;
            }
            return false;
         },
      };
   }, []);

   return { state, setState, render };
}

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
   variant = 'default',
   className,
   context,
}: BlockEditorProps) {
   // Callbacks em refs: o editor é criado uma vez e não deve ser recriado quando o pai
   // re-renderiza com closures novas.
   const onChangeRef = useRef(onChange);
   const onSaveRef = useRef(onSave);
   const onReadyRef = useRef(onReady);
   const onUploadRef = useRef(onUpload);
   const contextRef = useRef(context);
   useEffect(() => {
      onChangeRef.current = onChange;
      onSaveRef.current = onSave;
      onReadyRef.current = onReady;
      onUploadRef.current = onUpload;
      contextRef.current = context;
   });
   const editorRef = useRef<Editor | null>(null);

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

   // Task item → sub-issue: cria a issue filha com o texto do item e troca o conteúdo
   // do item pelo chip `issueRef` (o check passa a seguir o status dela). O save
   // pendente é descarregado ANTES, para a descrição não voltar sem o item.
   const createSubIssueFromTaskItem = useCallback(
      async (pos: number) => {
         const editor = editorRef.current;
         const ctx = contextRef.current;
         if (!editor || !ctx) return;
         const item = editor.state.doc.nodeAt(pos);
         if (!item || item.type.name !== 'taskItem' || linkedIssueIdentifier(item)) return;
         const title = item.firstChild?.textContent.trim() ?? '';
         if (!title) {
            toast.error('Escreva o texto da tarefa antes de criar a sub-issue');
            return;
         }
         flush();
         try {
            const { statuses, priorities } = useCatalogStore.getState();
            const status =
               statuses.find((s) => s.id === 'to-do') ??
               statuses.find((s) => s.category === 'unstarted') ??
               statuses[0];
            const priority =
               priorities.find((p) => p.id === 'no-priority') ?? priorities[priorities.length - 1];
            const dto = await api.issues.create({
               teamId: ctx.teamId,
               projectId: ctx.projectId ?? null,
               parentId: ctx.issueId,
               title,
               statusId: status?.id ?? 'to-do',
               priorityId: priority?.id ?? 'no-priority',
            });
            await useIssuesStore.getState().applyRemote(dto.id);

            // O documento pode ter mudado enquanto a API respondia: reencontra o item
            // (mesma posição, senão o primeiro item não vinculado com o mesmo texto).
            const { doc } = editor.state;
            let target: { pos: number; node: typeof item } | null = null;
            const at = doc.nodeAt(pos);
            if (at?.type.name === 'taskItem' && at.firstChild?.textContent.trim() === title) {
               target = { pos, node: at };
            } else {
               doc.descendants((node, nodePos) => {
                  if (target) return false;
                  if (
                     node.type.name === 'taskItem' &&
                     !linkedIssueIdentifier(node) &&
                     node.firstChild?.textContent.trim() === title
                  ) {
                     target = { pos: nodePos, node };
                     return false;
                  }
                  return true;
               });
            }
            if (!target) return;
            const found: { pos: number; node: typeof item } = target;
            const paragraph = found.node.firstChild!;
            const from = found.pos + 2; // item + parágrafo: início do texto do 1º parágrafo
            const chip = editor.schema.nodes.issueRef.create({ identifier: dto.identifier });
            editor.view.dispatch(
               editor.state.tr.replaceWith(from, from + paragraph.content.size, chip)
            );
         } catch {
            toast.error('Falha ao criar sub-issue');
         }
      },
      [flush]
   );
   const createSubIssueRef = useRef(createSubIssueFromTaskItem);
   useEffect(() => {
      createSubIssueRef.current = createSubIssueFromTaskItem;
   }, [createSubIssueFromTaskItem]);
   const hasContext = context !== undefined;

   const slash = useSuggestionMenu<SlashItem>();
   const issueMenu = useSuggestionMenu<Issue>();

   // Vídeo pelo menu "/": popover inline com input de URL (Enter insere, Esc cancela),
   // ancorado no cursor. Substitui o `window.prompt`.
   const [videoAt, setVideoAt] = useState<{ top: number; left: number } | null>(null);
   const [videoUrl, setVideoUrl] = useState('');
   const [videoError, setVideoError] = useState<string | null>(null);
   const openVideoPrompt = useCallback(() => {
      let point = { top: 0, left: 0 };
      const current = editorRef.current;
      if (current) {
         try {
            const coords = current.view.coordsAtPos(current.state.selection.from);
            point = { top: coords.bottom, left: coords.left };
         } catch {
            // sem layout (jsdom/SSR): ancora no canto
         }
      }
      setVideoUrl('');
      setVideoError(null);
      setVideoAt(point);
   }, []);
   const closeVideoPrompt = useCallback((refocus: boolean) => {
      setVideoAt(null);
      setVideoError(null);
      if (refocus) editorRef.current?.commands.focus();
   }, []);
   // Recebe a URL do próprio input (não do estado): o Enter não depende do re-render
   // do `onChange` já ter acontecido.
   const insertVideo = useCallback(
      (raw: string) => {
         const src = raw.trim();
         if (!src) return;
         if (!editorRef.current?.commands.setVideo({ src })) {
            setVideoError('URL não suportada — use YouTube, Vimeo, Loom, .mp4 ou .webm');
            return;
         }
         closeVideoPrompt(true);
      },
      [closeVideoPrompt]
   );

   const extensions = useMemo(
      () => [
         ...editorExtensions({
            placeholder,
            upload: (file) => (onUploadRef.current ?? uploadViaApi)(file),
            onUploadError: (error) => {
               const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
               toast.error(`Falha ao enviar a imagem${detail}`);
            },
            // NodeView React só com contexto de issue (é onde a conversão faz sentido);
            // sem ele, o NodeView padrão do Tiptap.
            taskItem: hasContext
               ? TaskItemExt.extend({
                    addNodeView() {
                       return ReactNodeViewRenderer(TaskItemView, {
                          as: 'li',
                          attrs: ({ node }) => ({
                             'data-type': 'taskItem',
                             'data-checked': String(Boolean(node.attrs.checked)),
                          }),
                       });
                    },
                 }).configure({
                    onCreateSubIssue: (pos) => void createSubIssueRef.current(pos),
                 })
               : undefined,
            issueRef: IssueRef.extend({
               addNodeView() {
                  return ReactNodeViewRenderer(IssueRefChip);
               },
            }).configure({
               isKnownIdentifier: (identifier) =>
                  useIssuesStore.getState().issues.some((i) => i.identifier === identifier),
               suggestion: {
                  char: '#',
                  items: ({ query }) => searchIssueRefs(query, useIssuesStore.getState().issues),
                  command: ({ editor, range, props }) =>
                     editor
                        .chain()
                        .focus()
                        .insertContentAt(range, [
                           { type: 'issueRef', attrs: { identifier: props.identifier } },
                           { type: 'text', text: ' ' },
                        ])
                        .run(),
                  render: issueMenu.render as SuggestionOptions['render'],
               },
            }),
         }),
         SlashCommand.configure({
            suggestion: { render: slash.render },
            onVideo: openVideoPrompt,
         }),
      ],
      [placeholder, slash.render, issueMenu.render, hasContext, openVideoPrompt]
   );

   const editor = useEditor({
      extensions,
      content: doc ?? EMPTY_DOC,
      editable,
      immediatelyRender: false,
      onCreate: ({ editor: created }) => {
         editorRef.current = created;
         onReadyRef.current?.(created);
      },
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

   const canPortal = editable && typeof document !== 'undefined';
   const slashOpen = canPortal && slash.state !== null && slash.state.items.length > 0;
   const issueOpen = canPortal && issueMenu.state !== null && issueMenu.state.items.length > 0;

   return (
      <div
         className={cn('block-editor', className)}
         data-editable={editable}
         data-variant={variant}
      >
         <EditorContent editor={editor} />
         <Popover
            open={videoAt !== null}
            onOpenChange={(next) => {
               if (!next) closeVideoPrompt(true);
            }}
         >
            <PopoverAnchor asChild>
               <span
                  aria-hidden
                  className="pointer-events-none fixed"
                  style={{ top: videoAt?.top ?? 0, left: videoAt?.left ?? 0 }}
               />
            </PopoverAnchor>
            <PopoverContent
               align="start"
               sideOffset={4}
               className="w-80 p-2"
               // O editor pode reivindicar o foco logo depois do menu "/" (o comando que
               // abriu o popover chama `focus()`): fechar por "foco fora" tiraria o input
               // do usuário. Clique fora e Esc continuam fechando.
               onFocusOutside={(event) => event.preventDefault()}
            >
               <Input
                  autoFocus
                  aria-label="Video URL"
                  placeholder="Cole a URL do vídeo (YouTube, Vimeo, Loom, .mp4)"
                  value={videoUrl}
                  onChange={(event) => {
                     setVideoUrl(event.target.value);
                     setVideoError(null);
                  }}
                  onKeyDown={(event) => {
                     if (event.key === 'Enter') {
                        event.preventDefault();
                        insertVideo(event.currentTarget.value);
                     } else if (event.key === 'Escape') {
                        event.preventDefault();
                        closeVideoPrompt(true);
                     }
                  }}
                  className="h-8"
               />
               {videoError ? (
                  <p role="alert" className="mt-1.5 px-1 text-xs text-destructive">
                     {videoError}
                  </p>
               ) : null}
            </PopoverContent>
         </Popover>
         {slashOpen
            ? createPortal(
                 <SuggestionMenu
                    label="Insert block"
                    state={slash.state!}
                    setState={slash.setState}
                    keyOf={(item) => item.id}
                    renderItem={(item) => {
                       const Icon = SLASH_ICONS[item.id] ?? Type;
                       return (
                          <>
                             <Icon className="size-4 shrink-0 text-muted-foreground" />
                             {item.title}
                          </>
                       );
                    }}
                 />,
                 document.body
              )
            : null}
         {issueOpen
            ? createPortal(
                 <SuggestionMenu
                    label="Reference issue"
                    className="w-80"
                    state={issueMenu.state!}
                    setState={issueMenu.setState}
                    keyOf={(issue) => issue.id}
                    renderItem={(issue) => {
                       const StatusIcon = issue.status.icon;
                       return (
                          <>
                             <span className="inline-flex size-4 shrink-0 items-center justify-center">
                                <StatusIcon />
                             </span>
                             <span className="shrink-0 text-muted-foreground">
                                {issue.identifier}
                             </span>
                             <span className="truncate">{issue.title}</span>
                          </>
                       );
                    }}
                 />,
                 document.body
              )
            : null}
      </div>
   );
}

function SuggestionMenu<T>({
   label,
   className,
   state,
   setState,
   keyOf,
   renderItem,
}: {
   label: string;
   className?: string;
   state: MenuState<T>;
   setState: (next: MenuState<T>) => void;
   keyOf: (item: T) => string;
   renderItem: (item: T, selected: boolean) => ReactNode;
}) {
   // Sem retângulo (jsdom/sem layout) o menu ancora no canto; abre abaixo do cursor e
   // acima quando não cabe na viewport.
   const rect = state.rect ?? { top: 0, bottom: 0, left: 0 };
   const flip = rect.bottom + MENU_HEIGHT > window.innerHeight;
   const style = flip
      ? { position: 'fixed' as const, bottom: window.innerHeight - rect.top + 4, left: rect.left }
      : { position: 'fixed' as const, top: rect.bottom + 4, left: rect.left };

   return (
      <div
         role="listbox"
         aria-label={label}
         style={style}
         className={cn(
            'z-50 w-56 rounded-xl border border-[var(--popover-border)] bg-popover p-1 text-popover-foreground shadow-[var(--popover-shadow)]',
            className
         )}
      >
         {state.items.map((item, i) => {
            const selected = i === state.index;
            return (
               <button
                  key={keyOf(item)}
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
                  {renderItem(item, selected)}
               </button>
            );
         })}
      </div>
   );
}
