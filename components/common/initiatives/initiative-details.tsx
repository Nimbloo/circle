'use client';

import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingArea } from '@/components/common/loading-area';
import { ProjectGroup } from '@/components/common/projects/projects';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Initiative } from '@/data/initiatives';
import { Project } from '@/data/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { initiativeWithDescendants } from '@/lib/initiative-tree';
import { api } from '@/lib/client';
import { INITIATIVE_CHANGED_EVENT, useLiveReload } from '@/lib/use-live-sync';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   ArrowRight,
   Boxes,
   CalendarClock,
   ChevronDown,
   MoreHorizontal,
   Network,
   Pencil,
   PenLine,
   Plus,
   Trash2,
   X,
} from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { InitiativeUpdateDto } from '@/lib/api/initiative-detail';
import type { InitiativeActivityDto } from '@/lib/api/initiatives';
import { ProgressHistory } from '@/components/common/projects/progress-history';
import { InitiativeProgressPanel } from './initiative-progress-panel';
import { InitiativeProjectRow } from './initiative-project-row';
import { groupInitiativeProjects } from './initiative-project-groups';
import { InitiativeIconPicker } from './initiative-icon-picker';
import { InitiativePropertiesPanel } from './initiative-properties-panel';
import { useInitiativePatch } from './use-initiative-patch';
import { DetailSidePanel, DetailSidePanelTrigger } from '@/components/common/detail-side-panel';
import { healthColor } from '@/components/common/projects/progress-colors';
import { blocksToMarkdown, markdownToBlocks } from '@/components/common/projects/update-blocks';
import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
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

const TABS = ['overview', 'projects', 'activity'] as const;
const formatDay = (iso: string) => format(parseISO(iso), 'MMM d, yyyy');

/* ------------------------------ projects table ---------------------------- */

