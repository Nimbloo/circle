'use client';

import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import type { Issue } from '@/data/issues';
import type { LabelInterface } from '@/data/labels';
import type { Project } from '@/data/projects';
import { usePriorities, useStatuses, useLabels } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { CheckIcon, FolderIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useIssueCounts } from './issue-counts';

/**
 * Listas de opção dos seletores de propriedade (R1), compartilhadas pela linha/card de
 * issue e pelo modal de criação — os triggers diferem, a lista é uma só. O `value` do
 * cmdk é o id (estável); a busca casa pelo NOME via `keywords` (#31: status/label/projeto
 * com id opaco ou renomeados não eram achados). Montadas só com o popover aberto: só
 * então assinam as issues para as contagens.
 */

const byStatus = (issue: Issue) => issue.status.id;
const byPriority = (issue: Issue) => issue.priority.id;
const byLabel = (issue: Issue) => issue.labels.map((l) => l.id);
const byProject = (issue: Issue) => issue.project?.id;

const itemClass = 'flex items-center justify-between';

function Count({ n }: { n: number }) {
   return <span className="text-muted-foreground text-xs">{n}</span>;
}

export function StatusOptions({
   value,
   onSelect,
}: {
   value: string | undefined;
   onSelect: (statusId: string) => void;
}) {
   const allStatus = useStatuses();
   const counts = useIssueCounts(byStatus);
   return (
      <Command>
         <CommandInput placeholder="Set status..." />
         <CommandList>
            <CommandEmpty>No status found.</CommandEmpty>
            <CommandGroup>
               {allStatus.map((item) => (
                  <CommandItem
                     key={item.id}
                     value={item.id}
                     keywords={[item.name]}
                     onSelect={() => onSelect(item.id)}
                     className={itemClass}
                  >
                     <div className="flex items-center gap-2">
                        <item.icon />
                        {item.name}
                     </div>
                     {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                     <Count n={counts.get(item.id) ?? 0} />
                  </CommandItem>
               ))}
            </CommandGroup>
         </CommandList>
      </Command>
   );
}

export function PriorityOptions({
   value,
   onSelect,
}: {
   value: string | undefined;
   onSelect: (priorityId: string) => void;
}) {
   const priorities = usePriorities();
   const counts = useIssueCounts(byPriority);
   return (
      <Command>
         <CommandInput placeholder="Set priority..." />
         <CommandList>
            <CommandEmpty>No priority found.</CommandEmpty>
            <CommandGroup>
               {priorities.map((item) => (
                  <CommandItem
                     key={item.id}
                     value={item.id}
                     keywords={[item.name]}
                     onSelect={() => onSelect(item.id)}
                     className={itemClass}
                  >
                     <div className="flex items-center gap-2">
                        <item.icon className="text-muted-foreground size-4" />
                        {item.name}
                     </div>
                     {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                     <Count n={counts.get(item.id) ?? 0} />
                  </CommandItem>
               ))}
            </CommandGroup>
         </CommandList>
      </Command>
   );
}

export function LabelOptions({
   selected,
   onToggle,
}: {
   selected: LabelInterface[];
   onToggle: (label: LabelInterface) => void;
}) {
   const labels = useLabels();
   const counts = useIssueCounts(byLabel);
   return (
      <Command>
         <CommandInput placeholder="Search labels..." />
         <CommandList>
            <CommandEmpty>No labels found.</CommandEmpty>
            <CommandGroup>
               {labels.map((label) => (
                  <CommandItem
                     key={label.id}
                     value={label.id}
                     keywords={[label.name]}
                     onSelect={() => onToggle(label)}
                     className={itemClass}
                  >
                     <div className="flex items-center gap-2">
                        <div
                           className="size-3 rounded-full"
                           style={{ backgroundColor: label.color }}
                        />
                        <span>{label.name}</span>
                     </div>
                     {selected.some((l) => l.id === label.id) && (
                        <CheckIcon size={16} className="ml-auto" />
                     )}
                     <Count n={counts.get(label.id) ?? 0} />
                  </CommandItem>
               ))}
            </CommandGroup>
         </CommandList>
      </Command>
   );
}

/** `teamId` (#32): só projetos do time da issue/modal — o servidor recusa os de outro. */
export function ProjectOptions({
   value,
   teamId,
   onSelect,
}: {
   value: string | undefined;
   teamId?: string;
   onSelect: (project: Project | undefined) => void;
}) {
   const allProjects = useWorkspaceStore((s) => s.projects);
   const projects = useMemo(
      () => (teamId ? allProjects.filter((p) => p.teamId === teamId) : allProjects),
      [allProjects, teamId]
   );
   const counts = useIssueCounts(byProject);
   return (
      <Command>
         <CommandInput placeholder="Set project..." />
         <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup>
               <CommandItem
                  value="no-project"
                  keywords={['No project']}
                  onSelect={() => onSelect(undefined)}
                  className={itemClass}
               >
                  <div className="flex items-center gap-2">
                     <FolderIcon className="size-4" />
                     No Project
                  </div>
                  {value === undefined && <CheckIcon size={16} className="ml-auto" />}
               </CommandItem>
               {projects.map((project) => (
                  <CommandItem
                     key={project.id}
                     value={project.id}
                     keywords={[project.name]}
                     onSelect={() => onSelect(project)}
                     className={itemClass}
                  >
                     <div className="flex items-center gap-2">
                        <project.icon className="size-4" />
                        {project.name}
                     </div>
                     {value === project.id && <CheckIcon size={16} className="ml-auto" />}
                     <Count n={counts.get(project.id) ?? 0} />
                  </CommandItem>
               ))}
            </CommandGroup>
         </CommandList>
      </Command>
   );
}
