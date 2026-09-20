'use client';

import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { ErrorState } from '@/components/common/error-state';
import { LoadingArea } from '@/components/common/loading-area';
import {
   HeaderActions,
   HeaderGroup,
   HeaderTitle,
   LocationBar,
} from '@/components/layout/header-primitives';
import { api, ApiError } from '@/lib/client';
import type { DocumentDetailDto } from '@/lib/api/documents';
import type { EditorDoc } from '@/lib/editor-doc';
import { errorReason } from '@/lib/error-reason';
import { DOCUMENT_CHANGED_EVENT, useLiveReload } from '@/lib/use-live-sync';
import { useWorkspaceStore } from '@/store/workspace-store';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

type Status = 'loading' | 'ready' | 'error' | 'notfound';

/**
 * Página do documento do time: título editável + corpo no editor de blocos (o mesmo da
 * descrição de issue/projeto). Autosave com concorrência otimista: cada save manda a
 * `descriptionVersion` vista; 409 = alguém gravou no meio → recarrega a versão dela e
 * remonta o editor em vez de sobrescrever.
 */
export default function TeamDocumentView({
   teamId,
   documentId,
}: {
   teamId: string;
   documentId: string;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const me = useWorkspaceStore((s) => s.me);
   const team = useWorkspaceStore((s) => s.teams.find((t) => t.id === teamId));

   const [status, setStatus] = useState<Status>('loading');
   const [doc, setDoc] = useState<DocumentDetailDto | null>(null);
   const [nameDraft, setNameDraft] = useState<string | null>(null);
   const [editorEpoch, setEditorEpoch] = useState(0);
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [deleteBusy, setDeleteBusy] = useState(false);
   const versionRef = useRef<string | null>(null);
   const saveQueue = useRef<Promise<void>>(Promise.resolve());
   const editorBoxRef = useRef<HTMLDivElement>(null);

   const listHref = `/${orgId}/team/${teamId}/documents`;
   const canEditMeta = Boolean(me && doc && (me.admin || doc.creator?.id === me.id));

   const editing = () =>
      Boolean(
         editorBoxRef.current?.querySelector('.ProseMirror')?.contains(document.activeElement)
      );

   /** Aplica o documento vindo do servidor; a versão só é adotada fora da digitação. */
   const adopt = useCallback((next: DocumentDetailDto, force = false) => {
      setDoc(next);
      if (force || versionRef.current === null || !editing())
         versionRef.current = next.descriptionVersion;
   }, []);

   const load = useCallback(async () => {
      setStatus('loading');
      try {
         const next = await api.documents.get(documentId);
         versionRef.current = null;
         adopt(next, true);
         setStatus('ready');
      } catch (e) {
         setStatus(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error');
      }
   }, [documentId, adopt]);

   useEffect(() => {
      void load();
   }, [load]);

   // Outra pessoa editou/renomeou/excluiu: recarrega em silêncio (a tela segue na tela).
   useLiveReload(
      DOCUMENT_CHANGED_EVENT,
      { id: documentId },
      async () => {
         try {
            adopt(await api.documents.get(documentId));
         } catch (e) {
            if (e instanceof ApiError && e.status === 404) setStatus('notfound');
         }
      },
      { ignoreOwn: true }
   );

   const saveBody = (next: EditorDoc) => {
      saveQueue.current = saveQueue.current.then(async () => {
         try {
            const dto = await api.documents.update(documentId, {
               descriptionDoc: next,
               expectedDescriptionVersion: versionRef.current,
            });
            versionRef.current = dto.descriptionVersion;
            setDoc(dto);
         } catch (e) {
            if (!(e instanceof ApiError && e.status === 409)) {
               toast.error(errorReason(e, 'Could not save the document'));
               return;
            }
            toast.warning('The document was changed by someone else. Loaded the latest version.');
            try {
               adopt(await api.documents.get(documentId), true);
               setEditorEpoch((n) => n + 1);
            } catch {
               setStatus('error');
            }
         }
      });
   };

   const saveName = async () => {
      if (nameDraft === null || !doc) return;
      const value = nameDraft.trim();
      setNameDraft(null);
      if (!value || value === doc.name) return;
      const prev = doc;
      setDoc({ ...doc, name: value }); // otimista
      try {
         const dto = await api.documents.update(documentId, { name: value });
         setDoc((cur) => (cur ? { ...cur, name: dto.name, updatedAt: dto.updatedAt } : cur));
      } catch (e) {
         setDoc(prev);
         toast.error(errorReason(e, 'Could not rename the document'));
      }
   };

   const togglePin = async () => {
      if (!doc) return;
      try {
         const dto = await api.documents.update(documentId, { pinned: !doc.pinned });
         setDoc((cur) => (cur ? { ...cur, pinned: dto.pinned } : cur));
         toast.success(dto.pinned ? 'Pinned to team resources' : 'Unpinned');
      } catch (e) {
         toast.error(errorReason(e, 'Could not update the document'));
      }
   };

   const remove = async () => {
      if (deleteBusy) return;
      setDeleteBusy(true);
      try {
         await api.documents.remove(documentId);
         setDeleteOpen(false);
         toast.success('Document deleted');
         router.push(listHref);
      } catch (e) {
         toast.error(errorReason(e, 'Could not delete the document'));
      } finally {
         setDeleteBusy(false);
      }
   };

   return (
      <div className="flex h-full w-full flex-col">
         <LocationBar className="sticky top-0 z-10 bg-container">
            <HeaderGroup className="min-w-0">
               {team && (
                  <Link
                     href={`/${orgId}/team/${teamId}/overview`}
                     className="flex shrink-0 items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                     <span className="inline-flex size-4 items-center justify-center rounded bg-muted/50 text-[10px]">
                        {team.icon}
                     </span>
                     {team.name}
                  </Link>
               )}
               <span className="text-muted-foreground">›</span>
               <Link
                  href={listHref}
                  className="shrink-0 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
               >
                  Documents
               </Link>
               {doc && (
                  <>
                     <span className="text-muted-foreground">›</span>
                     <HeaderTitle>{doc.name}</HeaderTitle>
                  </>
               )}
            </HeaderGroup>
            {doc && status === 'ready' && (
               <HeaderActions>
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button
                           type="button"
                           size="icon"
                           variant="ghost"
                           className="size-7"
                           aria-label="Document actions"
                        >
                           <MoreHorizontal className="size-4" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem disabled={!canEditMeta} onSelect={() => void togglePin()}>
                           {doc.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                           {doc.pinned ? 'Unpin' : 'Pin to team resources'}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                           variant="destructive"
                           disabled={!canEditMeta}
                           onSelect={() => setDeleteOpen(true)}
                        >
                           <Trash2 className="size-4" />
                           Delete…
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>
               </HeaderActions>
            )}
         </LocationBar>

         {status === 'loading' && !doc && (
            <div className="py-10">
               <LoadingArea rows={4} />
            </div>
         )}
         {status === 'notfound' && (
            <ErrorState
               role="status"
               className="min-h-0 flex-1"
               title="Document not found"
               description="It may have been deleted or moved."
               action={
                  <Button size="sm" variant="outline" asChild>
                     <Link href={listHref}>Back to documents</Link>
                  </Button>
               }
            />
         )}
         {status === 'error' && (
            <ErrorState
               className="min-h-0 flex-1"
               title="Could not load the document"
               description="Check your connection and try again."
               action={
                  <Button size="sm" variant="outline" onClick={() => void load()}>
                     Try again
                  </Button>
               }
            />
         )}

         {doc && (status === 'ready' || status === 'loading') && (
            <div className="content-enter mx-auto w-full max-w-[720px] px-6 pb-24 pt-12 max-md:px-4 max-md:pt-6">
               <div className="mb-3 text-3xl leading-none">{doc.icon || '📄'}</div>
               <input
                  aria-label="Document title"
                  value={nameDraft ?? doc.name}
                  readOnly={!canEditMeta}
                  maxLength={196}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => void saveName()}
                  onKeyDown={(e) => {
                     if (e.key === 'Enter') {
                        e.preventDefault();
                        void saveName();
                     } else if (e.key === 'Escape') {
                        setNameDraft(null);
                        e.currentTarget.blur();
                     }
                  }}
                  className="w-full bg-transparent text-[28px] font-semibold leading-9 outline-none placeholder:text-muted-foreground"
               />
               <p className="mt-2 text-[13px] text-muted-foreground">
                  {doc.folderName}
                  {doc.creator && <> · {doc.creator.name}</>} · Updated{' '}
                  {formatDistanceToNowStrict(parseISO(doc.updatedAt), { addSuffix: true })}
               </p>
               <div ref={editorBoxRef} className="mt-8">
                  <BlockEditor
                     key={`${documentId}:${editorEpoch}`}
                     doc={doc.descriptionDoc}
                     placeholder="Write something, or press / for commands…"
                     onSave={saveBody}
                  />
               </div>
            </div>
         )}

         <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleteBusy && setDeleteOpen(o)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{doc?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     The document is removed from the team. This action cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        void remove();
                     }}
                     disabled={deleteBusy}
                     className="bg-destructive text-white hover:bg-destructive/90"
                  >
                     {deleteBusy ? 'Deleting…' : 'Delete'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
