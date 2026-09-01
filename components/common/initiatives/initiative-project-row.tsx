import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Project } from '@/data/projects';
import { CalendarRange, X } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

interface InitiativeProjectRowProps {
   project: Project;
   orgId: string;
   onRemove: (projectId: string) => void;
}

const formatTarget = (iso: string): string => {
   const [, month, day] = iso.split('-').map(Number);
   const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
   ];
   return `${months[(month ?? 1) - 1]} ${day}`;
};

export function InitiativeProjectRow({ project, orgId, onRemove }: InitiativeProjectRowProps) {
   return (
      <div className="group/row -mx-1 flex items-center rounded-md px-1 transition-colors hover:bg-sidebar/50 focus-within:bg-sidebar/50">
         <Link
            href={`/${orgId}/project/${project.id}/overview`}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 text-sm"
         >
            <project.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate font-medium">{project.name}</span>
            <span className="hidden w-16 shrink-0 sm:block">
               <span
                  className="inline-block size-2.5 rounded-full"
                  style={{ backgroundColor: project.health.color }}
               />
            </span>
            <span className="hidden w-16 shrink-0 sm:block">
               <project.priority.icon className="size-4 text-muted-foreground" />
            </span>
            <span className="hidden w-12 shrink-0 md:block">
               <Avatar className="size-5">
                  <AvatarImage
                     src={project.lead?.avatarUrl || undefined}
                     alt={project.lead?.name ?? ''}
                  />
                  <AvatarFallback className="text-[9px]">
                     {project.lead?.name[0] ?? '—'}
                  </AvatarFallback>
               </Avatar>
            </span>
            <span className="hidden w-24 shrink-0 items-center gap-1 text-xs text-muted-foreground md:flex">
               {project.targetDate ? (
                  <>
                     <CalendarRange className="size-3.5" />
                     {formatTarget(project.targetDate)}
                  </>
               ) : (
                  '—'
               )}
            </span>
            <span className="w-16 shrink-0 text-xs text-muted-foreground">
               {project.percentComplete}%
            </span>
         </Link>
         <button
            type="button"
            aria-label={`Remove ${project.name} from initiative`}
            onClick={() => onRemove(project.id)}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:transition-opacity sm:group-hover/row:opacity-100 sm:focus-visible:opacity-100"
         >
            <X className="size-3.5" />
         </button>
      </div>
   );
}
