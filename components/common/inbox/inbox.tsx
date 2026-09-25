'use client';

import { MOTION_MS } from '@/lib/motion';
import { useListMotion } from '@/lib/list-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNotificationsStore, type InboxNotification } from '@/store/notifications-store';
import { useIssuesStore } from '@/store/issues-store';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   DropdownMenuLabel,
   DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
   Bell,
   CheckCheck,
   CheckIcon,
   Inbox as InboxIcon,
   ChevronRight,
   ListFilter,
   MoreHorizontal,
   SlidersHorizontal,
} from 'lucide-react';
import { getNotificationIcon } from '@/lib/notification-utils';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { LoadingArea } from '@/components/common/loading-area';
import type { NotificationType } from '@/data/inbox';
import NotificationPreview from './issue-preview';
import IssueLine from './issue-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCommandPages } from '@/components/ui/use-command-pages';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
   clampInboxListWidth,
   DEFAULT_INBOX_LIST_WIDTH,
   useInboxLayoutStore,
} from '@/store/inbox-layout-store';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useNow } from '@/lib/relative-time';
import { isTypingTarget, hasOpenOverlay } from '@/lib/keyboard-guard';
import { findShortcut } from '@/lib/shortcuts';
import { CircleLoading } from '@/components/common/circle-loading';

/** Parametro da notificacao aberta na URL (mobile: o "voltar" do navegador fecha). */
const SELECTED_PARAM = 'n';

/** Rótulos legíveis dos tipos de notificação para o filtro (ordem do Linear). */
const TYPE_LABELS: { value: NotificationType; label: string }[] = [
   { value: 'assignment', label: 'Assigned' },
   { value: 'mention', label: 'Mentioned' },
   { value: 'comment', label: 'Comment' },
   { value: 'status', label: 'Status changed' },
   { value: 'reopened', label: 'Reopened' },
   { value: 'closed', label: 'Closed' },
   { value: 'created', label: 'Created' },
   { value: 'edited', label: 'Edited' },
   { value: 'upload', label: 'Upload' },
];

/**
 * Linhas do inbox. O mapa identifier→status (vivo) é montado UMA vez por evento aqui —
 * cada linha fazia `issues.find` por identifier (O(linhas × issues)). Só este bloco
 * assina as issues; as linhas são `memo` e só a que mudou re-renderiza.
 */
function NotificationRows({
   items,
   selectedId,
   leaving,
   showId,
   showStatusIcon,
   onOpen,
   onSnooze,
   resetKey,
}: {
   items: { item: InboxNotification; isSnoozed: boolean }[];
   selectedId: string | undefined;
   leaving: ReadonlySet<string>;
   showId: boolean;
   showStatusIcon: boolean;
   onOpen: (notification: InboxNotification) => void;
   onSnooze: (id: string, until: string) => void;
   /** Filtros/ordem da lista: mudou, a próxima troca é de contexto e não anima. */
   resetKey: string;
}) {
   const issues = useIssuesStore((s) => s.issues);
   const unsnooze = useNotificationsStore((s) => s.unsnooze);
   // Notificação que chega pelo realtime abre espaço (altura + fade) em vez de empurrar a
   // lista de uma vez; carga, "Load more" e troca de filtro não animam.
   const ids = useMemo(() => items.map(({ item }) => item.id), [items]);
   const { entering } = useListMotion(ids, resetKey);
   // Um tick por minuto para a lista toda: o "2m" anda sem re-hidratar.
   const now = useNow();
   const statusByIdentifier = useMemo(
      () => new Map(issues.map((issue) => [issue.identifier, issue.status.id])),
      [issues]
   );

   return items.map(({ item: notification, isSnoozed }) =>
      isSnoozed ? (
         <IssueLine
            key={notification.id}
            notification={notification}
            now={now}
            statusId={statusByIdentifier.get(notification.identifier)}
            onUnsnooze={unsnooze}
            entering={entering.has(notification.id)}
            showId={showId}
            showStatusIcon={showStatusIcon}
         />
      ) : (
         <IssueLine
            key={notification.id}
            notification={notification}
            now={now}
            statusId={statusByIdentifier.get(notification.identifier)}
            isSelected={selectedId === notification.id}
            leaving={leaving.has(notification.id)}
            entering={entering.has(notification.id)}
            onOpen={onOpen}
            onSnooze={onSnooze}
            showId={showId}
            showStatusIcon={showStatusIcon}
         />
      )
   );
}

