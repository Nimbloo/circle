'use client';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Team } from '@/data/teams';

/** Avatar do time colorido pela cor dele (mesmo glifo da sidebar). */
function TeamGlyph({ team }: { team: Team }) {
   return (
      <span
         className="flex size-4 shrink-0 items-center justify-center rounded-[4px] text-[10px] leading-none text-white"
         style={{ backgroundColor: team.color }}
      >
         {team.icon || team.name.charAt(0).toUpperCase()}
      </span>
   );
}

/**
 * Chip de time no topo do modal de criação (is#6, como o "ENG ›" do Linear): mostra em
 * qual time a issue vai nascer e permite trocar.
 */
export function TeamSelector({
   teams,
   value,
   onChange,
}: {
   teams: Team[];
   value: string;
   onChange: (teamId: string) => void;
}) {
   const current = teams.find((t) => t.id === value);
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <button
               type="button"
               aria-label={`Team: ${current?.name ?? 'none'}`}
               className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
               {current && <TeamGlyph team={current} />}
               <span>{current?.id ?? 'Team'}</span>
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
               {teams.map((t) => (
                  <DropdownMenuRadioItem key={t.id} value={t.id}>
                     <TeamGlyph team={t} />
                     <span className="truncate">{t.name}</span>
                     <span className="ml-auto text-xs text-muted-foreground">{t.id}</span>
                  </DropdownMenuRadioItem>
               ))}
            </DropdownMenuRadioGroup>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
