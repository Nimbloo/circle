'use client';

import { DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { cn } from '@/lib/utils';
import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea, useEnterFade } from '@/components/common/loading-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/client';
import { blocksToMarkdown, markdownToBlocks } from '../update-blocks';
import {
   ProjectUpdate,
   ProjectUpdateHealth,
   projectUpdateHealthColor,
   projectUpdateHealthLabel,
} from '@/data/project-details';
import { useProjectUpdatesStore } from '@/store/project-updates-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useSharedProjectDetail } from './use-project-detail';

interface ProjectActivityProps {
   projectId: string;
}

function HealthBadge({ health }: { health: ProjectUpdateHealth }) {
   return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border px-2 py-0.5">
         <span
            className="size-2 rounded-full"
            style={{ backgroundColor: projectUpdateHealthColor[health] }}
         />
         {projectUpdateHealthLabel[health]}
      </span>
   );
}

function UpdateCard({
   update,
   projectId,
   onChanged,
}: {
   update: ProjectUpdate;
   projectId: string;
   /** Ausente em update otimista (ainda sem id do servidor): sem editar/excluir. */
   onChanged?: () => void | Promise<void>;
}) {
   const [draft, setDraft] = useState<string | null>(null);
   const [draftHealth, setDraftHealth] = useState<ProjectUpdateHealth>(update.health);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const editable = Boolean(onChanged);

   const save = async () => {
      if (draft === null || draft.trim() === '' || busy) return;
      setBusy(true);
      try {
         await api.projects.updateUpdate(projectId, update.id, {
            health: draftHealth,
            blocks: markdownToBlocks(draft),
         });
         setDraft(null);
         await onChanged?.();
         toast.success('Update edited');
      } catch {
         toast.error('Could not edit the update');
      } finally {
         setBusy(false);
      }
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.projects.removeUpdate(projectId, update.id);
         setConfirmOpen(false);
         await onChanged?.();
         toast.success('Update deleted');
      } catch {
         toast.error('Could not delete the update');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="border rounded-lg p-4">
         <div className="flex items-center gap-2 text-sm">
            <Avatar className="size-5">
               <AvatarImage src={update.author.avatarUrl || undefined} alt={update.author.name} />
               <AvatarFallback>{update.author.name[0]}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{update.author.name}</span>
            <span className="text-xs text-muted-foreground">
               {format(parseISO(update.date), 'MMM d')}
            </span>
            <span className="ml-auto flex items-center gap-1">
               {draft === null ? (
                  <HealthBadge health={update.health} />
               ) : (
                  <DropdownMenu>
                     <DropdownMenuTrigger className="outline-none" aria-label="Update health">
                        <HealthBadge health={draftHealth} />
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end" className="w-40">
                        {(Object.keys(projectUpdateHealthLabel) as ProjectUpdateHealth[]).map(
                           (value) => (
                              <DropdownMenuItem key={value} onClick={() => setDraftHealth(value)}>
                                 <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: projectUpdateHealthColor[value] }}
                                 />
                                 {projectUpdateHealthLabel[value]}
                              </DropdownMenuItem>
                           )
                        )}
                     </DropdownMenuContent>
                  </DropdownMenu>
               )}
               {editable && draft === null && (
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button
                           size="icon"
                           variant="ghost"
                           className="size-7"
                           aria-label="Update actions"
                        >
                           <MoreHorizontal className="size-4 text-muted-foreground" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                        <DropdownMenuItem
                           onSelect={() => {
                              setDraftHealth(update.health);
                              setDraft(blocksToMarkdown(update.blocks));
                           }}
                        >
                           <Pencil className="size-4" />
                           Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           variant="destructive"
                           onSelect={(event) => {
                              event.preventDefault();
                              setConfirmOpen(true);
                           }}
                        >
                           <Trash2 className="size-4" />
                           Delete
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>
               )}
            </span>
         </div>
         {draft === null ? (
            <div className="mt-2 text-sm leading-relaxed">
               <ContentBlocks blocks={update.blocks} />
            </div>
         ) : (
            <div className="mt-2">
               <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Edit update"
                  autoFocus
                  className="w-full min-h-24 resize-y rounded-md border bg-transparent p-2 text-sm outline-none"
               />
               <div className="mt-2 flex items-center gap-2">
                  <Button
                     size="xs"
                     onClick={save}
                     disabled={busy || draft.trim() === ''}
                     aria-label="Save update"
                  >
                     Save
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>
                     Cancel
                  </Button>
               </div>
            </div>
         )}

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete this update?</AlertDialogTitle>
                  <AlertDialogDescription>
                     The update is removed from the timeline and the project health goes back to the
                     previous update. This cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     aria-label="Delete update"
                     disabled={busy}
                     onClick={(event) => {
                        event.preventDefault();
                        void remove();
                     }}
                  >
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}