function ProjectsSection({ initiative }: { initiative: Initiative }) {
   const { orgId } = useParams<{ orgId: string }>();
   const allProjects = useWorkspaceStore((s) => s.projects);
   // Derivados memoizados: só recalculam quando os projetos do workspace ou os
   // vínculos da iniciativa mudam (não a cada re-render da página).
   const { groups, available } = useMemo(() => {
      const linked = new Set(initiative.projectIds);
      const projects = allProjects.filter((p) => linked.has(p.id));
      return {
         groups: groupInitiativeProjects(projects),
         available: allProjects.filter((p) => !linked.has(p.id)),
      };
   }, [allProjects, initiative.projectIds]);

   const [pickerOpen, setPickerOpen] = useState(false);
   const patch = useInitiativePatch(initiative.id);

   // Lê o conjunto ATUAL do store (já com cliques otimistas anteriores) e serializa o
   // PATCH: cliques rápidos não perdem seleção (#46).
   const setProjects = (next: (ids: string[]) => string[]) => {
      const current =
         useWorkspaceStore.getState().getInitiativeById(initiative.id)?.projectIds ??
         initiative.projectIds;
      const projectIds = next(current);
      void patch({ projectIds }, { projectIds }, { error: 'Could not update the projects' });
   };
   const addProject = (id: string) => {
      setPickerOpen(false);
      setProjects((ids) => (ids.includes(id) ? ids : [...ids, id]));
   };
   const removeProject = (id: string) => setProjects((ids) => ids.filter((x) => x !== id));

   return (
      <section className="mx-0.5 flex flex-col gap-2">
         <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-medium">Projects</h2>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
               <PopoverTrigger asChild>
                  <button
                     type="button"
                     className="text-muted-foreground hover:text-foreground transition-colors"
                     aria-label="Add project"
                  >
                     <Plus className="size-4" />
                  </button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-64 p-0">
                  <Command>
                     <CommandInput placeholder="Adicionar projeto…" />
                     <CommandList>
                        <CommandEmpty>No projects.</CommandEmpty>
                        <CommandGroup>
                           {available.map((p) => (
                              <CommandItem
                                 key={p.id}
                                 value={p.name}
                                 onSelect={() => addProject(p.id)}
                              >
                                 <p.icon className="size-4 text-muted-foreground" />
                                 <span className="truncate">{p.name}</span>
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>
         </div>
         <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground border-b">
            <span className="flex-1">Name</span>
            <span className="hidden sm:block w-16 shrink-0">Health</span>
            <span className="hidden sm:block w-16 shrink-0">Priority</span>
            <span className="hidden md:block w-12 shrink-0">Lead</span>
            <span className="hidden md:block w-24 shrink-0">Target date</span>
            <span className="w-16 shrink-0">Status</span>
         </div>
         {groups.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-lg border text-center">
               <div className="flex size-10 items-center justify-center rounded-lg border bg-secondary text-muted-foreground">
                  <Boxes className="size-5" />
               </div>
               <div>
                  <p className="text-sm font-medium">No projects in this initiative</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                     Add projects to track their progress together.
                  </p>
               </div>
               <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => setPickerOpen(true)}
               >
                  <Plus className="size-3.5" />
                  Add project to initiative
               </Button>
            </div>
         ) : (
            groups.map((group) => (
               <div key={group.key} className="flex flex-col">
                  <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
                     <ChevronDown className="size-3" />
                     {group.label}
                     <span className="flex-1 border-b border-border/60" />
                  </div>
                  {group.projects.map((project) => (
                     <InitiativeProjectRow
                        key={project.id}
                        project={project}
                        orgId={orgId}
                        onRemove={removeProject}
                     />
                  ))}
               </div>
            ))
         )}
      </section>
   );
}

/* ----------------------------- sub-initiatives ---------------------------- */

/** Progresso agregado (0-100) de uma initiative somando a subárvore. */
function rollupPercent(initiative: Initiative): number {
   if (initiative.rollupProjectCount === 0) return 0;
   return Math.round(
      (initiative.rollupCompletedProjectCount / initiative.rollupProjectCount) * 100
   );
}

/**
 * Lista as sub-initiatives DIRETAS com o rollup de projetos de cada uma (#100).
 * O picker adiciona uma initiative existente como filha (PATCH `parentId` nela) —
 * o servidor recusa ciclo com 400.
 */
function SubInitiativesSection({ initiative }: { initiative: Initiative }) {
   const { orgId } = useParams<{ orgId: string }>();
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const applyInitiative = useWorkspaceStore((s) => s.applyInitiative);
   const [pickerOpen, setPickerOpen] = useState(false);

   const { children, available } = useMemo(() => {
      const byId = new Map(initiatives.map((i) => [i.id, i]));
      const forbidden = new Set(initiativeWithDescendants(initiatives, initiative.id));
      return {
         children: initiative.childIds
            .map((id) => byId.get(id))
            .filter((i): i is Initiative => Boolean(i)),
         available: initiatives.filter((i) => !forbidden.has(i.id) && i.id !== initiative.parentId),
      };
   }, [initiatives, initiative.childIds, initiative.id, initiative.parentId]);

   const setParent = async (childId: string, parentId: string | null) => {
      try {
         // A resposta é a FILHA; a mãe precisa do childIds/rollup novos.
         applyInitiative(await api.initiatives.update(childId, { parentId }));
         applyInitiative(await api.initiatives.get(initiative.id));
         toast.success(parentId ? 'Sub-initiative adicionada' : 'Sub-initiative removida');
      } catch {
         toast.error('Não foi possível atualizar as sub-initiatives');
      }
   };

   return (
      <section className="mx-0.5 flex flex-col gap-2">
         <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-medium">Sub-initiatives</h2>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
               <PopoverTrigger asChild>
                  <button
                     type="button"
                     className="text-muted-foreground hover:text-foreground transition-colors"
                     aria-label="Add sub-initiative"
                  >
                     <Plus className="size-4" />
                  </button>
               </PopoverTrigger>
               <PopoverContent align="end" className="w-64 p-0">
                  <Command>
                     <CommandInput placeholder="Adicionar subiniciativa…" />
                     <CommandList>
                        <CommandEmpty>No initiatives.</CommandEmpty>
                        <CommandGroup>
                           {available.map((candidate) => (
                              <CommandItem
                                 key={candidate.id}
                                 value={candidate.name}
                                 onSelect={() => {
                                    setPickerOpen(false);
                                    void setParent(candidate.id, initiative.id);
                                 }}
                              >
                                 {candidate.name}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>
         </div>

         {children.length === 0 ? (
            <p className="px-2 text-[13px] text-muted-foreground">No sub-initiatives</p>
         ) : (
            <ul className="flex flex-col">
               {children.map((child) => (
                  <li
                     key={child.id}
                     className="group flex h-10 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-accent/40"
                  >
                     <Network className="size-3.5 shrink-0 text-muted-foreground" />
                     <Link
                        href={`/${orgId}/initiative/${child.id}`}
                        className="min-w-0 flex-1 truncate"
                     >
                        {child.name}
                     </Link>
                     <span className="shrink-0 text-xs text-muted-foreground">
                        {child.rollupCompletedProjectCount} / {child.rollupProjectCount} projects
                     </span>
                     <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
                        {rollupPercent(child)}%
                     </span>
                     <button
                        type="button"
                        aria-label={`Remove ${child.name}`}
                        className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                        onClick={() => void setParent(child.id, null)}
                     >
                        <X className="size-3.5" />
                     </button>
                  </li>
               ))}
            </ul>
         )}
      </section>
   );
}

/* ------------------------------- overview tab ----------------------------- */

/**
 * Período da initiative acima da timeline de projetos: usa `startDate`/`targetDate`
 * reais (o rótulo `target` é só o nome do período). Some quando não há data nenhuma.
 */
function InitiativePeriodBar({ initiative }: { initiative: Initiative }) {
   const { startDate, targetDate, target } = initiative;
   // "Hoje" só no cliente (SSR-safe), como a linha de hoje da timeline.
   const [today, setToday] = useState<number | null>(null);
   useEffect(() => setToday(Date.now()), []);

   if (!startDate && !targetDate) return null;
   let elapsed: number | null = null;
   if (startDate && targetDate && today !== null) {
      const start = parseISO(startDate).getTime();
      const end = parseISO(targetDate).getTime();
      if (end > start) elapsed = Math.min(1, Math.max(0, (today - start) / (end - start)));
   }
   const percent = elapsed === null ? null : Math.round(elapsed * 100);

   return (
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-6 text-xs text-muted-foreground">
         <CalendarClock className="size-3.5" />
         <span>{startDate ? formatDay(startDate) : 'No start date'}</span>
         <ArrowRight className="size-3" />
         <span>
            {targetDate ? formatDay(targetDate) : 'No target date'}
            {targetDate && target && (
               <span className="ml-1 text-muted-foreground/70">({target})</span>
            )}
         </span>
         {percent !== null && (
            <span className="ml-auto flex items-center gap-2">
               <span
                  className="h-1 w-24 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Period elapsed"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
               >
                  <span className="block h-full bg-primary" style={{ width: `${percent}%` }} />
               </span>
               {percent}% of period elapsed
            </span>
         )}
      </div>
   );
}

/** Aside de propriedades, progresso e feed da initiative. */
function InitiativeSidePanelContent({ initiative }: { initiative: Initiative }) {
   return (
      <div className="flex h-full w-full flex-col gap-2 overflow-y-auto">
         <div className="rounded-[10px] border bg-card p-3 pb-[22.5px]">
            <InitiativePropertiesPanel initiative={initiative} />
         </div>

         {initiative.projectIds.length > 0 && (
            <div className="rounded-[10px] border bg-card p-3">
               <InitiativeProgressPanel initiative={initiative} />
            </div>
         )}

         {/* Histórico agregado da subárvore (#102): soma os snapshots dos projetos. */}
         {(initiative.projectIds.length > 0 || initiative.childIds.length > 0) && (
            <div className="rounded-[10px] border bg-card p-3">
               <ProgressHistory initiativeId={initiative.id} />
            </div>
         )}

         <div className="rounded-[10px] border bg-card p-3">
            <ActivityFeed initiativeId={initiative.id} />
         </div>
      </div>
   );
}

function Overview({ initiative }: { initiative: Initiative }) {
   const patch = useInitiativePatch(initiative.id);
   const messages = {
      success: 'Initiative icon updated',
      error: 'Could not update the initiative icon',
   };

   return (
      <div className="h-full overflow-y-auto">
         <div className="mx-auto max-w-[869px] px-8 pt-16 pb-10">
            <div className="flex items-start justify-between">
               <InitiativeIconPicker
                  icon={initiative.icon}
                  color={initiative.iconColor ?? 'gray'}
                  onIconChange={(icon) => void patch({ icon }, { icon }, messages)}
                  onColorChange={(iconColor) => void patch({ iconColor }, { iconColor }, messages)}
               />
               <div className="flex items-center gap-1.5">
                  <DetailSidePanelTrigger kind="initiative" />
               </div>
            </div>
            <div className="mt-3 flex flex-col gap-1">
               <h1 className="text-2xl font-semibold leading-8">{initiative.name}</h1>
               <p className="text-[15px] leading-6 text-muted-foreground">
                  {initiative.description ?? 'Adicione um resumo curto…'}
               </p>
            </div>

            {/* Propriedades só no painel lateral (como no Linear) — aqui fica só Resources. */}
            <div className="mt-[19px] flex min-h-7 items-center gap-3 text-sm">
               <h3 className="w-24 shrink-0 py-1.5 text-[13px] font-medium leading-4 text-muted-foreground">
                  Resources
               </h3>
               <span className="text-muted-foreground">No resources</span>
            </div>

            <Link
               href="?tab=activity"
               className="-mx-4 mt-4 flex h-[67px] items-center justify-center gap-2 rounded-[10px] border text-sm text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
            >
               <PenLine className="size-4" />
               Write initiative update
            </Link>

            <div className="-mx-4 mt-[27px] flex min-h-[148px] flex-col gap-2 rounded-xl px-4 pt-2.5">
               <h2 className="py-1.5 text-[13px] font-medium leading-4">Descrição</h2>
               <p className="text-[15px] leading-6 text-muted-foreground">
                  {initiative.description ?? 'Adicione uma descrição…'}
               </p>
            </div>

            <div className="mt-[92px]">
               <ProjectsSection initiative={initiative} />
            </div>

            <div className="mt-10">
               <SubInitiativesSection initiative={initiative} />
            </div>
         </div>
      </div>
   );
}

/**
 * Feed de alterações da iniciativa (o "changed status, owner" do Linear). Busca sob
 * demanda: é lateral à página, não vale segurar a hidratação do workspace por ele.
 */
function ActivityFeed({ initiativeId }: { initiativeId: string }) {
   const [entries, setEntries] = useState<InitiativeActivityDto[] | null>(null);

   useEffect(() => {
      let active = true;
      api.initiatives
         .activity(initiativeId)
         .then((rows) => {
            if (active) setEntries(rows);
         })
         .catch(() => {
            if (active) setEntries([]);
         });
      return () => {
         active = false;
      };
   }, [initiativeId]);
   // Mudança de OUTRO usuário: recarrega em silêncio (falha mantém o feed atual).
   useLiveReload(INITIATIVE_CHANGED_EVENT, { id: initiativeId }, () =>
      api.initiatives
         .activity(initiativeId)
         .then(setEntries)
         .catch(() => {})
   );

   return (
      <div className="flex flex-col gap-3">
         <span className="text-[13px] font-medium leading-4">Activity</span>
         {entries === null ? (
            <LoadingArea rows={3} />
         ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
         ) : (
            <ul className="content-enter flex flex-col gap-2.5">
               {entries.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 text-xs">
                     <Avatar className="size-5 shrink-0 mt-0.5">
                        <AvatarImage
                           src={e.user?.avatarUrl || undefined}
                           alt={e.user?.name ?? ''}
                        />
                        <AvatarFallback>{e.user?.name?.[0] ?? '?'}</AvatarFallback>
                     </Avatar>
                     <span className="text-muted-foreground leading-snug">
                        <span className="text-foreground font-medium">
                           {e.user?.name ?? 'Alguém'}
                        </span>{' '}
                        {e.text}
                        <span className="block text-[11px] opacity-70">
                           {new Date(e.createdAt).toLocaleDateString()}
                        </span>
                     </span>
                  </li>
               ))}
            </ul>
         )}
      </div>
   );
}

/* ------------------------------- activity tab ----------------------------- */

const UPDATE_HEALTHS = [
   { id: 'on-track', label: 'On track', color: healthColor('on-track') },
   { id: 'at-risk', label: 'At risk', color: healthColor('at-risk') },
   { id: 'off-track', label: 'Off track', color: healthColor('off-track') },
] as const;

/** Card de update da initiative, com editar e excluir (pl#11). */
function InitiativeUpdateCard({
   initiativeId,
   update,
   onChanged,
}: {
   initiativeId: string;
   update: InitiativeUpdateDto;
   onChanged: (next: InitiativeUpdateDto | null, removed: boolean) => void;
}) {
   const applyInitiative = useWorkspaceStore((s) => s.applyInitiative);
   const [draft, setDraft] = useState<string | null>(null);
   const [confirmOpen, setConfirmOpen] = useState(false);
   const [busy, setBusy] = useState(false);
   const meta = UPDATE_HEALTHS.find((x) => x.id === update.health);

   const save = async () => {
      if (draft === null || draft.trim() === '' || busy) return;
      setBusy(true);
      try {
         const result = await api.initiatives.updateUpdate(initiativeId, update.id, {
            blocks: markdownToBlocks(draft),
         });
         applyInitiative(result.initiative);
         onChanged(result.update, false);
         setDraft(null);
         toast.success('Update editado');
      } catch {
         toast.error('Não foi possível editar o update');
      } finally {
         setBusy(false);
      }
   };

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         applyInitiative(await api.initiatives.removeUpdate(initiativeId, update.id));
         onChanged(null, true);
         setConfirmOpen(false);
         toast.success('Update excluído');
      } catch {
         toast.error('Não foi possível excluir o update');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="rounded-lg border border-border/60 bg-container p-3">
         <div className="mb-1.5 flex items-center gap-2 text-sm">
            <span
               className="size-2 rounded-full"
               style={{ backgroundColor: meta?.color ?? 'var(--muted-foreground)' }}
            />
            <span className="font-medium">{meta?.label ?? update.health}</span>
            <span className="text-xs text-muted-foreground">
               {update.author?.name ?? 'Alguém'} · {new Date(update.createdAt).toLocaleDateString()}
            </span>
            {draft === null && (
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="ml-auto size-7"
                        aria-label="Update actions"
                     >
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuItem onSelect={() => setDraft(blocksToMarkdown(update.blocks))}>
                        <Pencil className="size-4" />
                        Editar
                     </DropdownMenuItem>
                     <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                           event.preventDefault();
                           setConfirmOpen(true);
                        }}
                     >
                        <Trash2 className="size-4" />
                        Excluir
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            )}
         </div>
         {draft === null ? (
            <div className="text-sm">
               <ContentBlocks blocks={update.blocks} />
            </div>
         ) : (
            <div>
               <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Editar update"
                  autoFocus
                  className="min-h-20 w-full resize-y rounded-md border bg-transparent p-2 text-sm outline-none"
               />
               <div className="mt-2 flex items-center gap-2">
                  <Button
                     size="xs"
                     onClick={() => void save()}
                     disabled={busy || draft.trim() === ''}
                     aria-label="Salvar update"
                  >
                     Salvar
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>
                     Cancelar
                  </Button>
               </div>
            </div>
         )}

         <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Excluir este update?</AlertDialogTitle>
                  <AlertDialogDescription>
                     O update sai da timeline e o health da initiative volta para o update anterior.
                     Não dá para desfazer.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                     aria-label="Excluir update"
                     disabled={busy}
                     onClick={(event) => {
                        event.preventDefault();
                        void remove();
                     }}
                  >
                     Excluir
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}

