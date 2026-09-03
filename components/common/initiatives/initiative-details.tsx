'use client';

import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { ProjectGroup } from '@/components/common/projects/projects';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Initiative, INITIATIVE_STATUS_META, type InitiativeStatus } from '@/data/initiatives';
import { useLabels, usePriorities } from '@/store/catalog-store';
import { Project } from '@/data/projects';
import { useWorkspaceStore } from '@/store/workspace-store';
import { api } from '@/lib/client';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Boxes, ChevronDown, PenLine, Plus, UserRound, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { InitiativeUpdateDto } from '@/lib/api/initiative-detail';
import type { InitiativeActivityDto } from '@/lib/api/initiatives';
import { InitiativeProgressPanel } from './initiative-progress-panel';
import { InitiativeProjectRow } from './initiative-project-row';
import { InitiativeStatusIcon } from './initiative-status-icon';
import { InitiativeIconPicker } from './initiative-icon-picker';
import { InitiativeLabelPicker } from './initiative-label-picker';
import { InitiativeTargetPicker } from './initiative-target-picker';
import { DetailSidePanel, DetailSidePanelTrigger } from '@/components/common/detail-side-panel';

const TABS = ['overview', 'activity', 'projects'] as const;

/* ------------------------------ projects table ---------------------------- */

const GROUP_ORDER: { key: string; label: string; match: (project: Project) => boolean }[] = [
   { key: 'in-progress', label: 'In Progress', match: (p) => p.status.category === 'started' },
   { key: 'planned', label: 'Planned', match: (p) => p.status.category === 'unstarted' },
   {
      key: 'backlog',
      label: 'Backlog',
      match: (p) => p.status.category === 'backlog' || p.status.category === 'triage',
   },
   { key: 'completed', label: 'Completed', match: (p) => p.status.category === 'completed' },
];

function ProjectsSection({ initiative }: { initiative: Initiative }) {
   const { orgId } = useParams<{ orgId: string }>();
   const allProjects = useWorkspaceStore((s) => s.projects);
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   // Derivados memoizados: só recalculam quando os projetos do workspace ou os
   // vínculos da iniciativa mudam (não a cada re-render da página).
   const { groups, available } = useMemo(() => {
      const linked = new Set(initiative.projectIds);
      const projects = allProjects.filter((p) => linked.has(p.id));
      return {
         groups: GROUP_ORDER.map((group) => ({
            ...group,
            projects: projects.filter(group.match),
         })).filter((group) => group.projects.length > 0),
         available: allProjects.filter((p) => !linked.has(p.id)),
      };
   }, [allProjects, initiative.projectIds]);

   const [pickerOpen, setPickerOpen] = useState(false);

   const setProjects = async (projectIds: string[]) => {
      try {
         await api.initiatives.update(initiative.id, { projectIds });
         await hydrate();
      } catch {
         toast.error('Could not update the projects');
      }
   };
   const addProject = (id: string) => {
      setPickerOpen(false);
      void setProjects([...initiative.projectIds, id]);
   };
   const removeProject = (id: string) =>
      void setProjects(initiative.projectIds.filter((x) => x !== id));

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
                     <CommandInput placeholder="Add project…" />
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

/* ------------------------------- overview tab ----------------------------- */

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-center gap-2 text-[13px]">
         <span className="w-24 shrink-0 text-[13px] text-muted-foreground">{label}</span>
         {children}
      </div>
   );
}

/** Botão discreto que abre o popover de edição de uma propriedade. */
function PropertyButton({ children }: { children: React.ReactNode }) {
   return (
      <button
         type="button"
         className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 hover:bg-accent transition-colors text-left"
      >
         {children}
      </button>
   );
}

const STATUS_IDS = Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[];

/**
 * Painel de propriedades EDITÁVEL. Antes eram `<span>` estáticos — o backend já
 * aceitava status/priority/owner/target, mas nada na tela os enviava, então a página
 * de detalhe era read-only e só a lista (via context menu) editava.
 */
