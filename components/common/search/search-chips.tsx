'use client';

import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStatuses } from '@/store/catalog-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { SearchEntityType } from '@/lib/client';
import { ChevronDown } from 'lucide-react';

export interface SearchFilters {
   /** Vazio = todos os tipos. */
   types: SearchEntityType[];
   teamId?: string;
   statusId?: string;
}

export const EMPTY_SEARCH_FILTERS: SearchFilters = { types: [] };

const TYPE_LABEL: Record<SearchEntityType, string> = {
   issue: 'Issues',
   project: 'Projects',
   initiative: 'Initiatives',
   document: 'Documents',
};

const ALL_TYPES: SearchEntityType[] = ['issue', 'project', 'initiative', 'document'];

/** Chip no padrão Linear: pílula discreta que fica em destaque quando tem valor. */
function Chip({
   label,
   value,
   children,
}: {
   label: string;
   value?: string;
   children: React.ReactNode;
}) {
   return (
      <DropdownMenu>
         <DropdownMenuTrigger
            aria-label={label}
            className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors hover:bg-accent ${
               value ? 'bg-accent text-foreground' : 'text-muted-foreground'
            }`}
         >
            <span>{label}</span>
            {value && <span className="max-w-[140px] truncate font-medium">{value}</span>}
            <ChevronDown className="size-3 opacity-60" />
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="min-w-44">
            {children}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}

/** Chips rápidos da busca: Type (multi), Team e Status (issues). */
export function SearchChips({
   value,
   onChange,
}: {
   value: SearchFilters;
   onChange: (next: SearchFilters) => void;
}) {
   const teams = useWorkspaceStore((s) => s.teams);
   const statuses = useStatuses();

   const team = teams.find((t) => t.id === value.teamId);
   const status = statuses.find((s) => s.id === value.statusId);
   const typeLabel = value.types.length
      ? value.types.map((t) => TYPE_LABEL[t]).join(', ')
      : undefined;

   const toggleType = (t: SearchEntityType) => {
      const has = value.types.includes(t);
      onChange({ ...value, types: has ? value.types.filter((x) => x !== t) : [...value.types, t] });
   };

   return (
      <div className="flex flex-wrap items-center gap-1.5">
         <Chip label="Type" value={typeLabel}>
            {ALL_TYPES.map((t) => (
               <DropdownMenuCheckboxItem
                  key={t}
                  checked={value.types.includes(t)}
                  onSelect={(e) => {
                     e.preventDefault();
                     toggleType(t);
                  }}
               >
                  {TYPE_LABEL[t]}
               </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange({ ...value, types: [] })}>
               All types
            </DropdownMenuItem>
         </Chip>

         <Chip label="Team" value={team?.name}>
            <DropdownMenuItem onSelect={() => onChange({ ...value, teamId: undefined })}>
               All teams
            </DropdownMenuItem>
            {teams.length > 0 && <DropdownMenuSeparator />}
            {teams.map((t) => (
               <DropdownMenuItem key={t.id} onSelect={() => onChange({ ...value, teamId: t.id })}>
                  {t.name}
               </DropdownMenuItem>
            ))}
         </Chip>

         <Chip label="Status" value={status?.name}>
            <DropdownMenuItem onSelect={() => onChange({ ...value, statusId: undefined })}>
               Any status
            </DropdownMenuItem>
            {statuses.length > 0 && <DropdownMenuSeparator />}
            {statuses.map((s) => (
               <DropdownMenuItem key={s.id} onSelect={() => onChange({ ...value, statusId: s.id })}>
                  {s.name}
               </DropdownMenuItem>
            ))}
         </Chip>
      </div>
   );
}
