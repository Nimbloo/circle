'use client';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { formatCycleDateRange } from '@/data/cycles';
import { Issue } from '@/data/issues';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLabels, usePriorities, useStatuses } from '@/store/catalog-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRecentsStore } from '@/store/recents-store';
import { api, type SearchEntityType, type SearchGroup } from '@/lib/client';
import { SearchSnippet } from '@/components/common/search/search-snippet';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore } from '@/store/workspace-store';
import {
   Box,
   CalendarPlus,
   Check,
   CircleDot,
   Clipboard,
   ClipboardList,
   ClipboardType,
   Compass,
   ContactRound,
   FileText,
   GitBranch,
   Inbox,
   Layers,
   Link2,
   SquarePen,
   Tags,
   Type,
   UserRound,
   UserRoundMinus,
   UserRoundPlus,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

type PaletteRoute =
   | 'root'
   | 'assign'
   | 'status'
   | 'priority'
   | 'labels'
   | 'project'
   | 'cycle'
   | 'team'
   | 'due-date';

/** Small keyboard hint chips on the right of a command row. */
function Keys({ keys }: { keys: string[] }) {
   return (
      <span className="ml-auto flex items-center gap-1">
         {keys.map((key, index) => (
            <kbd
               key={index}
               className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded border bg-muted/50 text-[11px] text-muted-foreground font-sans"
            >
               {key}
            </kbd>
         ))}
      </span>
   );
}

/** ⌘K command palette — Linear-style, aware of the issue in context. */
export function CommandPalette() {
   const [open, setOpen] = useState(false);
   const [route, setRoute] = useState<PaletteRoute>('root');
   const [query, setQuery] = useState('');
   /** When true, the issue context chip was dismissed with ⌫. */
   const [contextCleared, setContextCleared] = useState(false);

   const pathname = usePathname();
   const router = useRouter();
   const {
      issues,
      updateIssueStatus,
      updateIssuePriority,
      updateIssueAssignee,
      addIssueLabel,
      removeIssueLabel,
      updateIssueProject,
      updateIssue,
   } = useIssuesStore(
      useShallow((s) => ({
         issues: s.issues,
         updateIssueStatus: s.updateIssueStatus,
         updateIssuePriority: s.updateIssuePriority,
         updateIssueAssignee: s.updateIssueAssignee,
         addIssueLabel: s.addIssueLabel,
         removeIssueLabel: s.removeIssueLabel,
         updateIssueProject: s.updateIssueProject,
         updateIssue: s.updateIssue,
      }))
   );
   const { openModal } = useCreateIssueStore();
   const allStatus = useStatuses();
   const priorities = usePriorities();
   const allLabels = useLabels();
   const cycles = useWorkspaceStore((s) => s.cycles);
   const allProjects = useWorkspaceStore((s) => s.projects);
   const users = useWorkspaceStore((s) => s.users);

   const orgId = pathname.split('/')[1] || 'nimbloo';

   // Busca server-side (best-effort, debounced) pelo índice full-text (#99): casa a
   // DESCRIÇÃO da issue (corpo) — que a busca client-side não alcança — e traz também
   // initiatives e documents, que não vivem no store. Issues e projects seguem
   // resolvidos contra o store (render consistente); o snippet vem do servidor.
   const [serverGroups, setServerGroups] = useState<SearchGroup[]>([]);
   useEffect(() => {
      const q = query.trim();
      if (q.length < 2) {
         setServerGroups([]);
         return;
      }
      let active = true;
      const t = setTimeout(() => {
         api.search
            .query({ q, limit: 6 })
            .then((res) => {
               if (active) setServerGroups(res.groups);
            })
            .catch(() => {
               // best-effort: mantém só a busca client-side se o servidor falhar
            });
      }, 250);
      return () => {
         active = false;
         clearTimeout(t);
      };
   }, [query]);

   const serverItems = useCallback(
      (type: SearchEntityType) => serverGroups.find((g) => g.type === type)?.items ?? [],
      [serverGroups]
   );

   // Busca de entidades no ⌘K (padrão Linear): quando o usuário digita, além dos
   // comandos estáticos, mostra issues/projects/members que casam com o texto e
   // navega direto. Antes o ⌘K só filtrava a lista fixa de comandos.
   const searchResults = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q)
         return {
            issues: [],
            projects: [],
            members: [],
            initiatives: [],
            documents: [],
            snippets: new Map<string, string>(),
         };
      const serverIssues = serverItems('issue');
      const serverIssueIds = new Set(serverIssues.map((i) => i.id));
      const clientIssues = issues.filter(
         (i) => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q)
      );
      // Adiciona matches por descrição (server) que o client não pegou.
      const serverExtra = issues.filter(
         (i) => serverIssueIds.has(i.id) && !clientIssues.some((c) => c.id === i.id)
      );
      const serverProjectIds = new Set(serverItems('project').map((p) => p.id));
      const clientProjects = allProjects.filter((p) => p.name.toLowerCase().includes(q));
      const projectExtra = allProjects.filter(
         (p) => serverProjectIds.has(p.id) && !clientProjects.some((c) => c.id === p.id)
      );
      const snippets = new Map<string, string>(
         serverGroups.flatMap((g) => g.items.map((i) => [i.id, i.snippet] as const))
      );
      return {
         issues: [...clientIssues, ...serverExtra].slice(0, 6),
         projects: [...clientProjects, ...projectExtra].slice(0, 4),
         members: users
            .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
            .slice(0, 4),
         initiatives: serverItems('initiative').slice(0, 4),
         documents: serverItems('document').slice(0, 4),
         snippets,
      };
   }, [query, issues, allProjects, users, serverGroups, serverItems]);
   const hasSearchResults =
      searchResults.issues.length +
         searchResults.projects.length +
         searchResults.members.length +
         searchResults.initiatives.length +
         searchResults.documents.length >
      0;

   const contextIssue = useMemo<Issue | undefined>(() => {
      const match = pathname.match(/^\/[^/]+\/issue\/([^/]+)/);
      if (!match) return undefined;
      return issues.find((issue) => issue.identifier === match[1]);
   }, [pathname, issues]);

   const issue = contextCleared ? undefined : contextIssue;

   // Registro de "recentes": grava a entidade da rota atual (issue/project) p/ o
   // grupo "Recently viewed" do ⌘K. Captura toda visita, não só via palette.
   const recents = useRecentsStore((s) => s.recents);
   const pushRecent = useRecentsStore((s) => s.push);
   // Guarda o último recent gravado: como as deps incluem `issues`/`allProjects` (arrays
   // que trocam de ref a cada mutação do store), o effect re-roda muito; sem este guard
   // ele re-gravaria o MESMO recent (localStorage + re-render à toa). Mantém o dep de
   // `issues`/`allProjects` p/ o auto-heal (grava quando a entidade finalmente hidrata).
   const lastPushedRef = useRef<string>('');
   useEffect(() => {
      const push = (r: Parameters<typeof pushRecent>[0]) => {
         const key = `${r.type}:${r.id}`;
         if (lastPushedRef.current === key) return;
         lastPushedRef.current = key;
         pushRecent(r);
      };
      const im = pathname.match(/^\/[^/]+\/issue\/([^/]+)/);
      if (im) {
         const found = issues.find((i) => i.identifier === im[1]);
         if (found)
            push({ type: 'issue', id: found.id, label: found.title, identifier: found.identifier });
         return;
      }
      const pm = pathname.match(/^\/[^/]+\/project\/([^/]+)/);
      if (pm) {
         const found = allProjects.find((p) => p.id === pm[1]);
         if (found) push({ type: 'project', id: found.id, label: found.name });
      }
   }, [pathname, issues, allProjects, pushRecent]);

   const reset = useCallback(() => {
      setRoute('root');
      setQuery('');
      setContextCleared(false);
   }, []);

   const close = useCallback(() => {
      setOpen(false);
      reset();
   }, [reset]);

   // Feedback truthful: toasta sucesso SÓ quando a mutação confirma na API. O store já
   // faz rollback + toast.error na falha (fonte única) → sem duplo-toast contraditório.
   const withToast = (p: Promise<void>, msg: string) => {
      void p.then(() => toast.success(msg)).catch(() => {});
   };

   // ⌘K / Ctrl+K
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            setOpen((value) => {
               if (value) reset();
               return !value;
            });
         }
      };
      window.addEventListener('keydown', onKeyDown);
      // Abertura via UI (ex.: botão "Search" da sidebar) — mesmo palette.
      const onOpen = () => setOpen(true);
      window.addEventListener('circle:open-command', onOpen);
      return () => {
         window.removeEventListener('keydown', onKeyDown);
         window.removeEventListener('circle:open-command', onOpen);
      };
   }, [reset]);

   const copy = useCallback(
      async (label: string, text: string) => {
         try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied to clipboard`);
         } catch {
            toast.error('Could not access the clipboard');
         }
         close();
      },
      [close]
   );

   const issueUrl = issue
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${orgId}/issue/${issue.identifier}`
      : '';
   const branchName = issue
      ? `${users[0]?.id ?? 'me'}/${issue.identifier.toLowerCase()}-${issue.title
           .toLowerCase()
           .replace(/[^a-z0-9]+/g, '-')
           .replace(/^-|-$/g, '')
           .slice(0, 40)}`
      : '';

   const go = (path: string) => {
      router.push(`/${orgId}${path}`);
      close();
   };

   const input = (
      <div className="relative">
         <CommandInput
            autoFocus
            placeholder="Type a command or search…"
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
               if (event.key === 'Escape' && route !== 'root') {
                  event.preventDefault();
                  event.stopPropagation();
                  setRoute('root');
                  setQuery('');
               }
               if (event.key === 'Backspace' && query === '' && route !== 'root') {
                  setRoute('root');
               }
               if (event.key === 'Tab' && route === 'root') {
                  event.preventDefault();
                  go('/agent');
               }
            }}
         />
         {route === 'root' && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-muted-foreground pointer-events-none">
               Ask Agent
               <kbd className="h-5 px-1.5 inline-flex items-center rounded border bg-muted/50 text-[11px] font-sans">
                  Tab
               </kbd>
            </span>
         )}
      </div>
   );

   return (
      <Dialog
         open={open}
         onOpenChange={(value) => {
            setOpen(value);
            if (!value) reset();
         }}
      >
         <DialogContent
            showCloseButton={false}
            className="top-[22%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[640px]"
         >
            <DialogTitle className="sr-only">Command menu</DialogTitle>
            <DialogDescription className="sr-only">Type a command or search</DialogDescription>
            <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2.5">
               {issue && (
                  <div className="flex items-center gap-1.5 px-3 pt-3 pb-1">
                     <span className="inline-flex items-center gap-1.5 max-w-full rounded-md bg-muted/70 border border-border/60 px-2 py-1 text-xs">
                        <span className="text-muted-foreground shrink-0">{issue.identifier} ⋅</span>
                        <span className="truncate">{issue.title}</span>
                        <button
                           tabIndex={-1}
                           onClick={() => setContextCleared(true)}
                           className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                           aria-label="Clear issue context"
                        >
                           ⌫
                        </button>
                     </span>
                  </div>
               )}
               {input}
               <CommandList className="max-h-96">
                  <CommandEmpty>No results found.</CommandEmpty>

                  {route === 'root' && issue && (
                     <>
                        <CommandGroup heading="Issue">
                           <CommandItem
                              onSelect={() => {
                                 setRoute('assign');
                                 setQuery('');
                              }}
                           >
                              <UserRoundPlus className="text-muted-foreground" />
                              Assign to…
                              <Keys keys={['A']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 withToast(updateIssueAssignee(issue.id, null), 'Un-assigned');
                                 close();
                              }}
                           >
                              <UserRoundMinus className="text-muted-foreground" />
                              Un-assign from me
                              <Keys keys={['I']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('status');
                                 setQuery('');
                              }}
                           >
                              <CircleDot className="text-muted-foreground" />
                              Change status…
                              <Keys keys={['S']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('priority');
                                 setQuery('');
                              }}
                           >
                              <Layers className="text-muted-foreground" />
                              Set priority…
                              <Keys keys={['P']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('project');
                                 setQuery('');
                              }}
                           >
                              <Box className="text-muted-foreground" />
                              Move to project…
                              <Keys keys={['⇧', 'P']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('labels');
                                 setQuery('');
                              }}
                           >
                              <Tags className="text-muted-foreground" />
                              Change or add labels…
                              <Keys keys={['L']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('cycle');
                                 setQuery('');
                              }}
                           >
                              <CircleDot className="text-muted-foreground" />
                              Move to cycle…
                              <Keys keys={['⇧', 'C']} />
                           </CommandItem>
                           {/* "Move to a different team" removido: era falso-sucesso (toast
                               sem persistir; mover de time troca o identifier, não suportado). */}
                           <CommandItem
                              onSelect={() => {
                                 setRoute('due-date');
                                 setQuery('');
                              }}
                           >
                              <CalendarPlus className="text-muted-foreground" />
                              Set due date…
                              <Keys keys={['⇧', 'D']} />
                           </CommandItem>
                        </CommandGroup>
                        <CommandGroup heading="Copy">
                           <CommandItem onSelect={() => copy('Issue ID', issue.identifier)}>
                              <Clipboard className="text-muted-foreground" />
                              Copy issue ID
                              <Keys keys={['⌘', '.']} />
                           </CommandItem>
                           <CommandItem onSelect={() => copy('Issue URL', issueUrl)}>
                              <Link2 className="text-muted-foreground" />
                              Copy issue URL
                              <Keys keys={['⌘', '⇧', ',']} />
                           </CommandItem>
                           <CommandItem onSelect={() => copy('Issue title', issue.title)}>
                              <Type className="text-muted-foreground" />
                              Copy issue title
                              <Keys keys={['⌘', '⇧', "'"]} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() =>
                                 copy(
                                    'Title link',
                                    `[${issue.identifier}: ${issue.title}](${issueUrl})`
                                 )
                              }
                           >
                              <Link2 className="text-muted-foreground" />
                              Copy title as link
                              <Keys keys={['⌘', 'C']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => copy('Description', issue.description || issue.title)}
                           >
                              <FileText className="text-muted-foreground" />
                              Copy issue description as Markdown
                           </CommandItem>
                           <CommandItem
                              onSelect={() =>
                                 copy(
                                    'Issue content',
                                    `# ${issue.identifier}: ${issue.title}\n\n${issue.description || ''}\n\n- Status: ${issue.status.name}\n- Priority: ${issue.priority.name}\n- Assignee: ${issue.assignee?.name ?? 'Unassigned'}`
                                 )
                              }
                           >
                              <ClipboardType className="text-muted-foreground" />
                              Copy issue content as Markdown
                              <Keys keys={['⌘', '⌥', 'C']} />
                           </CommandItem>
                           <CommandItem onSelect={() => copy('Branch name', branchName)}>
                              <GitBranch className="text-muted-foreground" />
                              Copy git branch name
                              <Keys keys={['⌘', '⇧', '.']} />
                           </CommandItem>
                           <CommandItem
                              onSelect={() =>
                                 copy(
                                    'Prompt',
                                    `Work on the following issue.\n\nIssue ${issue.identifier}: ${issue.title}\n${issue.description || ''}\nStatus: ${issue.status.name} — Priority: ${issue.priority.name}`
                                 )
                              }
                           >
                              <ClipboardList className="text-muted-foreground" />
                              Copy as prompt
                              <Keys keys={['⌘', '⌥', 'P']} />
                           </CommandItem>
                        </CommandGroup>
                     </>
                  )}

                  {route === 'root' && !issue && (
                     <>
                        {!query.trim() && recents.length > 0 && (
                           <CommandGroup heading="Recently viewed">
                              {recents.map((r) => (
                                 <CommandItem
                                    key={`${r.type}:${r.id}`}
                                    value={`recent ${r.identifier ?? ''} ${r.label}`}
                                    onSelect={() =>
                                       go(
                                          r.type === 'issue'
                                             ? `/issue/${r.identifier ?? r.id}`
                                             : `/project/${r.id}/overview`
                                       )
                                    }
                                 >
                                    {r.type === 'issue' ? (
                                       <CircleDot className="text-muted-foreground" />
                                    ) : (
                                       <Box className="text-muted-foreground" />
                                    )}
                                    {r.identifier && (
                                       <span className="text-muted-foreground text-xs shrink-0">
                                          {r.identifier}
                                       </span>
                                    )}
                                    <span className="truncate">{r.label}</span>
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        )}
                        {hasSearchResults && (
                           <>
                              {searchResults.issues.length > 0 && (
                                 <CommandGroup heading="Issues">
                                    {searchResults.issues.map((i) => (
                                       <CommandItem
                                          key={i.id}
                                          value={`${query} ${i.identifier} ${i.title}`}
                                          onSelect={() => go(`/issue/${i.identifier}`)}
                                       >
                                          <CircleDot className="text-muted-foreground" />
                                          <span className="text-muted-foreground text-xs shrink-0">
                                             {i.identifier}
                                          </span>
                                          <div className="min-w-0 flex-1">
                                             <span className="block truncate">{i.title}</span>
                                             <SearchSnippet
                                                html={searchResults.snippets.get(i.id) ?? ''}
                                             />
                                          </div>
                                       </CommandItem>
                                    ))}
                                 </CommandGroup>
                              )}
                              {searchResults.projects.length > 0 && (
                                 <CommandGroup heading="Projects">
                                    {searchResults.projects.map((p) => (
                                       <CommandItem
                                          key={p.id}
                                          value={`${query} ${p.name}`}
                                          onSelect={() => go(`/project/${p.id}/overview`)}
                                       >
                                          <Box className="text-muted-foreground" />
                                          <span className="truncate">{p.name}</span>
                                       </CommandItem>
                                    ))}
                                 </CommandGroup>
                              )}
                              {searchResults.initiatives.length > 0 && (
                                 <CommandGroup heading="Initiatives">
                                    {searchResults.initiatives.map((n) => (
                                       <CommandItem
                                          key={n.id}
                                          value={`${query} ${n.title}`}
                                          onSelect={() => go(n.url)}
                                       >
                                          <Compass className="text-muted-foreground" />
                                          <span className="truncate">{n.title}</span>
                                       </CommandItem>
                                    ))}
                                 </CommandGroup>
                              )}
                              {searchResults.documents.length > 0 && (
                                 <CommandGroup heading="Documents">
                                    {searchResults.documents.map((d) => (
                                       <CommandItem
                                          key={d.id}
                                          value={`${query} ${d.title}`}
                                          onSelect={() => go(d.url)}
                                       >
                                          <FileText className="text-muted-foreground" />
                                          <span className="truncate">{d.title}</span>
                                       </CommandItem>
                                    ))}
                                 </CommandGroup>
                              )}
                              {searchResults.members.length > 0 && (
                                 <CommandGroup heading="Members">
                                    {searchResults.members.map((u) => (
                                       <CommandItem
                                          key={u.id}
                                          value={`${query} ${u.name} ${u.email}`}
                                          onSelect={() => go(`/profiles/${u.id}`)}
                                       >
                                          <Avatar className="size-5">
                                             <AvatarImage
                                                src={u.avatarUrl || undefined}
                                                alt={u.name}
                                             />
                                             <AvatarFallback className="text-[9px]">
                                                {u.name[0]}
                                             </AvatarFallback>
                                          </Avatar>
                                          <span className="truncate">{u.name}</span>
                                       </CommandItem>
                                    ))}
                                 </CommandGroup>
                              )}
                           </>
                        )}
                        <CommandGroup heading="Actions">
                           <CommandItem
                              onSelect={() => {
                                 openModal();
                                 close();
                              }}
                           >
                              <SquarePen className="text-muted-foreground" />
                              Create new issue
                              <Keys keys={['C']} />
                           </CommandItem>
                        </CommandGroup>
                        <CommandGroup heading="Go to">
                           <CommandItem onSelect={() => go('/inbox')}>
                              <Inbox className="text-muted-foreground" /> Inbox
                              <Keys keys={['G', 'I']} />
                           </CommandItem>
                           <CommandItem onSelect={() => go('/my-issues')}>
                              <ClipboardList className="text-muted-foreground" /> My issues
                              <Keys keys={['G', 'M']} />
                           </CommandItem>
                           <CommandItem onSelect={() => go('/reviews')}>
                              <GitBranch className="text-muted-foreground" /> Reviews
                           </CommandItem>
                           <CommandItem onSelect={() => go('/initiatives')}>
                              <Compass className="text-muted-foreground" /> Initiatives
                           </CommandItem>
                           <CommandItem onSelect={() => go('/projects')}>
                              <Box className="text-muted-foreground" /> Projects
                              <Keys keys={['G', 'P']} />
                           </CommandItem>
                           <CommandItem onSelect={() => go('/views')}>
                              <Layers className="text-muted-foreground" /> Views
                           </CommandItem>
                           <CommandItem onSelect={() => go('/teams')}>
                              <ContactRound className="text-muted-foreground" /> Teams
                           </CommandItem>
                           <CommandItem onSelect={() => go('/members')}>
                              <UserRound className="text-muted-foreground" /> Members
                           </CommandItem>
                           <CommandItem onSelect={() => go('/settings')}>
                              <FileText className="text-muted-foreground" /> Settings
                              <Keys keys={['G', 'S']} />
                           </CommandItem>
                        </CommandGroup>
                     </>
                  )}

                  {route === 'assign' && issue && (
                     <CommandGroup heading="Assign to…">
                        {users.slice(0, 12).map((user) => (
                           <CommandItem
                              key={user.id}
                              onSelect={() => {
                                 withToast(
                                    updateIssueAssignee(issue.id, user),
                                    `Assigned to ${user.name}`
                                 );
                                 close();
                              }}
                           >
                              <Avatar className="size-5">
                                 <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                                 <AvatarFallback className="text-[9px]">
                                    {user.name[0]}
                                 </AvatarFallback>
                              </Avatar>
                              {user.name}
                              {issue.assignee?.id === user.id && (
                                 <Check className="ml-auto size-4" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}

                  {route === 'status' && issue && (
                     <CommandGroup heading="Change status…">
                        {allStatus.map((candidate) => (
                           <CommandItem
                              key={candidate.id}
                              onSelect={() => {
                                 withToast(
                                    updateIssueStatus(issue.id, candidate),
                                    `Status set to ${candidate.name}`
                                 );
                                 close();
                              }}
                           >
                              <candidate.icon />
                              {candidate.name}
                              {issue.status.id === candidate.id && (
                                 <Check className="ml-auto size-4" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}

                  {route === 'priority' && issue && (
                     <CommandGroup heading="Set priority…">
                        {priorities.map((candidate) => (
                           <CommandItem
                              key={candidate.id}
                              onSelect={() => {
                                 withToast(
                                    updateIssuePriority(issue.id, candidate),
                                    `Priority set to ${candidate.name}`
                                 );
                                 close();
                              }}
                           >
                              <candidate.icon className="text-muted-foreground" />
                              {candidate.name}
                              {issue.priority.id === candidate.id && (
                                 <Check className="ml-auto size-4" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}

                  {route === 'labels' && issue && (
                     <CommandGroup heading="Change or add labels…">
                        {allLabels.map((label) => {
                           const active = issue.labels.some(
                              (candidate) => candidate.id === label.id
                           );
                           return (
                              <CommandItem
                                 key={label.id}
                                 onSelect={() => {
                                    withToast(
                                       active
                                          ? removeIssueLabel(issue.id, label.id)
                                          : addIssueLabel(issue.id, label),
                                       active
                                          ? `Label ${label.name} removed`
                                          : `Label ${label.name} added`
                                    );
                                 }}
                              >
                                 <span
                                    className="size-3 rounded-full"
                                    style={{ backgroundColor: label.color }}
                                 />
                                 {label.name}
                                 {active && <Check className="ml-auto size-4" />}
                              </CommandItem>
                           );
                        })}
                     </CommandGroup>
                  )}

                  {route === 'project' && issue && (
                     <CommandGroup heading="Move to project…">
                        <CommandItem
                           onSelect={() => {
                              withToast(
                                 updateIssueProject(issue.id, undefined),
                                 'Removed from project'
                              );
                              close();
                           }}
                        >
                           <Box className="text-muted-foreground" />
                           No project
                        </CommandItem>
                        {allProjects.map((project) => (
                           <CommandItem
                              key={project.id}
                              onSelect={() => {
                                 withToast(
                                    updateIssueProject(issue.id, project),
                                    `Moved to ${project.name}`
                                 );
                                 close();
                              }}
                           >
                              <project.icon className="text-muted-foreground" />
                              {project.name}
                              {issue.project?.id === project.id && (
                                 <Check className="ml-auto size-4" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}

                  {route === 'cycle' && issue && (
                     <CommandGroup heading="Move to cycle…">
                        <CommandItem
                           onSelect={() => {
                              withToast(
                                 updateIssue(issue.id, { cycleId: '' }),
                                 'Removed from cycle'
                              );
                              close();
                           }}
                        >
                           <CircleDot className="text-muted-foreground" />
                           No cycle
                        </CommandItem>
                        {cycles.slice(0, 6).map((cycle) => (
                           <CommandItem
                              key={cycle.id}
                              onSelect={() => {
                                 withToast(
                                    updateIssue(issue.id, { cycleId: cycle.id }),
                                    `Moved to ${cycle.name}`
                                 );
                                 close();
                              }}
                           >
                              <CircleDot className="text-muted-foreground" />
                              {cycle.name}
                              <span className="text-xs text-muted-foreground ml-2">
                                 {formatCycleDateRange(cycle)}
                              </span>
                              {issue.cycleId === cycle.id && <Check className="ml-auto size-4" />}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}

                  {route === 'due-date' && issue && (
                     <CommandGroup heading="Set due date…">
                        {(
                           [
                              ['Today', 0],
                              ['Tomorrow', 1],
                              ['End of this week', (7 - new Date().getDay()) % 7],
                              ['In one week', 7],
                           ] as const
                        ).map(([label, days]) => (
                           <CommandItem
                              key={label}
                              onSelect={() => {
                                 // Data RELATIVA ao dia atual (antes eram datas absolutas
                                 // hardcoded que já estavam no passado).
                                 const d = new Date();
                                 d.setDate(d.getDate() + days);
                                 const date = `${d.getFullYear()}-${String(
                                    d.getMonth() + 1
                                 ).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                 withToast(
                                    updateIssue(issue.id, { dueDate: date }),
                                    `Due date set to ${label.toLowerCase()}`
                                 );
                                 close();
                              }}
                           >
                              <CalendarPlus className="text-muted-foreground" />
                              {label}
                           </CommandItem>
                        ))}
                        <CommandItem
                           onSelect={() => {
                              withToast(
                                 updateIssue(issue.id, { dueDate: undefined }),
                                 'Due date cleared'
                              );
                              close();
                           }}
                        >
                           <CalendarPlus className="text-muted-foreground" />
                           Clear due date
                        </CommandItem>
                     </CommandGroup>
                  )}
               </CommandList>
            </Command>
         </DialogContent>
      </Dialog>
   );
}
