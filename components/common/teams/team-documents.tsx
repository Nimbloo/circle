'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { LoadingArea } from '@/components/common/loading-area';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
import { adaptFolders } from '@/lib/adapters-documents';
import { api } from '@/lib/client';
import { DOCUMENT_CHANGED_EVENT, useLiveReload } from '@/lib/use-live-sync';
import type { DocumentFolder } from '@/data/documents';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import {
   ChevronRight,
   FileText,
   FolderPen,
   MoreHorizontal,
   Pencil,
   Pin,
   PinOff,
   Trash2,
} from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { errorReason } from '@/lib/error-reason';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CreateDocumentButton } from './create-document-dialog';

const timeAgo = (date: string) =>
   formatDistanceToNowStrict(parseISO(date), { addSuffix: true })
      .replace(' minutes', 'min')
      .replace(' hours', 'h')
      .replace(' days', 'd')
      .replace(' weeks', 'w')
      .replace(' months', 'mo')
      .replace(' years', 'y');

/**
 * Team Home — "Documents" tab: tudo contido num único card (não barras
 * full-bleed separadas por linha), com CRUD real ligado a /teams/{key}/documents
 * e /documents/{id}. Criação via modal no padrão Linear (CreateDocumentButton).
 */
export default function TeamDocuments() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const [folders, setFolders] = useState<DocumentFolder[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState(false);
   const [renaming, setRenaming] = useState<{ id: string; name: string; icon: string } | null>(
      null
   );
   const [busy, setBusy] = useState(false);
   /** Documento aguardando confirmação de exclusão (Ad#21–40: excluía no 1º clique). */
   const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
   // Separados do alvo (ad#4): fechar não pode esvaziar o nome no título durante a
   // animação de saída — só zera o alvo ao abrir um novo.
   const [deleteOpen, setDeleteOpen] = useState(false);
   const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);
   /** Pasta sendo renomeada e pasta aguardando confirmação de exclusão (ad#6). */
   const [renamingFolder, setRenamingFolder] = useState<{
      id: string;
      name: string;
      icon: string;
   } | null>(null);
   const [folderToDelete, setFolderToDelete] = useState<{
      id: string;
      name: string;
      count: number;
   } | null>(null);

   const reload = useCallback(() => {
      if (!teamId) return;
      return api.teams
         .documents(teamId)
         .then((dtos) => {
            setFolders(adaptFolders(dtos));
            setError(false);
         })
         .catch(() => setError(true))
         .finally(() => setLoading(false));
   }, [teamId]);

   useEffect(() => {
      setLoading(true);
      void reload();
   }, [reload]);
   // Documento criado/editado/apagado por OUTRO usuário: recarrega a lista em silêncio.
   useLiveReload(DOCUMENT_CHANGED_EVENT, { teamId }, () =>
      teamId
         ? api.teams
              .documents(teamId)
              .then((dtos) => setFolders(adaptFolders(dtos)))
              .catch(() => {})
         : undefined
   );

   const submitRename = async () => {
      if (!renaming || !renaming.name.trim() || busy) return;
      setBusy(true);
      try {
         await api.documents.update(renaming.id, {
            name: renaming.name.trim(),
            icon: renaming.icon || null,
         });
         setRenaming(null);
         await reload();
         toast.success('Documento atualizado');
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível atualizar'));
      } finally {
         setBusy(false);
      }
   };

   const submitRenameFolder = async () => {
      if (!renamingFolder || !renamingFolder.name.trim() || busy) return;
      setBusy(true);
      try {
         await api.documents.updateFolder(renamingFolder.id, {
            name: renamingFolder.name.trim(),
            icon: renamingFolder.icon || null,
         });
         setRenamingFolder(null);
         await reload();
         toast.success('Pasta atualizada');
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível atualizar a pasta'));
      } finally {
         setBusy(false);
      }
   };

   const removeFolder = async (folderId: string) => {
      setBusy(true);
      try {
         await api.documents.removeFolder(folderId);
         setFolderDeleteOpen(false);
         toast.success('Pasta excluída');
         await reload();
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível excluir a pasta'));
      } finally {
         setBusy(false);
      }
   };

   const togglePin = async (docId: string, pinned: boolean) => {
      try {
         await api.documents.update(docId, { pinned: !pinned });
         await reload();
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível (des)fixar'));
      }
   };

   const remove = async (docId: string) => {
      try {
         await api.documents.remove(docId);
         setDeleteOpen(false);
         toast.success('Documento excluído');
         await reload();
      } catch (err) {
         toast.error(errorReason(err, 'Não foi possível excluir'));
      }
   };

   const folderRefs = folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon }));

   return (
      <div className="w-full p-4">
         <div className="rounded-lg border bg-container overflow-hidden">
            {/* Header do card */}
            <div className="flex items-center justify-between px-4 h-11 border-b">
               <span className="text-sm font-medium">Documents</span>
               {teamId && (
                  <CreateDocumentButton teamId={teamId} folders={folderRefs} onCreated={reload} />
               )}
            </div>

            {loading && <LoadingArea rows={5} />}
            {!loading && error && (
               <ErrorState
                  className="min-h-0 py-10"
                  title="Não foi possível carregar os documentos"
                  description="Verifique a conexão e tente de novo."
                  action={
                     <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                           setLoading(true);
                           void reload();
                        }}
                     >
                        Tentar novamente
                     </Button>
                  }
               />
            )}
            {!loading && !error && folders.length === 0 && (
               <EmptyState
                  icon={FileText}
                  title="No documents yet"
                  description="Use “New document” to create your first one."
                  className="py-10"
               />
            )}

            {!loading &&
               !error &&
               folders.map((folder, fi) => (
                  <Collapsible
                     key={folder.id}
                     defaultOpen={folder.documents.some((d) => d.pinned) || fi === 0}
                     className={cn('content-enter', fi > 0 && 'border-t border-border/40')}
                  >
                     <div className="group/folder flex h-9 items-center gap-2 pr-3">
                        <CollapsibleTrigger asChild>
                           <button className="group flex h-9 min-w-0 flex-1 items-center gap-2 px-4 text-sm text-muted-foreground hover:text-foreground">
                              <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                              <span className="text-base leading-none">{folder.icon}</span>
                              <span className="truncate font-medium text-foreground">
                                 {folder.name}
                              </span>
                              <span className="text-xs">{folder.documents.length}</span>
                           </button>
                        </CollapsibleTrigger>
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button
                                 size="icon"
                                 variant="ghost"
                                 className="size-7 shrink-0 opacity-0 focus-visible:opacity-100 group-hover/folder:opacity-100 data-[state=open]:opacity-100 max-md:opacity-100"
                                 aria-label={`Folder actions for ${folder.name}`}
                              >
                                 <MoreHorizontal className="size-4" />
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                 onClick={() =>
                                    setRenamingFolder({
                                       id: folder.id,
                                       name: folder.name,
                                       icon: folder.icon,
                                    })
                                 }
                              >
                                 <FolderPen className="mr-2 size-3.5" /> Rename folder
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                 className="text-destructive focus:text-destructive"
                                 onClick={() => {
                                    setFolderToDelete({
                                       id: folder.id,
                                       name: folder.name,
                                       count: folder.documents.length,
                                    });
                                    setFolderDeleteOpen(true);
                                 }}
                              >
                                 <Trash2 className="mr-2 size-3.5" /> Delete folder
                              </DropdownMenuItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>
                     <CollapsibleContent className="pb-1">
                        {folder.documents.length === 0 && (
                           <div className="pl-14 pr-4 h-8 flex items-center text-xs text-muted-foreground">
                              Empty folder
                           </div>
                        )}
                        {folder.documents.map((doc) => (
                           <div
                              key={doc.id}
                              className="group/doc mx-1 flex h-10 items-center gap-2 rounded-md pl-11 pr-3 text-sm hover:bg-sidebar/60"
                           >
                              {/* A linha ABRE o documento (ad#6): antes não levava a lugar nenhum. */}
                              <Link
                                 href={`/${orgId}/team/${teamId}/documents/${doc.id}`}
                                 className="flex min-w-0 flex-1 items-center gap-2"
                              >
                                 <span className="shrink-0 text-base leading-none">{doc.icon}</span>
                                 <span className="truncate font-medium">{doc.name}</span>
                                 {doc.pinned && (
                                    <Pin className="size-3 shrink-0 text-muted-foreground" />
                                 )}
                                 <span className="ml-auto hidden shrink-0 text-xs text-muted-foreground md:block">
                                    {timeAgo(doc.updatedAt)}
                                 </span>
                              </Link>
                              <Avatar className="size-5 shrink-0">
                                 <AvatarImage
                                    src={doc.creator.avatarUrl || undefined}
                                    alt={doc.creator.name}
                                 />
                                 <AvatarFallback>{doc.creator.name[0]}</AvatarFallback>
                              </Avatar>
                              <DropdownMenu>
                                 <DropdownMenuTrigger asChild>
                                    <Button
                                       size="icon"
                                       variant="ghost"
                                       className="size-7 shrink-0 opacity-0 group-hover/doc:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                       aria-label={`Document actions for ${doc.name}`}
                                    >
                                       <MoreHorizontal className="size-4" />
                                    </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                       onClick={() =>
                                          setRenaming({
                                             id: doc.id,
                                             name: doc.name,
                                             icon: doc.icon,
                                          })
                                       }
                                    >
                                       <Pencil className="size-3.5 mr-2" /> Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                       onClick={() => togglePin(doc.id, !!doc.pinned)}
                                    >
                                       {doc.pinned ? (
                                          <>
                                             <PinOff className="size-3.5 mr-2" /> Unpin
                                          </>
                                       ) : (
                                          <>
                                             <Pin className="size-3.5 mr-2" /> Pin
                                          </>
                                       )}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                       className="text-destructive focus:text-destructive"
                                       onClick={() => {
                                          setToDelete({ id: doc.id, name: doc.name });
                                          setDeleteOpen(true);
                                       }}
                                    >
                                       <Trash2 className="size-3.5 mr-2" /> Delete
                                    </DropdownMenuItem>
                                 </DropdownMenuContent>
                              </DropdownMenu>
                           </div>
                        ))}
                     </CollapsibleContent>
                  </Collapsible>
               ))}
         </div>

         <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir “{toDelete?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     O documento será removido do time. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     onClick={(e) => {
                        e.preventDefault();
                        if (toDelete) void remove(toDelete.id);
                     }}
                  >
                     Excluir
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <AlertDialog open={folderDeleteOpen} onOpenChange={(o) => !busy && setFolderDeleteOpen(o)}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir a pasta “{folderToDelete?.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                     {folderToDelete?.count
                        ? `A pasta e ${folderToDelete.count} documento${
                             folderToDelete.count === 1 ? '' : 's'
                          } dentro dela serão excluídos. Esta ação não pode ser desfeita.`
                        : 'A pasta está vazia e será excluída.'}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={busy}
                     onClick={(e) => {
                        e.preventDefault();
                        if (folderToDelete) void removeFolder(folderToDelete.id);
                     }}
                     className="bg-destructive text-white hover:bg-destructive/90"
                  >
                     Excluir pasta
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>

         <Dialog open={renamingFolder !== null} onOpenChange={(o) => !o && setRenamingFolder(null)}>
            <DialogContent className="sm:max-w-sm">
               <DialogHeader>
                  <DialogTitle>Rename folder</DialogTitle>
               </DialogHeader>
               {renamingFolder && (
                  <div className="flex items-center gap-2">
                     <Input
                        value={renamingFolder.icon}
                        onChange={(e) =>
                           setRenamingFolder({ ...renamingFolder, icon: e.target.value })
                        }
                        className="w-14 text-center"
                        maxLength={16}
                        aria-label="Folder icon"
                     />
                     <Input
                        value={renamingFolder.name}
                        onChange={(e) =>
                           setRenamingFolder({ ...renamingFolder, name: e.target.value })
                        }
                        placeholder="Name"
                        autoFocus
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') void submitRenameFolder();
                        }}
                     />
                  </div>
               )}
               <DialogFooter>
                  <Button variant="ghost" onClick={() => setRenamingFolder(null)} disabled={busy}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void submitRenameFolder()}
                     disabled={busy || !renamingFolder?.name.trim()}
                  >
                     Save
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         {/* Rename (secundário — o create é o modal Linear) */}
         <Dialog open={renaming !== null} onOpenChange={(o) => !o && setRenaming(null)}>
            <DialogContent className="sm:max-w-sm">
               <DialogHeader>
                  <DialogTitle>Rename document</DialogTitle>
               </DialogHeader>
               {renaming && (
                  <div className="flex items-center gap-2">
                     <Input
                        value={renaming.icon}
                        onChange={(e) => setRenaming({ ...renaming, icon: e.target.value })}
                        className="w-14 text-center"
                        // Emoji composto (família, bandeira) passa de 2 unidades UTF-16 —
                        // o limite de 2 cortava e gravava lixo (ad#6).
                        maxLength={16}
                        aria-label="Icon"
                     />
                     <Input
                        value={renaming.name}
                        onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                        placeholder="Name"
                        autoFocus
                        onKeyDown={(e) => {
                           if (e.key === 'Enter') void submitRename();
                        }}
                     />
                  </div>
               )}
               <DialogFooter>
                  <Button variant="ghost" onClick={() => setRenaming(null)} disabled={busy}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void submitRename()}
                     disabled={busy || !renaming?.name.trim()}
                  >
                     Save
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