/** Project "Activity" tab: update composer + monthly timeline. */
export default function ProjectActivity({ projectId }: ProjectActivityProps) {
   // Troca de irmão (aba, item, layout) não pisca: só a primeira chegada de conteúdo.
   const fade = useEnterFade('project-tab');
   const project = useWorkspaceStore((s) => s.getProjectById(projectId));
   const loaded = useWorkspaceStore((s) => s.loaded);
   const { postedUpdates, postUpdate, removeUpdate } = useProjectUpdatesStore();
   const [health, setHealth] = useState<ProjectUpdateHealth>('on-track');
   const [text, setText] = useState('');
   const [posting, setPosting] = useState(false);

   // Detalhe compartilhado pelas abas (layout da rota, #45): `status` é o estado da
   // PRIMEIRA carga (vazio só depois de uma resposta real); refetch e live reload são
   // silenciosos e preservam o feed na falha.
   const { status: feed, detail, reload } = useSharedProjectDetail(projectId);

   const updates = useMemo<ProjectUpdate[]>(
      () => [...(postedUpdates[projectId] ?? []), ...detail.updates],
      [postedUpdates, projectId, detail.updates]
   );

   const updatesByMonth = useMemo(() => {
      const groups = new Map<string, ProjectUpdate[]>();
      for (const update of updates) {
         const month = format(parseISO(update.date), 'MMMM');
         groups.set(month, [...(groups.get(month) ?? []), update]);
      }
      return [...groups.entries()];
   }, [updates]);

   const handlePost = async () => {
      if (text.trim() === '' || posting) return;
      setPosting(true);
      // Otimista: mostra o update na hora; confirma/rollback depois do POST.
      const optimistic = postUpdate(projectId, health, text);
      setText('');
      try {
         // Blocos do markdown do composer: listas e headings sobrevivem (pl#11).
         await api.projects.postUpdate(projectId, { health, blocks: markdownToBlocks(text) });
         await reload(); // o update persistido volta em detail.updates
         removeUpdate(projectId, optimistic.id); // limpa o otimista (evita duplicar)
         toast.success('Update posted');
      } catch {
         removeUpdate(projectId, optimistic.id); // rollback
         toast.error('Could not post the update');
      } finally {
         setPosting(false);
      }
   };

   if (!project) {
      if (!loaded) return <LoadingArea rows={6} />;
      return (
         <EmptyState
            variant="search"
            title="Project not found"
            description="It may have been deleted or you don't have access to it."
         />
      );
   }

   return (
      <div className={cn(fade && 'content-enter', 'relative h-full w-full overflow-hidden')}>
         <div className="h-full min-w-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 lg:px-10 py-8">
               <div className="mb-3 flex justify-end xl:hidden">
                  <DetailSidePanelTrigger kind="project" />
               </div>
               {/* Composer */}
               <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2">
                     <span className="text-xs font-medium text-muted-foreground px-1">
                        Project update
                     </span>
                     <DropdownMenu>
                        <DropdownMenuTrigger className="outline-none">
                           <HealthBadge health={health} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-40">
                           {(Object.keys(projectUpdateHealthLabel) as ProjectUpdateHealth[]).map(
                              (value) => (
                                 <DropdownMenuItem key={value} onClick={() => setHealth(value)}>
                                    <span
                                       className="size-2 rounded-full"
                                       style={{
                                          backgroundColor: projectUpdateHealthColor[value],
                                       }}
                                    />
                                    {projectUpdateHealthLabel[value]}
                                 </DropdownMenuItem>
                              )
                           )}
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </div>

                  <textarea
                     value={text}
                     onChange={(event) => setText(event.target.value)}
                     placeholder="Write a project update…"
                     className="mt-3 w-full min-h-24 resize-y bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />

                  <div className="mt-3 flex items-center justify-end">
                     <Button
                        size="xs"
                        onClick={handlePost}
                        disabled={text.trim() === '' || posting}
                     >
                        Post update
                     </Button>
                  </div>
               </div>

               {/* Timeline */}
               {/* Updates otimistas do próprio usuário aparecem mesmo durante a carga. */}
               {feed === 'loading' && updates.length === 0 ? (
                  <div className="mt-8">
                     <LoadingArea rows={3} />
                  </div>
               ) : feed === 'error' && updates.length === 0 ? (
                  <p className="mt-10 text-center text-sm text-muted-foreground">
                     Could not load updates.
                  </p>
               ) : updatesByMonth.length === 0 ? (
                  <EmptyState
                     variant="activity"
                     title="No updates yet"
                     description="Post the first one to keep the team in the loop."
                     className="py-10"
                  />
               ) : (
                  updatesByMonth.map(([month, monthUpdates]) => (
                     <div key={month} className="mt-8">
                        <h3 className="text-lg font-semibold mb-3">{month}</h3>
                        <div className="flex flex-col gap-3">
                           {monthUpdates.map((update) => (
                              <UpdateCard
                                 key={update.id}
                                 update={update}
                                 projectId={projectId}
                                 onChanged={update.id.startsWith('posted-') ? undefined : reload}
                              />
                           ))}
                        </div>
                     </div>
                  ))
               )}
            </div>
         </div>
      </div>
   );
}
