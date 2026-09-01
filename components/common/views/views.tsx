'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/common/list-skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { View } from '@/data/views';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useViewsDisplayStore, ViewsOrdering } from '@/store/views-display-store';
import { useFavoritesStore } from '@/store/favorites-store';
import { ArrowDown, Layers3, SlidersHorizontal, Star } from 'lucide-react';
import { CreateViewButton } from './create-view-dialog';
import { ViewActions } from './view-actions';
import { ViewBar } from '@/components/layout/header-primitives';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo } from 'react';

const TABS = ['issues', 'projects'] as const;
const VIEW_TABS: { value: (typeof TABS)[number]; label: string }[] = [
   { value: 'issues', label: 'Issues' },
   { value: 'projects', label: 'Projects' },
];

const formatDate = (iso: string): string => {
   // `iso` é um timestamp ISO completo (createdAt/updatedAt) — split('-') pegava
   // "24T12:34:56Z" no dia (→ NaN "Aug NaN, 2026"). Parse via Date.
   const d = new Date(iso);
   if (Number.isNaN(d.getTime())) return '—';
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
   return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

function DisplayOptions() {
   const { ordering, displayProperties, setOrdering, toggleProperty } = useViewsDisplayStore();

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="size-7 p-0" aria-label="Display options">
               <SlidersHorizontal className="size-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent
            align="end"
            sideOffset={4}
            className="w-[302px] rounded-xl border-[var(--popover-border)] bg-popover p-0 pt-2"
            style={{ boxShadow: 'var(--popover-shadow)' }}
         >
            <div className="flex h-12 items-center justify-between px-4 py-2">
               <span className="w-20 text-xs font-medium leading-[normal] text-muted-foreground">
                  Ordering
               </span>
               <span className="flex flex-1 justify-end">
                  <Select
                     value={ordering}
                     onValueChange={(value) => setOrdering(value as ViewsOrdering)}
                  >
                     <SelectTrigger className="relative h-6 w-auto min-w-[63px] rounded-lg border-transparent px-2 py-px pr-[18px] text-xs leading-[normal] shadow-none [&_svg]:absolute [&_svg]:right-2 [&_svg]:size-2.5">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="name">Name</SelectItem>
                        <SelectItem value="created">Created</SelectItem>
                        <SelectItem value="updated">Updated</SelectItem>
                     </SelectContent>
                  </Select>
               </span>
            </div>
            <div className="flex flex-col border-t px-4 py-2">
               <span className="mb-1 mt-2 text-xs font-medium leading-[normal] text-muted-foreground">
                  Display properties
               </span>
               <div className="mt-2 flex flex-wrap gap-px">
                  {(
                     [
                        ['created', 'Created'],
                        ['updated', 'Updated'],
                        ['owner', 'Owner'],
                     ] as const
                  ).map(([key, label]) => (
                     <button
                        key={key}
                        type="button"
                        onClick={() => toggleProperty(key)}
                        className={cn(
                           'mr-1 mb-1 h-6 rounded-full border border-transparent px-2 text-xs font-medium leading-[normal] transition-colors',
                           displayProperties[key]
                              ? 'bg-accent text-foreground'
                              : 'bg-muted/40 text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                     >
                        {label}
                     </button>
                  ))}
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}

function ViewRow({ view, orgId }: { view: View; orgId: string }) {
   const { displayProperties } = useViewsDisplayStore();
   const isFavorite = useFavoritesStore((s) => s.isFavorite('view', view.id));
   const toggleFavorite = useFavoritesStore((s) => s.toggle);
   return (
      <div className="flex h-11 items-center gap-3 px-[18px] hover:bg-accent/40 transition-colors">
         <Link
            href={`/${orgId}/view/${view.id}`}
            className="flex items-center gap-3 min-w-0 flex-1"
         >
            <span className="inline-flex size-[18px] items-center justify-center rounded bg-muted/50 text-xs shrink-0">
               {view.icon}
            </span>
            <span className="flex flex-col min-w-0 flex-1">
               <span className="truncate text-[13px] font-medium leading-4">{view.name}</span>
               <span className="text-xs text-muted-foreground truncate">{view.description}</span>
            </span>
            {displayProperties.created && (
               <span className="hidden sm:block text-xs text-muted-foreground w-24 shrink-0">
                  {formatDate(view.createdAt)}
               </span>
            )}
            {displayProperties.updated && (
               <span className="hidden sm:block text-xs text-muted-foreground w-24 shrink-0">
                  {formatDate(view.updatedAt)}
               </span>
            )}
            {displayProperties.owner && (
               <span className="flex items-center gap-1.5 w-32 shrink-0 justify-end">
                  <Avatar className="size-5">
                     <AvatarImage src={view.owner.avatarUrl || undefined} alt={view.owner.name} />
                     <AvatarFallback className="text-[9px]">{view.owner.name[0]}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate max-w-24">
                     {view.owner.name}
                  </span>
               </span>
            )}
         </Link>
         <button
            type="button"
            onClick={() => void toggleFavorite('view', view.id)}
            aria-label={isFavorite ? 'Unfavorite view' : 'Favorite view'}
            className="shrink-0"
         >
            <Star
               className={cn(
                  'size-4 transition-colors',
                  isFavorite
                     ? 'fill-yellow-400 text-yellow-400'
                     : 'text-muted-foreground hover:text-foreground'
               )}
            />
         </button>
         <ViewActions view={view} />
      </div>
   );
}

/**
 * "Views" page: saved issue / project views. With a `teamId`, only that
 * team's views are listed (team sidebar "Views" entry); otherwise the whole
 * workspace is shown.
 */
export default function Views({ teamId }: { teamId?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('issues'));
   const { ordering } = useViewsDisplayStore();
   const views = useWorkspaceStore((s) => s.views);
   const loaded = useWorkspaceStore((s) => s.loaded);
   const teams = useWorkspaceStore((s) => s.teams);
   const team = teamId ? teams.find((entry) => entry.id === teamId) : undefined;
   const favoriteItems = useFavoritesStore((s) => s.items);

   const list = useMemo(() => {
      const favSet = new Set(
         favoriteItems.filter((f) => f.entityType === 'view').map((f) => f.entityId)
      );
      let source = views.filter((view) => view.type === (tab === 'issues' ? 'issue' : 'project'));
      if (teamId) source = source.filter((view) => view.teamId === teamId);
      return [...source].sort((a, b) => {
         // Favoritas primeiro, depois a ordenação escolhida.
         const af = favSet.has(a.id) ? 0 : 1;
         const bf = favSet.has(b.id) ? 0 : 1;
         if (af !== bf) return af - bf;
         if (ordering === 'created') return b.createdAt.localeCompare(a.createdAt);
         if (ordering === 'updated') return b.updatedAt.localeCompare(a.updatedAt);
         return a.name.localeCompare(b.name);
      });
   }, [views, tab, ordering, teamId, favoriteItems]);

   return (
      <div className="flex h-full w-full flex-col overflow-hidden">
         <ViewBar className="pl-2 pr-2.5">
            <div className="flex translate-y-[0.5px] items-center gap-1.5">
               {VIEW_TABS.map((candidate) => (
                  <button
                     key={candidate.value}
                     type="button"
                     onClick={() => setTab(candidate.value)}
                     className={cn(
                        'h-7 rounded-full border border-transparent px-2.5 text-xs font-medium leading-[normal] transition-colors',
                        tab === candidate.value
                           ? 'bg-accent text-foreground'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {candidate.label}
                  </button>
               ))}
            </div>
            <div className="translate-y-[0.5px]">
               <DisplayOptions />
            </div>
         </ViewBar>

         {list.length === 0 && loaded ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
               <div className="flex w-[340px] translate-y-[13.5px] flex-col gap-6">
                  <div className="flex h-20 items-center">
                     <Layers3 className="size-20 stroke-[0.8] text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                     <h3 className="text-[15px] font-semibold leading-[23px]">Views</h3>
                     <div className="mt-2 text-[13px] font-[450] leading-[18.2px] text-muted-foreground">
                        <p>
                           Create custom views using filters to show only the issues you want to
                           see. You can save, share, and favorite these views for easy access and
                           faster team collaboration.
                        </p>
                        <p className="mt-4">
                           You can also save any existing view from its view controls for faster
                           access later.
                        </p>
                     </div>
                  </div>
                  <div className="flex h-7 items-center">
                     <CreateViewButton label="Create new view" variant="default" />
                  </div>
               </div>
            </div>
         ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
               <div className="h-8 pl-[18px] pr-[34px] flex items-center gap-1 border-b border-border/40 text-xs font-[450] leading-[normal] text-[var(--table-header-foreground)]">
                  Name
                  <ArrowDown className="size-3" />
               </div>

               <div className="flex h-10 items-center justify-between border-b border-border/50 bg-sidebar/60 px-[18px]">
                  <span className="flex items-center gap-2 text-[13px]">
                     {team ? (
                        <span className="inline-flex size-[18px] items-center justify-center rounded bg-muted/50 text-xs">
                           {team.icon}
                        </span>
                     ) : (
                        <span className="inline-flex size-[18px] items-center justify-center rounded bg-primary text-primary-foreground text-[9px] font-semibold">
                           N
                        </span>
                     )}
                     <span className="font-medium">{team ? team.name : 'Nimbloo'}</span>
                     <span className="text-xs text-muted-foreground">
                        · {team ? 'Team' : 'Workspace'}
                     </span>
                  </span>
                  <CreateViewButton teamId={teamId} />
               </div>

               {list.map((view) => (
                  <ViewRow key={view.id} view={view} orgId={orgId} />
               ))}
               {list.length === 0 && !loaded && (
                  <div className="py-4">
                     <ListSkeleton rows={4} />
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