/** Activity da initiative: composer de update (health + texto) + feed. O health do
 * último update propaga pro health da initiative (paridade Linear). */
function Activity({ initiativeId }: { initiativeId: string }) {
   const [updates, setUpdates] = useState<InitiativeUpdateDto[]>([]);
   // Primeira carga do feed: vazio só depois de uma resposta real, nunca na carga/falha.
   const [feed, setFeed] = useState<'loading' | 'ready' | 'error'>('loading');
   const [health, setHealth] = useState<'on-track' | 'at-risk' | 'off-track'>('on-track');
   const [text, setText] = useState('');
   const [busy, setBusy] = useState(false);
   const applyInitiative = useWorkspaceStore((s) => s.applyInitiative);

   useEffect(() => {
      let active = true;
      setFeed('loading');
      api.initiatives
         .updates(initiativeId)
         .then((u) => {
            if (!active) return;
            setUpdates(u);
            setFeed('ready');
         })
         .catch(() => {
            if (!active) return;
            setUpdates([]);
            setFeed('error');
         });
      return () => {
         active = false;
      };
   }, [initiativeId]);
   useLiveReload(INITIATIVE_CHANGED_EVENT, { id: initiativeId }, () =>
      api.initiatives
         .updates(initiativeId)
         .then((u) => {
            setUpdates(u);
            setFeed('ready');
         })
         .catch(() => {})
   );

   const post = async () => {
      if (busy) return;
      if (text.trim() === '') return; // update vazio não vira registro (pl#11)
      setBusy(true);
      try {
         const blocks = markdownToBlocks(text);
         const { update, initiative } = await api.initiatives.postUpdate(initiativeId, {
            health,
            blocks,
         });
         setUpdates((prev) => [update, ...prev]);
         setText('');
         applyInitiative(initiative); // reflete o novo health da initiative no workspace
         toast.success('Update publicado');
      } catch {
         toast.error('Não foi possível publicar o update');
      } finally {
         setBusy(false);
      }
   };

   return (
      <div className="max-w-2xl mx-auto px-8 py-10 flex flex-col gap-4 w-full">
         <h2 className="text-lg font-medium">Activity</h2>
         <div className="rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
               {UPDATE_HEALTHS.map((h) => (
                  <button
                     key={h.id}
                     type="button"
                     onClick={() => setHealth(h.id)}
                     className={cn(
                        'inline-flex items-center gap-1.5 text-xs rounded-md border px-2 py-1 transition-colors',
                        health === h.id
                           ? 'border-foreground/30'
                           : 'border-border text-muted-foreground'
                     )}
                  >
                     <span className="size-2 rounded-full" style={{ backgroundColor: h.color }} />
                     {h.label}
                  </button>
               ))}
            </div>
            <textarea
               value={text}
               onChange={(e) => setText(e.target.value)}
               rows={2}
               placeholder="O que mudou nesta iniciativa?"
               disabled={busy}
               className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="flex justify-end">
               <Button size="xs" onClick={() => void post()} disabled={busy || !text.trim()}>
                  {busy ? 'Publicando…' : 'Publicar update'}
               </Button>
            </div>
         </div>

         {feed === 'loading' && updates.length === 0 ? (
            <LoadingArea rows={3} />
         ) : feed === 'error' && updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Não foi possível carregar os updates.</p>
         ) : updates.length === 0 ? (
            <EmptyState
               variant="activity"
               title="Nenhum update ainda"
               description="Publique o primeiro para registrar o andamento."
               className="py-8"
            />
         ) : (
            <div className="content-enter flex flex-col gap-3">
               {updates.map((u) => (
                  <InitiativeUpdateCard
                     key={u.id}
                     initiativeId={initiativeId}
                     update={u}
                     onChanged={(next, removed) => {
                        setUpdates((prev) =>
                           removed
                              ? prev.filter((item) => item.id !== u.id)
                              : prev.map((item) => (item.id === u.id ? next! : item))
                        );
                     }}
                  />
               ))}
            </div>
         )}
      </div>
   );
}