export default function Inbox() {
   // Seletores estreitos (não o store inteiro).
   const notifications = useNotificationsStore((s) => s.notifications);
   const snoozed = useNotificationsStore((s) => s.snoozed);
   const selectedNotification = useNotificationsStore((s) => s.selectedNotification);
   const loaded = useNotificationsStore((s) => s.loaded);
   const setSelectedNotification = useNotificationsStore((s) => s.setSelectedNotification);
   const markAsRead = useNotificationsStore((s) => s.markAsRead);
   const markAsUnread = useNotificationsStore((s) => s.markAsUnread);
   const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
   const hydrateSnoozed = useNotificationsStore((s) => s.hydrateSnoozed);
   const snooze = useNotificationsStore((s) => s.snooze);
   const removeNotification = useNotificationsStore((s) => s.remove);
   const hasMore = useNotificationsStore((s) => s.hasMore);
   const loadingMore = useNotificationsStore((s) => s.loadingMore);
   const loadMore = useNotificationsStore((s) => s.loadMore);
   // "Mark all as read" segue a contagem do servidor (a lista é capada — #19).
   const unreadCount = useNotificationsStore((s) => s.unreadCount);

   const isMobile = useIsMobile();
   const mobileRef = useRef(isMobile);
   mobileRef.current = isMobile;
   /** O preview aberto no mobile empilhou uma entrada no historico (o voltar a desfaz). */
   const pushedRef = useRef(false);

   const openNotification = useCallback(
      (notification: InboxNotification) => {
         setSelectedNotification(notification);
         // Padrão Linear: abrir a notificação já a marca como lida.
         if (!notification.read) markAsRead(notification.id);
         // Mobile (co#10): a selecao vai para a URL — o "voltar" do navegador volta a
         // lista em vez de sair do inbox (antes caia em about:blank).
         if (mobileRef.current && typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            const had = url.searchParams.has(SELECTED_PARAM);
            url.searchParams.set(SELECTED_PARAM, notification.id);
            if (had) window.history.replaceState(window.history.state, '', url);
            else {
               window.history.pushState(window.history.state, '', url);
               pushedRef.current = true;
            }
         }
      },
      [setSelectedNotification, markAsRead]
   );

   /** Tira o `?n=` da URL sem criar entrada no histórico. */
   const dropSelectedParam = useCallback(() => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(SELECTED_PARAM)) return;
      url.searchParams.delete(SELECTED_PARAM);
      window.history.replaceState(window.history.state, '', url);
   }, []);

   /**
    * Mobile: a notificação do `?n=` vira a selecionada (recarregar, avançar/voltar para
    * uma entrada com o parâmetro). Id que não está na lista sai da URL.
    */
   const selectFromUrl = useCallback(() => {
      const id = new URLSearchParams(window.location.search).get(SELECTED_PARAM);
      if (!id) return;
      const state = useNotificationsStore.getState();
      if (state.selectedNotification?.id === id) return;
      const found = state.notifications.find((n) => n.id === id);
      if (!found) {
         dropSelectedParam();
         return;
      }
      setSelectedNotification(found);
      if (!found.read) markAsRead(found.id);
   }, [dropSelectedParam, setSelectedNotification, markAsRead]);

   // Voltar/avançar do navegador (mobile): a URL decide — sem o parâmetro fecha o
   // preview; com ele, abre a notificação dela.
   useEffect(() => {
      const onPop = () => {
         if (new URLSearchParams(window.location.search).has(SELECTED_PARAM)) {
            if (mobileRef.current) selectFromUrl();
            return;
         }
         pushedRef.current = false;
         setSelectedNotification(undefined);
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
   }, [setSelectedNotification, selectFromUrl]);

   // Chegada no inbox (mobile), uma vez com a lista carregada: `?n=` restaura a seleção;
   // preview já aberto sem o parâmetro (voltou ao inbox com a seleção no store) ganha a
   // entrada no histórico, para o voltar do navegador fechar o preview e não sair do inbox.
   const syncedRef = useRef(false);
   useEffect(() => {
      if (!isMobile || !loaded || syncedRef.current) return;
      syncedRef.current = true;
      if (new URLSearchParams(window.location.search).has(SELECTED_PARAM)) {
         selectFromUrl();
         return;
      }
      const current = useNotificationsStore.getState().selectedNotification;
      if (!current) return;
      const url = new URL(window.location.href);
      url.searchParams.set(SELECTED_PARAM, current.id);
      window.history.pushState(window.history.state, '', url);
      pushedRef.current = true;
   }, [isMobile, loaded, selectFromUrl]);

   const closePreview = useCallback(() => {
      if (pushedRef.current) window.history.back();
      else {
         // Sem entrada própria no histórico (ex.: aberta pelo `?n=` ao recarregar): fecha
         // e tira o parâmetro, senão a URL seguiria apontando para o preview fechado.
         setSelectedNotification(undefined);
         dropSelectedParam();
      }
   }, [setSelectedNotification, dropSelectedParam]);

   const loadError = useNotificationsStore((s) => s.loadError);
   const desktopContainerRef = useRef<HTMLDivElement>(null);
   const listPanelRef = useRef<ImperativePanelHandle>(null);
   const [desktopWidth, setDesktopWidth] = useState(0);
   const listWidth = useInboxLayoutStore((state) => state.listWidth);
   const setListWidth = useInboxLayoutStore((state) => state.setListWidth);
   // Snoozed deixou de ser aba: vira o toggle "Show snoozed" do Display options
   // (paridade Linear) — as adiadas entram na própria lista, com o botão Restaurar.
   const [showSnoozed, setShowSnoozed] = useState(false);
   const [showRead, setShowRead] = useState(true);
   const [showUnreadFirst, setShowUnreadFirst] = useState(false);
   const [ordering, setOrdering] = useState('newest');
   const [showId, setShowId] = useState(true);
   const [showStatusIcon, setShowStatusIcon] = useState(true);
   const [filterOpen, setFilterOpen] = useState(false);
   const filterNavigation = useCommandPages<'root' | 'notification-type'>('root', () =>
      setFilterOpen(false)
   );
   // Filtro por tipo (padrão Linear): vazio = todos os tipos.
   const [typeFilter, setTypeFilter] = useState<Set<NotificationType>>(new Set());

   const toggleType = (type: NotificationType) =>
      setTypeFilter((prev) => {
         const next = new Set(prev);
         if (next.has(type)) next.delete(type);
         else next.add(type);
         return next;
      });

   // Ao ligar "Show snoozed", carrega as adiadas.
   useEffect(() => {
      if (showSnoozed) void hydrateSnoozed();
   }, [showSnoozed, hydrateSnoozed]);

   useEffect(() => {
      const container = desktopContainerRef.current;
      if (!container || isMobile) return;

      const measure = () => setDesktopWidth(container.getBoundingClientRect().width);
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      return () => observer.disconnect();
   }, [isMobile]);

   useLayoutEffect(() => {
      if (!desktopWidth) return;
      const nextWidth = clampInboxListWidth(listWidth, desktopWidth);
      listPanelRef.current?.resize((nextWidth / desktopWidth) * 100);
   }, [desktopWidth, listWidth]);

   // Filter and sort notifications based on settings (memoizado: era recomputado — array
   // novo + re-sort — a cada render, re-renderizando toda a lista de notificações).
   // Com "Show snoozed" ligado, as adiadas entram na mesma lista (flag isSnoozed) e
   // participam da mesma ordenação — padrão Linear, sem aba separada.
   const selectedId = selectedNotification?.id;
   const filteredNotifications = useMemo(() => {
      const matches = (notification: (typeof notifications)[number]) => {
         // A aberta fica na lista mesmo lida (co#2): abrir marca lida, e com "Show read"
         // desligado ela sumia e o j/k voltava ao topo.
         if (!showRead && notification.read && notification.id !== selectedId) return false;
         if (typeFilter.size > 0 && !typeFilter.has(notification.type)) return false;
         return true;
      };
      const merged = [
         ...notifications.filter(matches).map((item) => ({ item, isSnoozed: false })),
         ...(showSnoozed ? snoozed.filter(matches).map((item) => ({ item, isSnoozed: true })) : []),
      ];
      return merged.sort((a, b) => {
         if (showUnreadFirst) {
            if (!a.item.read && b.item.read) return -1;
            if (a.item.read && !b.item.read) return 1;
         }
         // Ordena pelo ISO cru (sortAt); timestamp é string relativa só p/ exibir.
         return ordering === 'newest'
            ? new Date(b.item.sortAt).getTime() - new Date(a.item.sortAt).getTime()
            : new Date(a.item.sortAt).getTime() - new Date(b.item.sortAt).getTime();
      });
   }, [
      notifications,
      snoozed,
      showSnoozed,
      showRead,
      showUnreadFirst,
      ordering,
      typeFilter,
      selectedId,
   ]);

   // Filtro só com os tipos que existem nas notificações carregadas (+ os já marcados):
   // a lista fixa oferecia tipos que o servidor nunca gera.
   const availableTypes = useMemo(() => {
      const present = new Set<NotificationType>([...notifications, ...snoozed].map((n) => n.type));
      return TYPE_LABELS.filter((t) => present.has(t.value) || typeFilter.has(t.value));
   }, [notifications, snoozed, typeFilter]);

   // Saida de linha (adiar/excluir): colapsa ~150 ms e so entao sai do store.
   const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
   const exitThen = useCallback((id: string, action: () => void) => {
      setLeaving((prev) => new Set(prev).add(id));
      setTimeout(() => {
         action();
         setLeaving((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
         });
      }, MOTION_MS.content);
   }, []);

   const navRef = useRef({ filteredNotifications, selectedId });
   navRef.current = { filteredNotifications, selectedId };

   /** Abre a vizinha da que vai sair da lista (a de baixo; senao a de cima). */
   const advanceFrom = useCallback(
      (id: string) => {
         const openable = navRef.current.filteredNotifications
            .filter((r) => !r.isSnoozed)
            .map((r) => r.item);
         const index = openable.findIndex((n) => n.id === id);
         const next = openable[index + 1] ?? openable[index - 1];
         if (next && index !== -1) openNotification(next);
         else setSelectedNotification(undefined);
      },
      [openNotification, setSelectedNotification]
   );

   const snoozeRow = useCallback(
      (id: string, until: string) => {
         if (navRef.current.selectedId === id) advanceFrom(id);
         exitThen(id, () => snooze(id, until));
      },
      [advanceFrom, exitThen, snooze]
   );

   const deleteRow = useCallback(
      (id: string) => {
         if (navRef.current.selectedId === id) advanceFrom(id);
         exitThen(id, () => void removeNotification(id).catch(() => {}));
      },
      [advanceFrom, exitThen, removeNotification]
   );

   // Menu de adiar do cabecalho do preview (tecla H).
   const [snoozeMenuOpen, setSnoozeMenuOpen] = useState(false);

   // Rola a selecionada para a vista (co#1): j/k passavam da borda da lista.
   const listRef = useRef<HTMLDivElement>(null);
   useEffect(() => {
      if (!selectedId) return;
      const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(selectedId) : selectedId;
      listRef.current
         ?.querySelector<HTMLElement>('[data-notification-id="' + id + '"]')
         ?.scrollIntoView({ block: 'nearest' });
   }, [selectedId]);

   // Teclado (paridade Linear), da tabela unica: j/k andam, U lida/nao lida, H adia,
   // Backspace exclui. Inativo digitando ou com dialog/menu aberto.
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.defaultPrevented) return;
         if (isTypingTarget(event.target) || hasOpenOverlay()) return;
         const shortcut = findShortcut('inbox', event);
         if (!shortcut) return;
         const { filteredNotifications: rows, selectedId: current } = navRef.current;
         const openable = rows.filter((r) => !r.isSnoozed).map((r) => r.item);
         const selected = openable.find((n) => n.id === current);
         if (shortcut.id === 'inbox.next' || shortcut.id === 'inbox.prev') {
            if (openable.length === 0) return;
            const step = shortcut.id === 'inbox.next' ? 1 : -1;
            const index = openable.findIndex((n) => n.id === current);
            const nextIndex =
               index === -1 ? 0 : Math.min(openable.length - 1, Math.max(0, index + step));
            event.preventDefault();
            openNotification(openable[nextIndex]);
            return;
         }
         if (!selected) return;
         event.preventDefault();
         if (shortcut.id === 'inbox.toggle-read') {
            if (selected.read) markAsUnread(selected.id);
            else markAsRead(selected.id);
         } else if (shortcut.id === 'inbox.snooze') {
            setSnoozeMenuOpen(true);
         } else if (shortcut.id === 'inbox.delete') {
            deleteRow(selected.id);
         }
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [openNotification, markAsRead, markAsUnread, deleteRow]);

   // Carregar mais ao chegar no fim da lista (o botao segue como fallback).
   const sentinelRef = useRef<HTMLDivElement>(null);
   useEffect(() => {
      const el = sentinelRef.current;
      if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
      const observer = new IntersectionObserver((entries) => {
         if (entries.some((e) => e.isIntersecting)) void loadMore();
      });
      observer.observe(el);
      return () => observer.disconnect();
   }, [hasMore, loadMore]);

   const listPane = (
      <>
         {/* Header — espelho do Linear: "Inbox" 13px/500 + menu "..." de ações à esquerda;
             Add filter (funil) e Display options (sliders) à direita. */}
         <div className="flex h-11 items-center justify-between border-b border-border pl-[18px] pr-2.5">
            <div className="flex items-center gap-1.5">
               <SidebarTrigger className="inline-flex lg:hidden" />
               <span className="text-[13px] font-medium leading-4">Inbox</span>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Notification actions"
                     >
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-52">
                     <DropdownMenuItem onClick={markAllAsRead} disabled={unreadCount === 0}>
                        <CheckCheck className="size-4 text-muted-foreground" />
                        Mark all as read
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>

            <div className="flex items-center gap-0.5">
               <Popover
                  open={filterOpen}
                  onOpenChange={(next) => {
                     setFilterOpen(next);
                     if (!next) filterNavigation.reset();
                  }}
               >
                  <PopoverTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="relative size-7"
                        aria-label="Add filter"
                     >
                        <ListFilter className="size-4 text-muted-foreground" />
                        {typeFilter.size > 0 && (
                           <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
                              {typeFilter.size}
                           </span>
                        )}
                     </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-0">
                     <Command onKeyDown={filterNavigation.onKeyDown}>
                        <CommandInput
                           ref={filterNavigation.searchInputRef}
                           value={filterNavigation.query}
                           onValueChange={filterNavigation.setQuery}
                           placeholder={
                              filterNavigation.page === 'root' ? 'Add Filter…' : 'Filter…'
                           }
                        />
                        <CommandList>
                           <CommandEmpty>No results.</CommandEmpty>
                           {filterNavigation.page === 'root' ? (
                              <CommandGroup>
                                 <CommandItem
                                    data-command-page="notification-type"
                                    onSelect={() => filterNavigation.push('notification-type')}
                                 >
                                    <Bell className="size-4 text-muted-foreground" />
                                    Notification type
                                    <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                                 </CommandItem>
                                 {typeFilter.size > 0 && (
                                    <CommandItem onSelect={() => setTypeFilter(new Set())}>
                                       Clear filters
                                    </CommandItem>
                                 )}
                              </CommandGroup>
                           ) : (
                              <CommandGroup>
                                 {availableTypes.map((type) => (
                                    <CommandItem
                                       key={type.value}
                                       onSelect={() => toggleType(type.value)}
                                    >
                                       <span className="mr-0.5 inline-flex">
                                          {getNotificationIcon(
                                             type.value,
                                             'size-3.5 text-muted-foreground'
                                          )}
                                       </span>
                                       {type.label}
                                       {typeFilter.has(type.value) && (
                                          <CheckIcon className="ml-auto size-3.5" />
                                       )}
                                    </CommandItem>
                                 ))}
                              </CommandGroup>
                           )}
                        </CommandList>
                     </Command>
                  </PopoverContent>
               </Popover>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        aria-label="Display options"
                     >
                        <SlidersHorizontal className="size-4 text-muted-foreground" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                     {/* Ordering + toggles — mesma composição do popover do Linear. */}
                     <div className="flex items-center justify-between px-2 py-1.5">
                        <span className="text-sm text-muted-foreground">Ordering</span>
                        <DropdownMenu>
                           <DropdownMenuTrigger asChild>
                              <Button variant="secondary" size="xs" className="h-6 px-2 text-xs">
                                 {ordering === 'newest' ? 'Newest' : 'Oldest'}
                              </Button>
                           </DropdownMenuTrigger>
                           <DropdownMenuContent align="end" className="w-32">
                              <DropdownMenuCheckboxItem
                                 checked={ordering === 'newest'}
                                 onCheckedChange={() => setOrdering('newest')}
                              >
                                 Newest
                              </DropdownMenuCheckboxItem>
                              <DropdownMenuCheckboxItem
                                 checked={ordering === 'oldest'}
                                 onCheckedChange={() => setOrdering('oldest')}
                              >
                                 Oldest
                              </DropdownMenuCheckboxItem>
                           </DropdownMenuContent>
                        </DropdownMenu>
                     </div>

                     <DropdownMenuSeparator />

                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-snoozed" className="text-sm font-normal">
                              Show snoozed
                           </Label>
                           <Switch
                              id="show-snoozed"
                              checked={showSnoozed}
                              onCheckedChange={setShowSnoozed}
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-read" className="text-sm font-normal">
                              Show read
                           </Label>
                           <Switch
                              id="show-read"
                              checked={showRead}
                              onCheckedChange={setShowRead}
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-unread-first" className="text-sm font-normal">
                              Show unread first
                           </Label>
                           <Switch
                              id="show-unread-first"
                              checked={showUnreadFirst}
                              onCheckedChange={setShowUnreadFirst}
                           />
                        </div>
                     </div>

                     <DropdownMenuSeparator />

                     <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Display properties
                     </DropdownMenuLabel>
                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-id" className="text-sm font-normal">
                              ID
                           </Label>
                           <Switch id="show-id" checked={showId} onCheckedChange={setShowId} />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-status-icon" className="text-sm font-normal">
                              Status and icon
                           </Label>
                           <Switch
                              id="show-status-icon"
                              checked={showStatusIcon}
                              onCheckedChange={setShowStatusIcon}
                           />
                        </div>
                     </div>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>
         <div
            ref={listRef}
            className="flex h-[calc(100%-44px)] w-full flex-col items-center justify-start overflow-y-auto py-2"
         >
            {filteredNotifications.length === 0 &&
               (!loaded ? (
                  <div className="w-full">
                     <LoadingArea rows={6} />
                  </div>
               ) : loadError && notifications.length === 0 ? (
                  <ErrorState
                     title="Couldn't load notifications"
                     description="Check your connection and try again."
                     className="my-auto min-h-0"
                     action={
                        <Button
                           variant="outline"
                           size="sm"
                           onClick={() => void useNotificationsStore.getState().hydrate()}
                        >
                           Try again
                        </Button>
                     }
                  />
               ) : notifications.length > 0 || snoozed.length > 0 ? (
                  <EmptyState
                     variant="filtered"
                     title="No notifications match"
                     description="Try adjusting the filter or display options."
                     className="my-auto"
                  />
               ) : (
                  <EmptyState
                     variant="activity"
                     icon={InboxIcon}
                     title="No notifications"
                     description="You're all caught up."
                     className="my-auto"
                  />
               ))}
            {filteredNotifications.length > 0 && (
               <div className="content-enter w-full">
                  <NotificationRows
                     items={filteredNotifications}
                     selectedId={selectedNotification?.id}
                     leaving={leaving}
                     showId={showId}
                     showStatusIcon={showStatusIcon}
                     onOpen={openNotification}
                     onSnooze={snoozeRow}
                     resetKey={`${showRead}|${showSnoozed}|${showUnreadFirst}|${ordering}|${[...typeFilter].join(',')}`}
                  />
               </div>
            )}
            {/* Paginacao por cursor (co#3): o inbox mostrava so as 100 mais recentes. */}
            {loaded && hasMore && (
               <div ref={sentinelRef} className="flex w-full justify-center py-2">
                  <Button
                     variant="ghost"
                     size="xs"
                     aria-label="Load more"
                     disabled={loadingMore}
                     onClick={() => void loadMore()}
                     className="text-muted-foreground"
                  >
                     {loadingMore ? <CircleLoading size="sm" inline /> : 'Load more'}
                  </Button>
               </div>
            )}
         </div>
      </>
   );

   if (isMobile) {
      // Um cabecalho so (co#10): o "voltar" vai no header do preview (eram 88 px).
      return selectedNotification ? (
         <div className="flex flex-col h-full w-full">
            <div className="flex-1 min-h-0">
               <NotificationPreview
                  notification={selectedNotification}
                  onMarkAsRead={markAsRead}
                  onMarkAsUnread={markAsUnread}
                  onSnooze={snoozeRow}
                  onDelete={deleteRow}
                  snoozeMenuOpen={snoozeMenuOpen}
                  onSnoozeMenuOpenChange={setSnoozeMenuOpen}
                  onBack={closePreview}
               />
            </div>
         </div>
      ) : (
         <div className="flex flex-col h-full w-full">{listPane}</div>
      );
   }

   const minimumSize = desktopWidth ? (DEFAULT_INBOX_LIST_WIDTH / desktopWidth) * 100 : 20;
   const maximumSize = Math.max(minimumSize, 50);

   return (
      <div ref={desktopContainerRef} className="h-full w-full">
         <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            <ResizablePanel
               ref={listPanelRef}
               id="inbox-list"
               order={1}
               defaultSize={minimumSize}
               minSize={minimumSize}
               maxSize={maximumSize}
               onResize={(size) => {
                  if (!desktopWidth) return;
                  setListWidth(clampInboxListWidth((size / 100) * desktopWidth, desktopWidth));
               }}
               className="min-w-[300px]"
            >
               <section className="h-full min-w-0">{listPane}</section>
            </ResizablePanel>
            <ResizableHandle
               id="inbox-list-resize-handle"
               aria-label="Resize notification list"
               hitAreaMargins={{ fine: 3, coarse: 12 }}
            />
            <ResizablePanel
               id="inbox-detail"
               order={2}
               defaultSize={100 - minimumSize}
               minSize={30}
            >
               <section className="h-full min-w-0">
                  <NotificationPreview
                     notification={selectedNotification}
                     onMarkAsRead={markAsRead}
                     onMarkAsUnread={markAsUnread}
                     onSnooze={snoozeRow}
                     onDelete={deleteRow}
                     snoozeMenuOpen={snoozeMenuOpen}
                     onSnoozeMenuOpenChange={setSnoozeMenuOpen}
                  />
               </section>
            </ResizablePanel>
         </ResizablePanelGroup>
      </div>
   );
}
