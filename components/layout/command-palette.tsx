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
import { resolveRecents, useRecentsStore } from '@/store/recents-store';
import { RecentsRecorder, useRecentsOwner } from './command-palette-recents';
import { api, type SearchEntityType, type SearchGroup } from '@/lib/client';
import { SearchSnippet } from '@/components/common/search/search-snippet';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useThemeStore } from '@/store/theme-store';
import { useTheme } from 'next-themes';
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
   Keyboard,
   Layers,
   Link2,
   SquarePen,
   Moon,
   Sun,
   Palette,
   Tags,
   Type,
   UserRound,
   UserRoundMinus,
   UserRoundPlus,
   type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { labelColor } from '@/components/common/palette';
import {
   closeOpenMenus,
   OPEN_COMMAND_EVENT,
   openShortcutsHelp,
   shortcutTokens,
} from '@/lib/shortcuts';
import { issueBranchName, issueUrl as buildIssueUrl, useContextIssue } from './context-issue';

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

/** Destinos do "Go to"; a dica de tecla vem da tabela única. */
const GO_TO: { label: string; path: string; icon: LucideIcon; shortcut?: string }[] = [
   { label: 'Inbox', path: '/inbox', icon: Inbox, shortcut: 'nav.inbox' },
   { label: 'My issues', path: '/my-issues', icon: ClipboardList, shortcut: 'nav.my-issues' },
   { label: 'Reviews', path: '/reviews', icon: GitBranch, shortcut: 'nav.reviews' },
   { label: 'Initiatives', path: '/initiatives', icon: Compass },
   { label: 'Projects', path: '/projects', icon: Box, shortcut: 'nav.projects' },
   { label: 'Views', path: '/views', icon: Layers, shortcut: 'nav.views' },
   { label: 'Teams', path: '/teams', icon: ContactRound, shortcut: 'nav.teams' },
   { label: 'Members', path: '/members', icon: UserRound },
   { label: 'Settings', path: '/settings', icon: FileText, shortcut: 'nav.settings' },
];

const PALETTE_ROUTES: readonly PaletteRoute[] = [
   'root',
   'assign',
   'status',
   'priority',
   'labels',
   'project',
   'cycle',
   'team',
   'due-date',
];

/** Small keyboard hint chips on the right of a command row. */
function Keys({ keys, id }: { keys?: string[]; id?: string }) {
   // Dica vinda da tabela única (`lib/shortcuts.ts`): a paleta só anuncia o que a tecla faz.
   if (id) keys = shortcutTokens(id);
   if (!keys?.length) return null;
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

/**
 * ⌘K command palette — Linear-style, aware of the issue in context. Esta casca fica
 * sempre montada mas só guarda `open` e os atalhos: o CORPO (que assina issues,
 * workspace e catálogos) só existe com a paleta aberta — fechada, uma mudança de issue
 * não re-renderiza nada aqui (#51). O registro de "recentes" é um componente à parte.
 */
export function CommandPalette() {
   const [open, setOpen] = useState(false);
   /** Sub-página inicial (fallback das teclas da issue, ex. `S` → "Change status…"). */
   const [initialRoute, setInitialRoute] = useState<PaletteRoute>('root');

   // ⌘K / Ctrl+K
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            // Menu aberto por baixo fecha antes (co#9): senão ficava aberto sob a paleta.
            closeOpenMenus();
            setInitialRoute('root');
            setOpen((value) => !value);
         }
      };
      window.addEventListener('keydown', onKeyDown);
      // Abertura via UI (ex.: botão "Search" da sidebar) — mesmo palette. `detail.page`
      // abre direto numa sub-página.
      const onOpen = (event: Event) => {
         const page = (event as CustomEvent<{ page?: string } | undefined>).detail?.page;
         closeOpenMenus();
         setInitialRoute(
            PALETTE_ROUTES.includes(page as PaletteRoute) ? (page as PaletteRoute) : 'root'
         );
         setOpen(true);
      };
      window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
      return () => {
         window.removeEventListener('keydown', onKeyDown);
         window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
      };
   }, []);

   const close = useCallback(() => setOpen(false), []);

   return (
      <>
         <RecentsRecorder />
         {open && <CommandPaletteBody onClose={close} initialRoute={initialRoute} />}
      </>
   );
}

