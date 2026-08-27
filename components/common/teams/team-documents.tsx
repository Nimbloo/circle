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
import { ChevronRight, MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
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
   const { teamId } = useParams<{ teamId: string }>();
   const [folders, setFolders] = useState<DocumentFolder[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState(false);
   const [renaming, setRenaming] = useState<{ id: string; name: string; icon: string } | null>(
      null
   );
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
      } catch {
         toast.error('Não foi possível atualizar');
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

            {loading && <div className="px-4 py-8 text-sm text-muted-foreground">Loading…</div>}
            {!loading && error && (
               <div className="px-4 py-8 text-sm text-muted-foreground">
                  Could not load documents.
               </div>
            )}
            {!loading && !error && folders.length === 0 && (
               <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No documents yet. Use “New document” to create your first one.
               </div>
            )}

            {!loading &&
               !error &&
               folders.map((folder, fi) => (
                  <Collapsible
                     key={folder.id}
                     defaultOpen={folder.documents.some((d) => d.pinned) || fi === 0}
                     className={fi > 0 ? 'border-t border-border/40' : undefined}
                  >
                     <CollapsibleTrigger asChild>
                        <button className="group w-full flex items-center gap-2 px-4 h-9 text-sm text-muted-foreground hover:text-foreground">
                           <ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
                           <span className="text-base leading-none">{folder.icon}</span>
                           <span className="font-medium text-foreground truncate">
                              {folder.name}
                           </span>
                           <span className="text-xs">{folder.documents.length}</span>
                        </button>
                     </CollapsibleTrigger>
                     <CollapsibleContent className="pb-1">
                        {folder.documents.length === 0 && (
                           <div className="pl-14 pr-4 h-8 flex items-center text-xs text-muted-foreground">
                              Empty folder
                           </div>
                        )}
                        {folder.documents.map((doc) => (
                           <div
                              key={doc.id}
                              className="group/doc flex items-center gap-2 pl-11 pr-3 h-10 rounded-md mx-1 hover:bg-sidebar/60 text-sm"
                           >
                              <span className="text-base leading-none shrink-0">{doc.icon}</span>
                              <span className="font-medium truncate">{doc.name}</span>
                              {doc.pinned && (
                                 <Pin className="size-3 text-muted-foreground shrink-0" />
                              )}
                              <span className="ml-auto hidden md:block text-xs text-muted-foreground shrink-0">
                                 {timeAgo(doc.updatedAt)}
                              </span>
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
                                       className="size-6 shrink-0 opacity-0 group-hover/doc:opacity-100 data-[state=open]:opacity-100"
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
                                       className="text-red-600 focus:text-red-600"
                                       onClick={() => remove(doc.id)}
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
                        maxLength={2}
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
