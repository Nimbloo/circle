'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorkspaceStore } from '@/store/workspace-store';
import { Project } from '@/data/projects';
import { Box } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ProjectOptions } from '@/components/common/issues/property-options';

interface ProjectSelectorProps {
   project: Project | undefined;
   onChange: (project: Project | undefined) => void;
   /** Time da issue/modal (#32): só projetos dele (o servidor recusa os de outro time). */
   teamId?: string;
   /** Trigger customizado (badge da linha de issue); default: botão com ícone e nome. */
   children?: ReactNode;
}

export function ProjectSelector({ project, teamId, onChange, children }: ProjectSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const projects = useWorkspaceStore((s) => s.projects);
   // Deriva do prop (o dono do valor é quem chama).
   const value = project?.id;

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               {children ?? (
                  <Button
                     id={id}
                     className="flex items-center justify-center"
                     size="xs"
                     variant="secondary"
                     role="combobox"
                     aria-expanded={open}
                  >
                     {value ? (
                        (() => {
                           const selectedProject = projects.find((p) => p.id === value);
                           if (selectedProject) {
                              const Icon = selectedProject.icon;
                              return <Icon className="size-4" />;
                           }
                           return <Box className="size-4" />;
                        })()
                     ) : (
                        <Box className="size-4" />
                     )}
                     <span>
                        {value ? projects.find((p) => p.id === value)?.name : 'No project'}
                     </span>
                  </Button>
               )}
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <ProjectOptions
                  value={project?.id}
                  teamId={teamId}
                  onSelect={(next) => {
                     setOpen(false);
                     onChange(next);
                  }}
               />
            </PopoverContent>
         </Popover>
      </div>
   );
}