/* ---------------------------------- export -------------------------------- */

/** Initiative detail page: Overview / Activity / Projects tabs. */
export default function InitiativeDetails({ initiativeId }: { initiativeId: string }) {
   const [tab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));
   // A chamada vai DENTRO do seletor: assinar `s.getInitiativeById` assinaria a
   // função (referência estável), e a tela nunca re-renderizaria depois de um
   // update — salvava no store e continuava mostrando o valor antigo.
   const initiative = useWorkspaceStore((s) => s.getInitiativeById(initiativeId));
   // Derivado do array assinado (não do helper do store, que devolve referência nova a
   // cada chamada e não pode ir dentro do seletor): assim o memo reage tanto à troca da
   // iniciativa quanto à mudança nos projetos.
   const allProjects = useWorkspaceStore((s) => s.projects);
   const loaded = useWorkspaceStore((s) => s.loaded);

   const timelineGroups = useMemo<ProjectGroup[]>(() => {
      if (!initiative) return [];
      const linked = new Set(initiative.projectIds);
      return [
         {
            id: initiative.id,
            name: initiative.name,
            icon: initiative.icon,
            projects: allProjects.filter((p) => linked.has(p.id)),
         },
      ];
   }, [initiative, allProjects]);

   if (!initiative) {
      // Hidratando → loading; not-found só como estado final (fim do flash no deep-link frio).
      if (!loaded) {
         return (
            <div className="p-8">
               <LoadingArea rows={6} />
            </div>
         );
      }
      return (
         <EmptyState
            variant="search"
            title="Initiative not found"
            description="It may have been deleted or you don't have access to it."
         />
      );
   }

   const content =
      tab === 'activity' ? (
         <Activity initiativeId={initiativeId} />
      ) : tab === 'projects' ? (
         <div className="flex h-full flex-col">
            <InitiativePeriodBar initiative={initiative} />
            <div className="min-h-0 flex-1">
               <ProjectsTimeline groups={timelineGroups} />
            </div>
         </div>
      ) : (
         <Overview initiative={initiative} />
      );

   return (
      <div className="content-enter flex h-full w-full overflow-hidden">
         <div className="min-w-0 flex-1 overflow-hidden">{content}</div>
         <DetailSidePanel
            kind="initiative"
            title="Detalhes da iniciativa"
            description="Veja e edite as propriedades desta iniciativa."
         >
            <InitiativeSidePanelContent initiative={initiative} />
         </DetailSidePanel>
      </div>
   );
}