/** Corpo da paleta: montado só enquanto aberta (estado de rota/busca nasce limpo). */
function CommandPaletteBody({
   onClose,
   initialRoute = 'root',
}: {
   onClose: () => void;
   initialRoute?: PaletteRoute;
}) {
   const [route, setRoute] = useState<PaletteRoute>(initialRoute);
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
   // Ações globais do ⌘K: no Linear a paleta faz mais que criar issue — troca tema e
   // recolhe o sidebar. Aqui o grupo tinha UM item.
   const setMode = useThemeStore((s) => s.setMode);
   const { setTheme } = useTheme();
   const allStatus = useStatuses();
   const priorities = usePriorities();
   const allLabels = useLabels();
   const cycles = useWorkspaceStore((s) => s.cycles);
   const allProjects = useWorkspaceStore((s) => s.projects);
   const users = useWorkspaceStore((s) => s.users);
   const me = useWorkspaceStore((s) => s.me);

   // Times e views salvas entram no "Go to": no Linear o ⌘K alcança QUALQUER destino,

   // não só a lista fixa. Sem isto, abrir uma view salva exigia navegar pelo sidebar.

   const teams = useWorkspaceStore((s) => s.teams);

   const savedViews = useWorkspaceStore((s) => s.views);

   const orgId = pathname.split('/')[1] || 'nimbloo';

   // Busca server-side (best-effort, debounced) pelo índice full-text (#99): casa a
   // DESCRIÇÃO da issue (corpo) — que a busca client-side não alcança — e traz também
   // initiatives e documents, que não vivem no store. Issues e projects seguem
   // resolvidos contra o store (render consistente); o snippet vem do servidor.
   // Resultado marcado com a consulta que o gerou: só vale enquanto a consulta for a
   // mesma — digitar mais não mistura o resultado antigo com o novo, e resposta atrasada
   // de uma consulta velha é descartada (#51).
   const [server, setServer] = useState<{ q: string; groups: SearchGroup[] }>({
      q: '',
      groups: [],
   });
   const currentQ = query.trim();
   const serverGroups = useMemo(
      () => (server.q === currentQ ? server.groups : []),
      [server, currentQ]
   );
   const searchSeq = useRef(0);
   useEffect(() => {
      const q = currentQ;
      const seq = ++searchSeq.current;
      if (q.length < 2) return;
      const t = setTimeout(() => {
         api.search
            .query({ q, limit: 6 })
            .then((res) => {
               if (seq === searchSeq.current) setServer({ q, groups: res.groups });
            })
            .catch(() => {
               // best-effort: mantém só a busca client-side se o servidor falhar
            });
      }, 250);
      return () => clearTimeout(t);
   }, [currentQ]);

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

   // Issue do detalhe OU a da notificação aberta no inbox (mesma regra dos atalhos).
   const contextIssue: Issue | undefined = useContextIssue(pathname);

   const issue = contextCleared ? undefined : contextIssue;

   const recentsOwner = useRecentsOwner();
   const storedRecents = useRecentsStore((s) => (recentsOwner ? s.recentsOf(recentsOwner) : null));
   const issuesLoaded = useIssuesStore((s) => s.loaded);
   const workspaceLoaded = useWorkspaceStore((s) => s.loaded);
   const recents = useMemo(
      () =>
         resolveRecents(storedRecents ?? [], issues, allProjects, issuesLoaded && workspaceLoaded),
      [storedRecents, issues, allProjects, issuesLoaded, workspaceLoaded]
   );

   const close = onClose;

   // Feedback truthful: toasta sucesso SÓ quando a mutação confirma na API. O store já
   // faz rollback + toast.error na falha (fonte única) → sem duplo-toast contraditório.
   const withToast = (p: Promise<void>, msg: string) => {
      void p.then(() => toast.success(msg)).catch(() => {});
   };

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

   const issueUrl = issue ? buildIssueUrl(orgId, issue.identifier) : '';
   // Branch no formato do Linear: `<usuário atual>/<id>-<título>` (antes usava o id do
   // PRIMEIRO usuário do workspace, não o de quem copia).
   const branchName = issue ? issueBranchName(issue, me) : '';
   const meUser = users.find((u) => u.id === me?.id);
   const assignedToMe = !!issue && !!meUser && issue.assignee?.id === meUser.id;

   const go = (path: string) => {
      router.push(`/${orgId}${path}`);
      close();
   };

   const input = (
      <div className="relative">
         <CommandInput
            autoFocus
            placeholder="Digite um comando ou pesquise…"
            // Espaço da dica "Perguntar ao Agent · Tab" (co#8): o texto não passa por baixo.
            className={route === 'root' ? 'pr-40' : undefined}
            value={query}
            onValueChange={setQuery}
            onKeyDown={(event) => {
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
               Perguntar ao Agent
               <kbd className="h-5 px-1.5 inline-flex items-center rounded border bg-muted/50 text-[11px] font-sans">
                  Tab
               </kbd>
            </span>
         )}
      </div>
   );

   return (
      <Dialog
         open
         onOpenChange={(value) => {
            if (!value) onClose();
         }}
      >
         <DialogContent
            showCloseButton={false}
            className="top-[22%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[640px]"
            // Esc numa sub-página volta à raiz (co#12): o Radix escuta o Esc na captura do
            // document, então o stopPropagation no input não impedia o fechamento.
            onEscapeKeyDown={(event) => {
               if (route === 'root') return;
               event.preventDefault();
               setRoute('root');
               setQuery('');
            }}
         >
            <DialogTitle className="sr-only">Menu de comandos</DialogTitle>
            <DialogDescription className="sr-only">Digite um comando ou pesquise</DialogDescription>
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
                           aria-label="Limpar contexto da issue"
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
                              <span>Assign to…</span>
                              <Keys id="issue.assignee" />
                           </CommandItem>
                           {meUser && (
                              <CommandItem
                                 onSelect={() => {
                                    withToast(
                                       updateIssueAssignee(issue.id, assignedToMe ? null : meUser),
                                       assignedToMe ? 'Un-assigned' : 'Assigned to you'
                                    );
                                    close();
                                 }}
                              >
                                 {assignedToMe ? (
                                    <UserRoundMinus className="text-muted-foreground" />
                                 ) : (
                                    <UserRoundPlus className="text-muted-foreground" />
                                 )}
                                 <span>{assignedToMe ? 'Unassign from me' : 'Assign to me'}</span>
                                 <Keys id="issue.assign-me" />
                              </CommandItem>
                           )}
                           <CommandItem
                              onSelect={() => {
                                 setRoute('status');
                                 setQuery('');
                              }}
                           >
                              <CircleDot className="text-muted-foreground" />
                              <span>Change status…</span>
                              <Keys id="issue.status" />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('priority');
                                 setQuery('');
                              }}
                           >
                              <Layers className="text-muted-foreground" />
                              <span>Set priority…</span>
                              <Keys id="issue.priority" />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('project');
                                 setQuery('');
                              }}
                           >
                              <Box className="text-muted-foreground" />
                              <span>Move to project…</span>
                              <Keys id="issue.project" />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('labels');
                                 setQuery('');
                              }}
                           >
                              <Tags className="text-muted-foreground" />
                              <span>Change or add labels…</span>
                              <Keys id="issue.labels" />
                           </CommandItem>
                           <CommandItem
                              onSelect={() => {
                                 setRoute('cycle');
                                 setQuery('');
                              }}
                           >
                              <CircleDot className="text-muted-foreground" />
                              <span>Move to cycle…</span>
                              <Keys id="issue.cycle" />
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
                              <span>Set due date…</span>
                              <Keys id="issue.due-date" />
                           </CommandItem>
                        </CommandGroup>
                        <CommandGroup heading="Copy">
                           <CommandItem onSelect={() => copy('Issue ID', issue.identifier)}>
                              <Clipboard className="text-muted-foreground" />
                              <span>Copy issue ID</span>
                              <Keys id="copy.id" />
                           </CommandItem>
                           <CommandItem onSelect={() => copy('Issue URL', issueUrl)}>
                              <Link2 className="text-muted-foreground" />
                              <span>Copy issue URL</span>
                              <Keys id="copy.url" />
                           </CommandItem>
                           <CommandItem onSelect={() => copy('Issue title', issue.title)}>
                              <Type className="text-muted-foreground" />
                              <span>Copy issue title</span>
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
                              <span>Copy title as link</span>
                           </CommandItem>
                           <CommandItem
                              onSelect={() => copy('Description', issue.description || issue.title)}
                           >
                              <FileText className="text-muted-foreground" />
                              <span>Copy issue description as Markdown</span>
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
                              <span>Copy issue content as Markdown</span>
                           </CommandItem>
                           <CommandItem onSelect={() => copy('Branch name', branchName)}>
                              <GitBranch className="text-muted-foreground" />
                              <span>Copy git branch name</span>
                              <Keys id="copy.branch" />
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
                              <span>Copy as prompt</span>
                           </CommandItem>
                        </CommandGroup>
                     </>
                  )}

                  {/* Busca e navegação também com issue em contexto (co#4): antes o ⌘K numa
                      página de issue só oferecia as ações dela. */}
                  {route === 'root' && (
                     <>
                        {!issue && !query.trim() && recents.length > 0 && (
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
                              <span>Create new issue</span>
                              <Keys id="issue.create" />
                           </CommandItem>
                           <CommandItem
                              value="keyboard shortcuts atalhos help ajuda"
                              onSelect={() => {
                                 close();
                                 openShortcutsHelp();
                              }}
                           >
                              <Keyboard className="text-muted-foreground" />
                              <span>Keyboard shortcuts</span>
                              <Keys id="help.shortcuts" />
                           </CommandItem>
                           <CommandItem
                              value="theme dark tema escuro"
                              onSelect={() => {
                                 setMode('dark');
                                 setTheme('dark');
                                 close();
                              }}
                           >
                              <Moon className="text-muted-foreground" /> Switch to dark theme
                           </CommandItem>
                           <CommandItem
                              value="theme light tema claro"
                              onSelect={() => {
                                 setMode('light');
                                 setTheme('light');
                                 close();
                              }}
                           >
                              <Sun className="text-muted-foreground" /> Switch to light theme
                           </CommandItem>
                           <CommandItem
                              value="preferences theme settings preferencias tema"
                              onSelect={() => go('/settings/preferences')}
                           >
                              <Palette className="text-muted-foreground" /> Theme & preferences
                           </CommandItem>
                        </CommandGroup>
                        <CommandGroup heading="Go to">
                           {GO_TO.map((item) => (
                              <CommandItem key={item.path} onSelect={() => go(item.path)}>
                                 <item.icon className="text-muted-foreground" />
                                 <span>{item.label}</span>
                                 {item.shortcut && <Keys id={item.shortcut} />}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                        {teams.length > 0 && (
                           <CommandGroup heading="Teams">
                              {teams.slice(0, 8).map((team) => (
                                 <CommandItem
                                    key={team.id}
                                    value={`team ${team.name} ${team.id}`}
                                    onSelect={() => go(`/team/${team.id}/all`)}
                                 >
                                    <ContactRound className="text-muted-foreground" />
                                    <span className="truncate">{team.name}</span>
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        )}
                        {savedViews.length > 0 && (
                           <CommandGroup heading="Saved views">
                              {savedViews.slice(0, 8).map((view) => (
                                 <CommandItem
                                    key={view.id}
                                    value={`view ${view.name}`}
                                    onSelect={() => go(`/view/${view.id}`)}
                                 >
                                    <span className="w-4 text-center text-muted-foreground">
                                       {view.icon || '#'}
                                    </span>
                                    <span className="truncate">{view.name}</span>
                                 </CommandItem>
                              ))}
                           </CommandGroup>
                        )}
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
                                    style={{ backgroundColor: labelColor(label.color) }}
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
