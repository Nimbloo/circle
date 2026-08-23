'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { api } from '@/lib/client';
import type { ProjectTemplateDto } from '@/lib/api/project-templates';
import { cn } from '@/lib/utils';
import { useLabels, usePriorities, useStatuses, useHealthStates } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   CalendarClock,
   CalendarRange,
   CheckIcon,
   Cuboid,
   Plus,
   Tag,
   Target,
   Trash2,
   UserRound,
   X,
} from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

/** Status icons são uma união (Lucide | Remixicon); o cast expõe className/style. */
type IconCmp = ComponentType<{ className?: string; style?: CSSProperties }>;

interface DraftMilestone {
   name: string;
   targetDate: string;
}

/** Chip clicável (mesma linguagem visual dos chips do New Issue / inline initiative). */
function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
   return (
      <span
         className={cn(
            'inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-xs transition-colors cursor-pointer hover:bg-accent/50',
            active ? 'text-foreground' : 'text-muted-foreground'
         )}
      >
         {children}
      </span>
   );
}

/**
 * Modal de criação de projeto no padrão Linear: breadcrumb de time + título grande
 * + summary + chips de propriedade inline (status/priority/lead/datas/initiative/labels)
 * + descrição + milestones. Persiste tudo: `create` (campos base), `updateDetail`
 * (summary/description) e `addMilestone` (cada milestone).
 */
