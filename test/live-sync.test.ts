// @vitest-environment jsdom

import './setup-dom';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
   issues: { get: vi.fn() },
   projects: { get: vi.fn() },
   initiatives: { get: vi.fn() },
   cycles: { get: vi.fn() },
   members: { get: vi.fn() },
   views: { get: vi.fn() },
   teams: { get: vi.fn() },
   labels: { list: vi.fn() },
   me: vi.fn(),
}));
vi.mock('@/lib/client', () => {
   class ApiError extends Error {
      constructor(
         public status: number,
         message: string
      ) {
         super(message);
      }
   }
   return { api, ApiError };
});

/** EventSource falso: o teste controla abertura, queda e mensagens. */
class FakeEventSource {
   static CONNECTING = 0;
   static OPEN = 1;
   static CLOSED = 2;
   static instances: FakeEventSource[] = [];
   readyState = FakeEventSource.CONNECTING;
   onopen: (() => void) | null = null;
   onmessage: ((ev: MessageEvent<string>) => void) | null = null;
   onerror: (() => void) | null = null;
   constructor(public url: string) {
      FakeEventSource.instances.push(this);
   }
   open() {
      this.readyState = FakeEventSource.OPEN;
      this.onopen?.();
   }
   emit(data: unknown) {
      this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
   }
   /** Queda com reconexão automática do navegador (readyState volta a CONNECTING). */
   drop() {
      this.readyState = FakeEventSource.CONNECTING;
      this.onerror?.();
   }
   close() {
      this.readyState = FakeEventSource.CLOSED;
   }
}

const { useLiveSync, ISSUE_CHANGED_EVENT, PROJECT_CHANGED_EVENT, DOCUMENT_CHANGED_EVENT } =
   await import('@/lib/use-live-sync');
const { useIssuesStore } = await import('@/store/issues-store');
const { useWorkspaceStore } = await import('@/store/workspace-store');
const { useNotificationsStore } = await import('@/store/notifications-store');
const { useCatalogStore } = await import('@/store/catalog-store');

const hydrateIssues = vi.fn(async () => {});
const hydrateWorkspace = vi.fn(async () => {});
const hydrateNotifications = vi.fn(async () => {});

function setup() {
   renderHook(() => useLiveSync());
   const es = FakeEventSource.instances.at(-1)!;
   es.open();
   return es;
}

/** Fecha a janela de coalescência (200 ms) e deixa os fetches direcionados resolverem. */
const flush = () => vi.advanceTimersByTimeAsync(250);

beforeEach(() => {
   vi.useFakeTimers();
   vi.clearAllMocks();
   FakeEventSource.instances = [];
   vi.stubGlobal('EventSource', FakeEventSource);
   useIssuesStore.setState({ hydrate: hydrateIssues, resync: hydrateIssues, issues: [] });
   useWorkspaceStore.setState({
      hydrate: hydrateWorkspace,
      me: { id: 'me' } as never,
      cycles: [],
      views: [],
      teams: [],
      users: [],
   });
   useNotificationsStore.setState({ hydrate: hydrateNotifications });
});

afterEach(() => {
   vi.useRealTimers();
   vi.unstubAllGlobals();
});

describe('useLiveSync — reconexão (#6)', () => {
   it('o primeiro open não re-hidrata; um open depois de queda re-hidrata tudo', async () => {
      const es = setup();
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateIssues).not.toHaveBeenCalled();

      es.drop();
      es.open();
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateIssues).toHaveBeenCalledTimes(1);
      expect(hydrateWorkspace).toHaveBeenCalledTimes(1);
      expect(hydrateNotifications).toHaveBeenCalledTimes(1);
   });
});