function PropertiesPanel({ initiative }: { initiative: Initiative }) {
   const applyInitiative = useWorkspaceStore((s) => s.applyInitiative);
   const users = useWorkspaceStore((s) => s.users);
   const priorities = usePriorities();
   const labels = useLabels();
   // Deriva da fatia assinada: assinar `countCompletedProjects` (funcao, referencia
   // estavel) nao acorda o painel quando um projeto e vinculado ou concluido.
   const allProjects = useWorkspaceStore((s) => s.projects);
   const linked = new Set(initiative.projectIds);
   const completed = allProjects.filter(
      (p) => linked.has(p.id) && (p.status.category === 'completed' || p.percentComplete >= 100)
   ).length;

   const patch = async (body: Parameters<typeof api.initiatives.update>[1], msg: string) => {
      try {
         const dto = await api.initiatives.update(initiative.id, body);
         applyInitiative(dto);
         toast.success(msg);
      } catch {
         toast.error('Não foi possível atualizar a initiative');
      }
   };

   return (
      <div className="flex flex-col gap-3">
         <span className="text-[13px] font-medium leading-4">Properties</span>

         <PropertyRow label="Status">
            <Popover>
               <PopoverTrigger asChild>
                  <PropertyButton>
                     <InitiativeStatusIcon status={initiative.status} />
                     {INITIATIVE_STATUS_META[initiative.status].label}
                  </PropertyButton>
               </PopoverTrigger>
               <PopoverContent align="start" className="w-52 p-1">
                  {STATUS_IDS.map((s) => (
                     <button
                        key={s}
                        type="button"
                        onClick={() =>
                           void patch({ status: s }, `Status → ${INITIATIVE_STATUS_META[s].label}`)
                        }
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent"
                     >
                        <InitiativeStatusIcon status={s} />
                        {INITIATIVE_STATUS_META[s].label}
                     </button>
                  ))}
               </PopoverContent>
            </Popover>
         </PropertyRow>

         <PropertyRow label="Priority">
            <Popover>
               <PopoverTrigger asChild>
                  <PropertyButton>
                     <initiative.priority.icon className="size-4 text-muted-foreground" />
                     <span className="text-muted-foreground">{initiative.priority.name}</span>
                  </PropertyButton>
               </PopoverTrigger>
               <PopoverContent align="start" className="w-52 p-1">
                  {priorities.map((p) => (
                     <button
                        key={p.id}
                        type="button"
                        onClick={() => void patch({ priorityId: p.id }, `Prioridade → ${p.name}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent"
                     >
                        <p.icon className="size-4 text-muted-foreground" />
                        {p.name}
                     </button>
                  ))}
               </PopoverContent>
            </Popover>
         </PropertyRow>

         <PropertyRow label="Owner">
            <Popover>
               <PopoverTrigger asChild>
                  <PropertyButton>
                     {initiative.owner ? (
                        <>
                           <Avatar className="size-4">
                              <AvatarImage
                                 src={initiative.owner.avatarUrl || undefined}
                                 alt={initiative.owner.name}
                              />
                              <AvatarFallback className="text-[8px]">
                                 {initiative.owner.name[0]}
                              </AvatarFallback>
                           </Avatar>
                           {initiative.owner.name}
                        </>
                     ) : (
                        <span className="text-muted-foreground inline-flex items-center gap-1.5">
                           <UserRound className="size-4" /> Add owner
                        </span>
                     )}
                  </PropertyButton>
               </PopoverTrigger>
               <PopoverContent align="start" className="w-60 p-0">
                  <Command>
                     <CommandInput placeholder="Buscar pessoa…" />
                     <CommandList>
                        <CommandEmpty>Ninguém encontrado.</CommandEmpty>
                        <CommandGroup>
                           {initiative.owner && (
                              <CommandItem
                                 value="__none__"
                                 onSelect={() => void patch({ ownerId: null }, 'Owner removido')}
                              >
                                 <X className="size-4 text-muted-foreground" />
                                 Sem owner
                              </CommandItem>
                           )}
                           {users.map((u) => (
                              <CommandItem
                                 key={u.id}
                                 value={u.name}
                                 onSelect={() => void patch({ ownerId: u.id }, `Owner → ${u.name}`)}
                              >
                                 <Avatar className="size-4">
                                    <AvatarImage src={u.avatarUrl || undefined} alt={u.name} />
                                    <AvatarFallback className="text-[8px]">
                                       {u.name[0]}
                                    </AvatarFallback>
                                 </Avatar>
                                 <span className="truncate">{u.name}</span>
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>
         </PropertyRow>

         <PropertyRow label="Target">
            <InitiativeTargetPicker
               value={initiative.target ?? ''}
               onChange={(target) =>
                  void patch(
                     { target: target || null },
                     target ? `Target → ${target}` : 'Target removido'
                  )
               }
            />
         </PropertyRow>

         <PropertyRow label="Labels">
            <InitiativeLabelPicker
               labels={labels}
               value={initiative.labels.map((label) => label.id)}
               onChange={(labelIds) => void patch({ labelIds }, 'Labels atualizadas')}
            />
         </PropertyRow>

         <PropertyRow label="Projects">
            <span className="text-muted-foreground text-xs">
               {completed} / {initiative.projectIds.length} completed
            </span>
         </PropertyRow>
      </div>
   );
}

/**
 * `target` é varchar livre no schema (texto tipo "Q3 2026"), não uma data — por isso
 * é um input de texto e não um date picker. Datas reais exigiriam colunas novas.
 */
function InitiativeSidePanelContent({ initiative }: { initiative: Initiative }) {
   return (
      <div className="flex h-full w-full flex-col gap-2 overflow-y-auto">
         <div className="rounded-[10px] border bg-card p-3 pb-[22.5px]">
            <PropertiesPanel initiative={initiative} />
         </div>

         {initiative.projectIds.length > 0 && (
            <div className="rounded-[10px] border bg-card p-3">
               <InitiativeProgressPanel initiative={initiative} />
            </div>
         )}

         <div className="rounded-[10px] border bg-card p-3">
            <ActivityFeed initiativeId={initiative.id} />
         </div>
      </div>
   );
}

function Overview({ initiative }: { initiative: Initiative }) {
   const applyInitiative = useWorkspaceStore((state) => state.applyInitiative);

   const updateIcon = async (body: Parameters<typeof api.initiatives.update>[1]) => {
      try {
         const dto = await api.initiatives.update(initiative.id, body);
         applyInitiative(dto);
         toast.success('Initiative icon updated');
      } catch {
         toast.error('Could not update the initiative icon');
      }
   };

   return (
      <div className="h-full overflow-y-auto">
         <div className="mx-auto max-w-[869px] px-8 pt-16 pb-10">
            <div className="flex items-start justify-between">
               <InitiativeIconPicker
                  icon={initiative.icon}
                  color={initiative.iconColor ?? 'gray'}
                  onIconChange={(icon) => void updateIcon({ icon })}
                  onColorChange={(iconColor) => void updateIcon({ iconColor })}
               />
               <div className="flex items-center gap-1.5">
                  <DetailSidePanelTrigger kind="initiative" />
               </div>
            </div>
            <div className="mt-3 flex flex-col gap-1">
               <h1 className="text-2xl font-semibold leading-8">{initiative.name}</h1>
               <p className="text-[15px] leading-6 text-muted-foreground">
                  {initiative.description ?? 'Add a short summary…'}
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
               <h2 className="py-1.5 text-[13px] font-medium leading-4">Description</h2>
               <p className="text-[15px] leading-6 text-muted-foreground">
                  {initiative.description ?? 'Add description…'}
               </p>
            </div>

            <div className="mt-[92px]">
               <ProjectsSection initiative={initiative} />
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

   return (
      <div className="flex flex-col gap-3">
         <span className="text-[13px] font-medium leading-4">Activity</span>
         {entries === null ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
         ) : entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
         ) : (
            <ul className="flex flex-col gap-2.5">
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
   { id: 'on-track', label: 'On track', color: 'var(--chart-2)' },
   { id: 'at-risk', label: 'At risk', color: 'var(--chart-4)' },
   { id: 'off-track', label: 'Off track', color: 'var(--destructive)' },
] as const;

/** Activity da initiative: composer de update (health + texto) + feed. O health do
 * último update propaga pro health da initiative (paridade Linear). */
function Activity({ initiativeId }: { initiativeId: string }) {
   const [updates, setUpdates] = useState<InitiativeUpdateDto[]>([]);
   const [health, setHealth] = useState<'on-track' | 'at-risk' | 'off-track'>('on-track');
   const [text, setText] = useState('');
   const [busy, setBusy] = useState(false);
   const hydrateWs = useWorkspaceStore((s) => s.hydrate);

   useEffect(() => {
      let active = true;
      api.initiatives
         .updates(initiativeId)
         .then((u) => active && setUpdates(u))
         .catch(() => active && setUpdates([]));
      return () => {
         active = false;
      };
   }, [initiativeId]);

   const post = async () => {
      if (busy) return;
      setBusy(true);
      try {
         const blocks = text.trim() ? [{ type: 'paragraph' as const, text: text.trim() }] : [];
         const dto = await api.initiatives.postUpdate(initiativeId, { health, blocks });
         setUpdates((prev) => [dto, ...prev]);
         setText('');
         await hydrateWs(); // reflete o novo health da initiative no workspace
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
               <Button size="xs" onClick={() => void post()} disabled={busy}>
                  {busy ? 'Publicando…' : 'Publicar update'}
               </Button>
            </div>
         </div>

         {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum update ainda.</p>
         ) : (
            <div className="flex flex-col gap-3">
               {updates.map((u) => {
                  const h = UPDATE_HEALTHS.find((x) => x.id === u.health);
                  return (
                     <div
                        key={u.id}
                        className="rounded-lg border border-border/60 bg-container p-3"
                     >
                        <div className="flex items-center gap-2 mb-1.5 text-sm">
                           <span
                              className="size-2 rounded-full"
                              style={{
                                 backgroundColor: h?.color ?? 'var(--muted-foreground)',
                              }}
                           />
                           <span className="font-medium">{h?.label ?? u.health}</span>
                           <span className="text-xs text-muted-foreground">
                              {u.author?.name ?? 'Alguém'} ·{' '}
                              {new Date(u.createdAt).toLocaleDateString()}
                           </span>
                        </div>
                        {u.blocks.map((b, i) =>
                           b.type === 'paragraph' ? (
                              <p key={i} className="text-sm text-ink-2">
                                 {b.text}
                              </p>
                           ) : null
                        )}
                     </div>
                  );
               })}
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
      // Hidratando → skeleton; not-found só como estado final (fim do flash no deep-link frio).
      if (!loaded) {
         return (
            <div className="p-8">
               <ListSkeleton rows={6} />
            </div>
         );
      }
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            Initiative not found
         </div>
      );
   }

   const content =
      tab === 'activity' ? (
         <Activity initiativeId={initiativeId} />
      ) : tab === 'projects' ? (
         <ProjectsTimeline groups={timelineGroups} />
      ) : (
         <Overview initiative={initiative} />
      );

   return (
      <div className="flex h-full w-full overflow-hidden">
         <div className="min-w-0 flex-1 overflow-hidden">{content}</div>
         <DetailSidePanel
            kind="initiative"
            title="Initiative details"
            description="View and edit the properties of this initiative."
         >
            <InitiativeSidePanelContent initiative={initiative} />
         </DetailSidePanel>
      </div>
   );
}