export function CreateProjectButton() {
   const hydrate = useWorkspaceStore((s) => s.hydrate);
   const teams = useWorkspaceStore((s) => s.teams);
   const users = useWorkspaceStore((s) => s.users);
   const initiatives = useWorkspaceStore((s) => s.initiatives);
   const statuses = useStatuses();
   const priorities = usePriorities();
   const labels = useLabels();
   const healthStates = useHealthStates();

   const [open, setOpen] = useState(false);
   const [busy, setBusy] = useState(false);

   const [name, setName] = useState('');
   const [summary, setSummary] = useState('');
   const [description, setDescription] = useState('');
   const [teamId, setTeamId] = useState('');
   const [statusId, setStatusId] = useState('');
   const [priorityId, setPriorityId] = useState('');
   const [leadId, setLeadId] = useState<string | null>(null);
   const [startDate, setStartDate] = useState('');
   const [targetDate, setTargetDate] = useState('');
   const [initiativeId, setInitiativeId] = useState<string | null>(null);
   const [labelIds, setLabelIds] = useState<string[]>([]);
   const [milestones, setMilestones] = useState<DraftMilestone[]>([]);

   const [templates, setTemplates] = useState<ProjectTemplateDto[]>([]);
   const [templateId, setTemplateId] = useState<string | null>(null);

   // Seed dos defaults ao abrir: primeiro time, "backlog"/"unstarted" e "No priority".
   useEffect(() => {
      if (!open) return;
      setTeamId((v) => v || teams[0]?.id || '');
      setStatusId((v) => {
         if (v) return v;
         const backlog = statuses.find((s) => s.category === 'backlog') ?? statuses[0];
         return backlog?.id ?? '';
      });
      setPriorityId((v) => {
         if (v) return v;
         const noPrio = priorities.find((p) => /no priority/i.test(p.name)) ?? priorities[0];
         return noPrio?.id ?? '';
      });
   }, [open, teams, statuses, priorities]);

   // Templates do time selecionado (pré-preenchimento opcional).
   useEffect(() => {
      if (!open || !teamId) {
         setTemplates([]);
         return;
      }
      let alive = true;
      api.teams
         .projectTemplates(teamId)
         .then((t) => alive && setTemplates(t))
         .catch(() => alive && setTemplates([]));
      return () => {
         alive = false;
      };
   }, [open, teamId]);

   const applyTemplate = (id: string) => {
      setTemplateId(id);
      const t = templates.find((x) => x.id === id);
      if (!t) return;
      if (t.projectName) setName(t.projectName);
      if (t.statusId) setStatusId(t.statusId);
      if (t.priorityId) setPriorityId(t.priorityId);
   };

   const reset = () => {
      setName('');
      setSummary('');
      setDescription('');
      setStatusId('');
      setPriorityId('');
      setLeadId(null);
      setStartDate('');
      setTargetDate('');
      setInitiativeId(null);
      setLabelIds([]);
      setMilestones([]);
      setTemplateId(null);
   };

   const team = teams.find((t) => t.id === teamId);
   const status = statuses.find((s) => s.id === statusId);
   const priority = priorities.find((p) => p.id === priorityId);
   const lead = users.find((u) => u.id === leadId) ?? null;
   const initiative = initiatives.find((i) => i.id === initiativeId) ?? null;
   const selectedLabels = useMemo(
      () => labels.filter((l) => labelIds.includes(l.id)),
      [labels, labelIds]
   );

   const toggleLabel = (id: string) =>
      setLabelIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

   const create = async () => {
      if (!name.trim() || !teamId || !statusId || !priorityId || busy) return;
      const healthId = (healthStates.find((h) => h.id === 'no-update') ?? healthStates[0])?.id;
      if (!healthId) {
         toast.error('Health catalog vazio');
         return;
      }
      setBusy(true);
      try {
         const project = await api.projects.create({
            name: name.trim(),
            teamId,
            statusId,
            priorityId,
            healthId,
            leadId,
            startDate: startDate || null,
            targetDate: targetDate || null,
            initiativeId,
            labelIds,
         });
         // Conteúdo editorial (summary + description) e milestones em chamadas dedicadas.
         if (summary.trim() || description.trim()) {
            await api.projects.updateDetail(project.id, {
               summary: summary.trim() || null,
               description: description.trim()
                  ? [{ type: 'paragraph', text: description.trim() }]
                  : null,
            });
         }
         for (const m of milestones) {
            if (m.name.trim())
               await api.projects.addMilestone(project.id, {
                  name: m.name.trim(),
                  targetDate: m.targetDate || null,
               });
         }
         await hydrate();
         reset();
         setOpen(false);
         toast.success('Project created');
      } catch {
         toast.error('Could not create the project');
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog
         open={open}
         onOpenChange={(v) => {
            setOpen(v);
            if (!v) reset();
         }}
      >
         <DialogTrigger asChild>
            <Button className="relative" size="xs" variant="secondary">
               <Plus className="size-4" />
               <span className="hidden sm:inline ml-1">Create project</span>
            </Button>
         </DialogTrigger>
         <DialogContent showCloseButton={false} className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
            <DialogTitle className="sr-only">New project</DialogTitle>

            {/* Header: breadcrumb do time + fechar */}
            <div className="flex items-center justify-between px-5 py-3 border-b">
               <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Popover>
                     <PopoverTrigger asChild>
                        <span className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-accent/50 cursor-pointer text-foreground font-medium">
                           <span
                              className="size-4 rounded-sm inline-flex items-center justify-center text-[10px]"
                              style={{ backgroundColor: team?.color ?? '#6771c5' }}
                           >
                              {team?.name?.[0] ?? '?'}
                           </span>
                           {team?.name ?? 'Select team'}
                        </span>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-56 p-0">
                        <Command>
                           <CommandInput placeholder="Team…" />
                           <CommandList>
                              <CommandEmpty>No teams.</CommandEmpty>
                              <CommandGroup>
                                 {teams.map((t) => (
                                    <CommandItem key={t.id} onSelect={() => setTeamId(t.id)}>
                                       {t.name}
                                       {teamId === t.id && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>
                  <span>›</span>
                  <span>New project</span>
               </div>
               <button
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Close"
               >
                  <X className="size-4" />
               </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
               {/* Ícone + nome + summary */}
               <div className="flex items-start gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-md bg-muted/50 shrink-0 mt-0.5">
                     <Cuboid className="size-5 text-muted-foreground" />
                  </span>
                  <div className="flex-1 min-w-0">
                     <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Project name"
                        maxLength={196}
                        className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground"
                     />
                     <input
                        value={summary}
                        onChange={(e) => setSummary(e.target.value)}
                        placeholder="Add a short summary…"
                        className="w-full bg-transparent text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/70 mt-1"
                     />
                  </div>
               </div>

               {/* Chips de propriedade */}
               <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Status */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={!!status}>
                           {status ? (
                              <>
                                 {(() => {
                                    const Icon = status.icon as IconCmp;
                                    return (
                                       <Icon className="size-3.5" style={{ color: status.color }} />
                                    );
                                 })()}
                                 {status.name}
                              </>
                           ) : (
                              'Status'
                           )}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-52 p-0">
                        <Command>
                           <CommandInput placeholder="Status…" />
                           <CommandList>
                              <CommandEmpty>No results.</CommandEmpty>
                              <CommandGroup>
                                 {statuses.map((s) => {
                                    const Icon = s.icon as IconCmp;
                                    return (
                                       <CommandItem key={s.id} onSelect={() => setStatusId(s.id)}>
                                          <Icon className="size-4" style={{ color: s.color }} />
                                          {s.name}
                                          {statusId === s.id && (
                                             <CheckIcon className="ml-auto size-3.5" />
                                          )}
                                       </CommandItem>
                                    );
                                 })}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>

                  {/* Priority */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={!!priority}>
                           {priority ? (
                              <>
                                 <priority.icon className="size-3.5" />
                                 {priority.name}
                              </>
                           ) : (
                              'Priority'
                           )}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-52 p-0">
                        <Command>
                           <CommandInput placeholder="Priority…" />
                           <CommandList>
                              <CommandEmpty>No results.</CommandEmpty>
                              <CommandGroup>
                                 {priorities.map((p) => (
                                    <CommandItem key={p.id} onSelect={() => setPriorityId(p.id)}>
                                       <p.icon className="size-4 text-muted-foreground" />
                                       {p.name}
                                       {priorityId === p.id && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>

                  {/* Lead */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={!!lead}>
                           {lead ? (
                              <>
                                 <Avatar className="size-4">
                                    <AvatarImage
                                       src={lead.avatarUrl || undefined}
                                       alt={lead.name}
                                    />
                                    <AvatarFallback className="text-[8px]">
                                       {lead.name[0]}
                                    </AvatarFallback>
                                 </Avatar>
                                 {lead.name}
                              </>
                           ) : (
                              <>
                                 <UserRound className="size-3.5" />
                                 Lead
                              </>
                           )}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-56 p-0">
                        <Command>
                           <CommandInput placeholder="Lead…" />
                           <CommandList>
                              <CommandEmpty>No results.</CommandEmpty>
                              <CommandGroup>
                                 <CommandItem onSelect={() => setLeadId(null)}>
                                    <UserRound className="size-4 text-muted-foreground" />
                                    No lead
                                    {!leadId && <CheckIcon className="ml-auto size-3.5" />}
                                 </CommandItem>
                                 {users.map((u) => (
                                    <CommandItem key={u.id} onSelect={() => setLeadId(u.id)}>
                                       <Avatar className="size-4">
                                          <AvatarImage
                                             src={u.avatarUrl || undefined}
                                             alt={u.name}
                                          />
                                          <AvatarFallback className="text-[8px]">
                                             {u.name[0]}
                                          </AvatarFallback>
                                       </Avatar>
                                       {u.name}
                                       {leadId === u.id && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>

                  {/* Start date */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={!!startDate}>
                           <CalendarClock className="size-3.5" />
                           {startDate || 'Start'}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-auto p-2">
                        <input
                           type="date"
                           value={startDate}
                           onChange={(e) => setStartDate(e.target.value)}
                           className="bg-transparent text-sm outline-none"
                        />
                     </PopoverContent>
                  </Popover>

                  {/* Target date */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={!!targetDate}>
                           <CalendarRange className="size-3.5" />
                           {targetDate || 'Target'}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-auto p-2">
                        <input
                           type="date"
                           value={targetDate}
                           onChange={(e) => setTargetDate(e.target.value)}
                           className="bg-transparent text-sm outline-none"
                        />
                     </PopoverContent>
                  </Popover>

                  {/* Initiative */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={!!initiative}>
                           {initiative ? (
                              <>
                                 <span className="text-sm leading-none">{initiative.icon}</span>
                                 {initiative.name}
                              </>
                           ) : (
                              <>
                                 <Target className="size-3.5" />
                                 Initiative
                              </>
                           )}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-56 p-0">
                        <Command>
                           <CommandInput placeholder="Initiative…" />
                           <CommandList>
                              <CommandEmpty>No results.</CommandEmpty>
                              <CommandGroup>
                                 <CommandItem onSelect={() => setInitiativeId(null)}>
                                    <Target className="size-4 text-muted-foreground" />
                                    No initiative
                                    {!initiativeId && <CheckIcon className="ml-auto size-3.5" />}
                                 </CommandItem>
                                 {initiatives.map((i) => (
                                    <CommandItem key={i.id} onSelect={() => setInitiativeId(i.id)}>
                                       <span className="text-sm leading-none">{i.icon}</span>
                                       {i.name}
                                       {initiativeId === i.id && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>

                  {/* Labels */}
                  <Popover>
                     <PopoverTrigger asChild>
                        <Chip active={selectedLabels.length > 0}>
                           <Tag className="size-3.5" />
                           {selectedLabels.length > 0
                              ? `${selectedLabels.length} label${selectedLabels.length > 1 ? 's' : ''}`
                              : 'Labels'}
                        </Chip>
                     </PopoverTrigger>
                     <PopoverContent align="start" className="w-56 p-0">
                        <Command>
                           <CommandInput placeholder="Label…" />
                           <CommandList>
                              <CommandEmpty>No results.</CommandEmpty>
                              <CommandGroup>
                                 {labels.map((l) => (
                                    <CommandItem key={l.id} onSelect={() => toggleLabel(l.id)}>
                                       <span
                                          className="size-2.5 rounded-full"
                                          style={{ backgroundColor: l.color }}
                                       />
                                       {l.name}
                                       {labelIds.includes(l.id) && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           </CommandList>
                        </Command>
                     </PopoverContent>
                  </Popover>

                  {/* Template (opcional, só quando o time tem templates) */}
                  {templates.length > 0 && (
                     <Popover>
                        <PopoverTrigger asChild>
                           <Chip active={!!templateId}>
                              <Plus className="size-3.5" />
                              {templates.find((t) => t.id === templateId)?.name ?? 'Template'}
                           </Chip>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-56 p-0">
                           <Command>
                              <CommandList>
                                 <CommandGroup>
                                    {templates.map((t) => (
                                       <CommandItem key={t.id} onSelect={() => applyTemplate(t.id)}>
                                          {t.name}
                                          {templateId === t.id && (
                                             <CheckIcon className="ml-auto size-3.5" />
                                          )}
                                       </CommandItem>
                                    ))}
                                 </CommandGroup>
                              </CommandList>
                           </Command>
                        </PopoverContent>
                     </Popover>
                  )}
               </div>

               {/* Descrição */}
               <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Write a description, a project brief, or collect ideas…"
                  rows={4}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 resize-none border-t pt-3 mt-1"
               />

               {/* Milestones */}
               <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                     <span className="text-sm font-medium">Milestones</span>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        aria-label="Add milestone"
                        onClick={() =>
                           setMilestones((cur) => [...cur, { name: '', targetDate: '' }])
                        }
                     >
                        <Plus className="size-4" />
                     </Button>
                  </div>
                  {milestones.length > 0 && (
                     <div className="flex flex-col gap-1.5 mt-2">
                        {milestones.map((m, idx) => (
                           <div key={idx} className="flex items-center gap-2">
                              <input
                                 value={m.name}
                                 onChange={(e) =>
                                    setMilestones((cur) =>
                                       cur.map((x, i) =>
                                          i === idx ? { ...x, name: e.target.value } : x
                                       )
                                    )
                                 }
                                 placeholder="Milestone name"
                                 className="flex-1 bg-transparent text-sm outline-none border rounded-md px-2 h-7"
                              />
                              <input
                                 type="date"
                                 value={m.targetDate}
                                 onChange={(e) =>
                                    setMilestones((cur) =>
                                       cur.map((x, i) =>
                                          i === idx ? { ...x, targetDate: e.target.value } : x
                                       )
                                    )
                                 }
                                 className="bg-transparent text-xs outline-none border rounded-md px-2 h-7 text-muted-foreground"
                              />
                              <Button
                                 size="icon"
                                 variant="ghost"
                                 className="size-7"
                                 aria-label="Remove milestone"
                                 onClick={() =>
                                    setMilestones((cur) => cur.filter((_, i) => i !== idx))
                                 }
                              >
                                 <Trash2 className="size-3.5 text-muted-foreground" />
                              </Button>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
               <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
               </Button>
               <Button
                  size="sm"
                  onClick={() => void create()}
                  disabled={busy || !name.trim() || !teamId || !statusId || !priorityId}
               >
                  Create project
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
