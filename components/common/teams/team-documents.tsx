'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { adaptFolders } from '@/lib/adapters-documents';
import { api } from '@/lib/client';
import type { DocumentFolder } from '@/data/documents';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import {
   ChevronRight,
   FolderPlus,
   MoreHorizontal,
   Pencil,
   Pin,
   PinOff,
   Plus,
   Trash2,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

const timeAgo = (date: string) =>
   formatDistanceToNowStrict(parseISO(date), { addSuffix: true })
      .replace(' minutes', 'min')
      .replace(' hours', 'h')
      .replace(' days', 'd')
      .replace(' weeks', 'w')
      .replace(' months', 'mo')
      .replace(' years', 'y');

type DialogState =
   | { mode: 'new-folder' }
   | { mode: 'new-doc'; folderId: string }
   | { mode: 'rename'; docId: string }
   | null;

/**
 * Team Home — "Documents" tab: pastas colapsáveis com documentos, e CRUD real
 * (criar pasta/documento, renomear, (des)fixar, excluir) ligado a
 * /teams/{key}/documents e /documents/{id}. Escrita exige criador/admin (403).
 */
export default function TeamDocuments() {
   const { teamId } = useParams<{ teamId: string }>();
   const [folders, setFolders] = useState<DocumentFolder[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState(false);
   const [dialog, setDialog] = useState<DialogState>(null);
   const [name, setName] = useState('');
   const [icon, setIcon] = useState('');
   const [busy, setBusy] = useState(false);

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

   const openNewFolder = () => {
      setName('');
      setIcon('📁');
      setDialog({ mode: 'new-folder' });
   };
   const openNewDoc = (folderId: string) => {
      setName('');
      setIcon('📄');
      setDialog({ mode: 'new-doc', folderId });
   };
   const openRename = (docId: string, current: string, currentIcon: string) => {
      setName(current);
      setIcon(currentIcon);
      setDialog({ mode: 'rename', docId });
   };

   const submitDialog = async () => {
      if (!dialog || !name.trim() || !teamId || busy) return;
      setBusy(true);
      try {
         if (dialog.mode === 'new-folder') {
            await api.teams.createFolder(teamId, { name: name.trim(), icon: icon || null });
            toast.success('Pasta criada');
         } else if (dialog.mode === 'new-doc') {
            await api.teams.createDocument(teamId, {
               folderId: dialog.folderId,
               name: name.trim(),
               icon: icon || null,
            });
            toast.success('Documento criado');
         } else {
            await api.documents.update(dialog.docId, { name: name.trim(), icon: icon || null });
            toast.success('Documento atualizado');
         }
         setDialog(null);
         await reload();
      } catch {
         toast.error('Não foi possível salvar');
      } finally {
         setBusy(false);
      }
   };

   const togglePin = async (docId: string, pinned: boolean) => {
      try {
         await api.documents.update(docId, { pinned: !pinned });
         await reload();
      } catch {
         toast.error('Não foi possível (des)fixar');
      }
   };

   const remove = async (docId: string) => {
      try {
         await api.documents.remove(docId);
         toast.success('Documento excluído');
         await reload();
      } catch {
         toast.error('Não foi possível excluir');
      }
   };

   const dialogTitle =
      dialog?.mode === 'new-folder'
         ? 'Nova pasta'
         : dialog?.mode === 'new-doc'
           ? 'Novo documento'
           : 'Renomear documento';

   return (
      <div className="w-full">
         <div className="flex items-center justify-between px-6 py-3 gap-2">
            <div className="grid grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] w-full items-center text-sm text-muted-foreground">
               <span className="flex items-center gap-1 font-medium">Name ↓</span>
               <span className="hidden md:block">Created</span>
               <span className="hidden md:block">Last edited</span>
               <span />
            </div>
            <Button
               size="xs"
               variant="secondary"
               className="shrink-0 gap-1"
               onClick={openNewFolder}
            >
               <FolderPlus className="size-3.5" />
               New folder
            </Button>
         </div>

         {loading && <div className="px-6 py-8 text-sm text-muted-foreground">Loading…</div>}
         {!loading && error && (
            <div className="px-6 py-8 text-sm text-muted-foreground">Could not load documents.</div>
         )}
         {!loading && !error && folders.length === 0 && (
            <div className="px-6 py-8 text-sm text-muted-foreground">
               No documents yet. Create a folder to get started.
            </div>
         )}

         {!loading &&
            !error &&
            folders.map((folder) => (
               <Collapsible key={folder.id} defaultOpen={folder.documents.some((d) => d.pinned)}>
                  <div className="group/folder flex items-center bg-sidebar/30 hover:bg-sidebar/60 border-b border-border/50">
                     <CollapsibleTrigger asChild>
                        <button className="group flex-1 flex items-center gap-2 px-6 h-10 text-sm min-w-0">
                           <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                           <span className="text-base leading-none">{folder.icon}</span>
                           <span className="font-medium truncate">{folder.name}</span>
                           <span className="text-muted-foreground">{folder.documents.length}</span>
                        </button>
                     </CollapsibleTrigger>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 mr-3 opacity-0 group-hover/folder:opacity-100 shrink-0"
                        title="Add document"
                        onClick={() => openNewDoc(folder.id)}
                     >
                        <Plus className="size-4" />
                     </Button>
                  </div>
                  <CollapsibleContent>
                     {folder.documents.length === 0 && (
                        <div className="px-6 pl-14 h-10 flex items-center text-xs text-muted-foreground border-b border-border/30">
                           Empty folder
                        </div>
                     )}
                     {folder.documents.map((doc) => (
                        <div
                           key={doc.id}
                           className="group/doc grid grid-cols-[1fr_40px] md:grid-cols-[1fr_90px_90px_40px] items-center px-6 h-11 hover:bg-sidebar/50 border-b border-border/30 text-sm"
                        >
                           <div className="flex items-center gap-2 min-w-0 pl-6">
                              <span className="text-base leading-none">{doc.icon}</span>
                              <span className="font-medium truncate">{doc.name}</span>
                              {doc.pinned && (
                                 <Pin className="size-3 text-muted-foreground shrink-0" />
                              )}
                           </div>
                           <span className="hidden md:block text-xs text-muted-foreground">
                              {timeAgo(doc.createdAt)}
                           </span>
                           <span className="hidden md:block text-xs text-muted-foreground">
                              {timeAgo(doc.updatedAt)}
                           </span>
                           <div className="flex items-center justify-end gap-1">
                              <Avatar className="size-5">
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
                                       className="size-6 opacity-0 group-hover/doc:opacity-100 data-[state=open]:opacity-100"
                                    >
                                       <MoreHorizontal className="size-4" />
                                    </Button>
                                 </DropdownMenuTrigger>
                                 <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                       onClick={() => openRename(doc.id, doc.name, doc.icon)}
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
                                       className="text-red-600 focus:text-red-600"
                                       onClick={() => remove(doc.id)}
                                    >
                                       <Trash2 className="size-3.5 mr-2" /> Delete
                                    </DropdownMenuItem>
                                 </DropdownMenuContent>
                              </DropdownMenu>
                           </div>
                        </div>
                     ))}
                  </CollapsibleContent>
               </Collapsible>
            ))}

         <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
            <DialogContent className="sm:max-w-sm">
               <DialogHeader>
                  <DialogTitle>{dialogTitle}</DialogTitle>
               </DialogHeader>
               <div className="flex items-center gap-2">
                  <Input
                     value={icon}
                     onChange={(e) => setIcon(e.target.value)}
                     className="w-14 text-center"
                     maxLength={2}
                     aria-label="Icon"
                  />
                  <Input
                     value={name}
                     onChange={(e) => setName(e.target.value)}
                     placeholder="Name"
                     autoFocus
                     onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitDialog();
                     }}
                  />
               </div>
               <DialogFooter>
                  <Button variant="ghost" onClick={() => setDialog(null)} disabled={busy}>
                     Cancel
                  </Button>
                  <Button onClick={() => void submitDialog()} disabled={busy || !name.trim()}>
                     Save
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
