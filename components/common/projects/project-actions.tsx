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
import type { Project } from '@/data/projects';
import { api } from '@/lib/client';
import { useFavoritesStore } from '@/store/favorites-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Link2, MoreHorizontal, Star, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * Menu "…" do header do projeto (pl#14): copiar link, favoritar e excluir — as mesmas
 * ações do menu de contexto da lista, que faltavam na página do projeto.
 */
export function ProjectActions({ project }: { project: Project }) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const removeProjectLocal = useWorkspaceStore((s) => s.removeProjectLocal);
   const toggleFavorite = useFavoritesStore((s) => s.toggle);
   const isFavorite = useFavoritesStore((s) => s.isFavorite('project', project.id));
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const copyLink = () => {
      void navigator.clipboard
         ?.writeText(`${window.location.origin}/${orgId}/project/${project.id}/overview`)
         .then(() => toast.success('Link copied'))
         .catch(() => toast.error('Could not copy the link'));
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await api.projects.remove(project.id);
         removeProjectLocal(project.id);
         setConfirmOpen(false);
         toast.success('Project deleted');
         router.push(`/${orgId}/projects`);
      } catch {
         toast.error('Could not delete the project');
      } finally {
         setBusy(false);
      }
   };

   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button size="icon" variant="ghost" className="size-7" aria-label="Project actions">
                  <MoreHorizontal className="size-4 text-muted-foreground" />
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
               <DropdownMenuItem onSelect={copyLink}>
                  <Link2 className="size-4" />
                  Copy link
               </DropdownMenuItem>
               <DropdownMenuItem onSelect={() => void toggleFavorite('project', project.id)}>
                  <Star className="size-4" />
                  {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
               </DropdownMenuItem>
               <DropdownMenuSeparator />
               <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                     event.preventDefault();
                     setConfirmOpen(true);
                  }}
               >
                  <Trash2 className="size-4" />
                  Delete project
               </DropdownMenuItem>
            </DropdownMenuContent>
         </DropdownMenu>

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Delete project?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes “{project.name}”. Its issues are kept but unassigned from the
                     project. This cannot be undone.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
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
      </>
   );
}