describe('useLiveSync — label atualiza o catálogo (#12)', () => {
   it('label criada/editada recarrega só os labels, sem baixar as issues', async () => {
      api.labels.list.mockResolvedValue([{ id: 'bug', name: 'Bug!', color: '#f00' }]);
      const es = setup();
      es.emit({ entity: 'label', action: 'updated', id: 'bug' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(api.labels.list).toHaveBeenCalledTimes(1);
      expect(useCatalogStore.getState().labels.find((l) => l.id === 'bug')?.name).toBe('Bug!');
      expect(hydrateIssues).not.toHaveBeenCalled();
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('label renomeada reflete nas issues em memória; apagada sai delas', async () => {
      useIssuesStore.setState({
         issues: [{ id: 'i1', labels: [{ id: 'bug', name: 'Bug', color: '#000' }] }] as never,
      });
      api.labels.list.mockResolvedValue([{ id: 'bug', name: 'Defeito', color: '#f00' }]);
      const es = setup();
      es.emit({ entity: 'label', action: 'updated', id: 'bug' });
      await flush();
      expect(useIssuesStore.getState().issues[0].labels[0].name).toBe('Defeito');
      es.emit({ entity: 'label', action: 'deleted', id: 'bug' });
      await flush();
      expect(useIssuesStore.getState().issues[0].labels).toEqual([]);
   });
});

describe('useLiveSync — fetch direcionado (#17)', () => {
   it('cycle com id busca só o ciclo, sem bootstrap', async () => {
      const applyCycle = vi.fn();
      useWorkspaceStore.setState({ applyCycle });
      api.cycles.get.mockResolvedValue({ id: 'c1' });
      const es = setup();
      es.emit({ entity: 'cycle', action: 'updated', id: 'c1' });
      await flush();
      expect(api.cycles.get).toHaveBeenCalledWith('c1');
      expect(applyCycle).toHaveBeenCalledWith({ id: 'c1' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('member/view/team com id usam applyUser/applyView/applyTeam; deleted remove local', async () => {
      const applyUser = vi.fn();
      const applyView = vi.fn();
      const applyTeam = vi.fn();
      const removeViewLocal = vi.fn();
      const removeCycleLocal = vi.fn();
      useWorkspaceStore.setState({
         applyUser,
         applyView,
         applyTeam,
         removeViewLocal,
         removeCycleLocal,
      });
      api.members.get.mockResolvedValue({ id: 'u1' });
      api.views.get.mockResolvedValue({ id: 'v1' });
      api.teams.get.mockResolvedValue({ id: 'ENG' });
      const es = setup();
      es.emit({ entity: 'member', action: 'updated', id: 'u1' });
      es.emit({ entity: 'view', action: 'updated', id: 'v1' });
      es.emit({ entity: 'team', action: 'updated', id: 'ENG' });
      es.emit({ entity: 'view', action: 'deleted', id: 'v2' });
      es.emit({ entity: 'cycle', action: 'deleted', id: 'c9' });
      await flush();
      expect(applyUser).toHaveBeenCalledWith({ id: 'u1' });
      expect(applyView).toHaveBeenCalledWith({ id: 'v1' });
      expect(applyTeam).toHaveBeenCalledWith({ id: 'ENG' });
      expect(removeViewLocal).toHaveBeenCalledWith('v2');
      expect(removeCycleLocal).toHaveBeenCalledWith('c9');
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('document não re-hidrata o workspace: vira evento de janela', async () => {
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(DOCUMENT_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'document', action: 'updated', id: 'd1' });
      await vi.advanceTimersByTimeAsync(3000);
      window.removeEventListener(DOCUMENT_CHANGED_EVENT, on);
      expect(seen).toEqual([{ id: 'd1' }]);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('evento coarse (catalog) re-hidrata com jitter de até 1,5 s', async () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const es = setup();
      es.emit({ entity: 'catalog', action: 'updated', id: 'x' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1500);
      expect(hydrateWorkspace).toHaveBeenCalledTimes(1);
      random.mockRestore();
   });
});

describe('useLiveSync — eventos de janela com id (#19, #28)', () => {
   it('comentário com issueId recarrega só o detalhe daquela issue; sem issueId, qualquer um', async () => {
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(ISSUE_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'comment', action: 'created', id: 'cm1', issueId: 'i1' });
      es.emit({ entity: 'comment', action: 'created', id: 'cm2' });
      window.removeEventListener(ISSUE_CHANGED_EVENT, on);
      expect(seen).toEqual([
         { id: 'i1', scope: 'activity' },
         { id: undefined, scope: 'activity' },
      ]);
   });

   it('project com id dispara PROJECT_CHANGED com o id', async () => {
      api.projects.get.mockResolvedValue({ id: 'p1' });
      useWorkspaceStore.setState({ applyProject: vi.fn() });
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(PROJECT_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'project', action: 'updated', id: 'p1' });
      window.removeEventListener(PROJECT_CHANGED_EVENT, on);
      expect(seen).toEqual([{ id: 'p1' }]);
   });

   it('notificação de outro destinatário é ignorada (recipientId, quando vier)', async () => {
      const es = setup();
      es.emit({ entity: 'notification', action: 'created', id: 'n1', recipientId: 'other' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateNotifications).not.toHaveBeenCalled();
      es.emit({ entity: 'notification', action: 'created', id: 'n2', recipientId: 'me' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateNotifications).toHaveBeenCalledTimes(1);
   });
});

describe('useLiveReload (#28)', () => {
   it('recarrega só para o id/time da tela; evento sem o campo recarrega por segurança', async () => {
      const { useLiveReload } = await import('@/lib/use-live-sync');
      const reload = vi.fn();
      renderHook(() => useLiveReload(PROJECT_CHANGED_EVENT, { id: 'p1', teamId: 'ENG' }, reload));
      const fire = (detail: unknown) =>
         window.dispatchEvent(new CustomEvent(PROJECT_CHANGED_EVENT, { detail }));
      fire({ id: 'p2' });
      fire({ id: 'p1', teamId: 'OPS' });
      expect(reload).not.toHaveBeenCalled();
      fire({ id: 'p1' });
      fire({});
      fire({ id: 'p1', teamId: 'ENG' });
      expect(reload).toHaveBeenCalledTimes(3);
   });
});

describe('useLiveSync — resync e assinatura (integração C1)', () => {
   it('evento resync do servidor (LISTEN reconectado) re-hidrata tudo', async () => {
      const es = setup();
      es.emit({ entity: 'resync', action: 'updated' });
      await vi.advanceTimersByTimeAsync(7000);
      expect(hydrateIssues).toHaveBeenCalledTimes(1);
      expect(hydrateWorkspace).toHaveBeenCalledTimes(1);
      expect(hydrateNotifications).toHaveBeenCalledTimes(1);
   });

   it('aviso de assinatura do próprio usuário recarrega o me (outras abas)', async () => {
      const me = { id: 'me', subscribedIssueIds: ['i9'] };
      api.me.mockResolvedValue(me);
      const applyMe = vi.fn();
      useWorkspaceStore.setState({ applyMe });
      const es = setup();
      es.emit({ entity: 'member', action: 'updated', id: 'me', recipientId: 'me', issueId: 'i9' });
      await flush();
      expect(api.me).toHaveBeenCalledTimes(1);
      expect(applyMe).toHaveBeenCalledWith(me);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
   });

   it('aviso de assinatura de OUTRO usuário é ignorado', async () => {
      const es = setup();
      es.emit({ entity: 'member', action: 'updated', id: 'u2', recipientId: 'u2', issueId: 'i9' });
      await flush();
      expect(api.me).not.toHaveBeenCalled();
      expect(api.members.get).not.toHaveBeenCalled();
   });
});

describe('useLiveSync — fetch direcionado coalescido e sequenciado (#11)', () => {
   const issueDto = (id: string, title = id) => ({ id, title });
   let applyDto: ReturnType<typeof vi.fn>;
   beforeEach(() => {
      applyDto = vi.fn();
      useIssuesStore.setState({ applyDto, removeRemote: vi.fn() });
   });

   it('vários eventos da mesma issue na janela viram UM GET', async () => {
      api.issues.get.mockResolvedValue(issueDto('i1'));
      const es = setup();
      for (let k = 0; k < 5; k++) es.emit({ entity: 'issue', action: 'updated', id: 'i1' });
      await flush();
      expect(api.issues.get).toHaveBeenCalledTimes(1);
      expect(applyDto).toHaveBeenCalledTimes(1);
   });

   it('rajada acima do limite vira UMA sincronização, sem GET por issue', async () => {
      const es = setup();
      for (let k = 0; k < 30; k++) es.emit({ entity: 'issue', action: 'updated', id: `i${k}` });
      await vi.advanceTimersByTimeAsync(3000);
      expect(api.issues.get).not.toHaveBeenCalled();
      expect(hydrateIssues).toHaveBeenCalledTimes(1);
   });

   it('resposta de GET mais velho que chega depois é descartada', async () => {
      let resolveOld!: (v: unknown) => void;
      api.issues.get
         .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
         .mockResolvedValueOnce(issueDto('i1', 'novo'));
      const es = setup();
      es.emit({ entity: 'issue', action: 'updated', id: 'i1' });
      await flush();
      es.emit({ entity: 'issue', action: 'updated', id: 'i1' });
      await flush();
      resolveOld(issueDto('i1', 'velho'));
      await flush();
      expect(applyDto).toHaveBeenCalledTimes(1);
      expect(applyDto).toHaveBeenCalledWith(issueDto('i1', 'novo'));
   });

   it('404 no GET direcionado remove a issue do store (If#23)', async () => {
      const { ApiError } = await import('@/lib/client');
      const removeRemote = vi.fn();
      useIssuesStore.setState({ removeRemote });
      api.issues.get.mockRejectedValueOnce(new ApiError(404, 'x'));
      const es = setup();
      es.emit({ entity: 'issue', action: 'updated', id: 'i9' });
      await flush();
      expect(api.issues.get).toHaveBeenCalledTimes(1);
      expect(removeRemote).toHaveBeenCalledWith('i9');
      expect(hydrateIssues).not.toHaveBeenCalled();
   });

   it('eco da própria aba não refaz o GET e marca o evento de janela como own (If#16)', async () => {
      const { getClientId, markOwnMutation } = await import('@/lib/client-id');
      markOwnMutation('issue', 'i1');
      api.issues.get.mockResolvedValue(issueDto('i1'));
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(ISSUE_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'issue', action: 'updated', id: 'i1', clientId: getClientId() });
      es.emit({ entity: 'issue', action: 'updated', id: 'i1', clientId: 'outra-aba-0001' });
      await flush();
      window.removeEventListener(ISSUE_CHANGED_EVENT, on);
      // O da outra aba busca; o eco próprio não.
      expect(api.issues.get).toHaveBeenCalledTimes(1);
      expect(seen[0]).toEqual({ id: 'i1', own: true });
      expect(seen[1]).toEqual({ id: 'i1' });
   });

   it('mudança só de conteúdo (descrição) não busca o DTO da lista (#18)', async () => {
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(ISSUE_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'issue', action: 'updated', id: 'i1', scope: 'content' });
      await flush();
      window.removeEventListener(ISSUE_CHANGED_EVENT, on);
      expect(api.issues.get).not.toHaveBeenCalled();
      // `scope` chega à tela: o eco do próprio autosave (own + content) não refaz o GET.
      expect(seen).toEqual([{ id: 'i1', scope: 'content' }]);
   });

   it('projeto com scope content repassa o scope no evento de janela', async () => {
      useWorkspaceStore.setState({ applyProject: vi.fn() });
      api.projects.get.mockResolvedValue({ id: 'p1' });
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(PROJECT_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'project', action: 'updated', id: 'p1', teamId: 'CORE', scope: 'content' });
      await flush();
      window.removeEventListener(PROJECT_CHANGED_EVENT, on);
      expect(seen).toEqual([{ id: 'p1', teamId: 'CORE', scope: 'content' }]);
   });

   it('projeto buscado 1 vez mesmo com N eventos (rollups de bulk)', async () => {
      const applyProject = vi.fn();
      useWorkspaceStore.setState({ applyProject });
      api.projects.get.mockResolvedValue({ id: 'p1' });
      const es = setup();
      for (let k = 0; k < 10; k++) es.emit({ entity: 'project', action: 'updated', id: 'p1' });
      await flush();
      expect(api.projects.get).toHaveBeenCalledTimes(1);
      expect(applyProject).toHaveBeenCalledTimes(1);
   });
});

describe('useLiveSync — resync avisa as telas e espalha a carga', () => {
   it('reconexão dispara os eventos de janela (telas com cache local recarregam)', async () => {
      const seen: string[] = [];
      const names = [ISSUE_CHANGED_EVENT, PROJECT_CHANGED_EVENT, DOCUMENT_CHANGED_EVENT];
      const on = (e: Event) => seen.push(e.type);
      for (const n of names) window.addEventListener(n, on);
      const es = setup();
      es.drop();
      es.open();
      await vi.advanceTimersByTimeAsync(3000);
      for (const n of names) window.removeEventListener(n, on);
      expect(seen.sort()).toEqual([...names].sort());
   });

   it('resync do pod usa jitter maior (todos os clientes do pod recebem juntos)', async () => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const es = setup();
      es.emit({ entity: 'resync', action: 'updated' });
      await vi.advanceTimersByTimeAsync(3000);
      expect(hydrateWorkspace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(4000);
      expect(hydrateWorkspace).toHaveBeenCalledTimes(1);
      random.mockRestore();
   });

   it('automação vira evento de janela com o time', async () => {
      const { AUTOMATION_CHANGED_EVENT } = await import('@/lib/use-live-sync');
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(AUTOMATION_CHANGED_EVENT, on);
      const es = setup();
      es.emit({ entity: 'automation', action: 'updated', id: 'a1', teamId: 'ENG' });
      window.removeEventListener(AUTOMATION_CHANGED_EVENT, on);
      expect(seen).toEqual([{ id: 'a1', teamId: 'ENG' }]);
   });

   it('useLiveReload com ignoreOwn não recarrega no eco da própria aba', async () => {
      const { useLiveReload } = await import('@/lib/use-live-sync');
      const reload = vi.fn();
      renderHook(() =>
         useLiveReload(ISSUE_CHANGED_EVENT, { id: 'i1' }, reload, { ignoreOwn: true })
      );
      const fire = (detail: unknown) =>
         window.dispatchEvent(new CustomEvent(ISSUE_CHANGED_EVENT, { detail }));
      fire({ id: 'i1', own: true });
      expect(reload).not.toHaveBeenCalled();
      fire({ id: 'i1' });
      expect(reload).toHaveBeenCalledTimes(1);
   });
});

describe('useLiveSync — lacunas da auditoria de 24/09', () => {
   it('reconexão também avisa templates, fila de entrada, import e relê favoritos', async () => {
      const { CATALOG_CHANGED_EVENT, TEAM_CHANGED_EVENT, IMPORT_JOB_EVENT } = await import(
         '@/lib/use-live-sync'
      );
      const { useFavoritesStore } = await import('@/store/favorites-store');
      const refresh = vi.fn(async () => {});
      useFavoritesStore.setState({ refresh });
      const seen: string[] = [];
      const names = [CATALOG_CHANGED_EVENT, TEAM_CHANGED_EVENT, IMPORT_JOB_EVENT];
      const on = (e: Event) => seen.push(e.type);
      for (const n of names) window.addEventListener(n, on);
      const es = setup();
      es.drop();
      es.open();
      await vi.advanceTimersByTimeAsync(3000);
      for (const n of names) window.removeEventListener(n, on);
      expect(seen.sort()).toEqual([...names].sort());
      expect(refresh).toHaveBeenCalledTimes(1);
   });

   it('label renomeada/apagada reflete também em projetos e initiatives', async () => {
      const label = { id: 'bug', name: 'Bug', color: '#000' };
      useWorkspaceStore.setState({
         projects: [{ id: 'p1', labels: [label] }] as never,
         initiatives: [{ id: 'n1', labels: [label] }] as never,
      });
      api.labels.list.mockResolvedValue([{ id: 'bug', name: 'Defeito', color: '#f00' }]);
      const es = setup();
      es.emit({ entity: 'label', action: 'updated', id: 'bug' });
      await flush();
      const ws = () => useWorkspaceStore.getState();
      expect(ws().projects[0].labels[0]).toMatchObject({ name: 'Defeito', color: '#f00' });
      expect(ws().initiatives[0].labels[0].name).toBe('Defeito');

      es.emit({ entity: 'label', action: 'deleted', id: 'bug' });
      await flush();
      expect(ws().projects[0].labels).toEqual([]);
      expect(ws().initiatives[0].labels).toEqual([]);
   });

   it('milestone apagada vira evento de janela (também no eco), sem GET de issue', async () => {
      const { MILESTONE_REMOVED_EVENT } = await import('@/lib/use-live-sync');
      const { getClientId } = await import('@/lib/client-id');
      const seen: unknown[] = [];
      const on = (e: Event) => seen.push((e as CustomEvent).detail);
      window.addEventListener(MILESTONE_REMOVED_EVENT, on);
      const es = setup();
      es.emit({
         entity: 'project',
         action: 'updated',
         id: 'p1',
         removedMilestoneId: 'm1',
         clientId: getClientId(),
      });
      await flush();
      window.removeEventListener(MILESTONE_REMOVED_EVENT, on);
      expect(seen).toEqual([{ id: 'm1' }]);
      expect(api.issues.get).not.toHaveBeenCalled();
   });

   it('clearRemovedMilestone limpa só o detalhe daquela milestone', async () => {
      const { clearRemovedMilestone } = await import('@/lib/adapters-issue-detail');
      const d = { milestoneId: 'm1', milestoneName: 'Beta' };
      expect(clearRemovedMilestone(d, 'm1')).toEqual({ milestoneId: null, milestoneName: null });
      expect(clearRemovedMilestone(d, 'm2')).toBe(d);
   });
});
