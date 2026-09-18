// @vitest-environment jsdom

import './setup-dom';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
   projects: { get: vi.fn() },
   initiatives: { get: vi.fn() },
   cycles: { get: vi.fn() },
   members: { get: vi.fn() },
   views: { get: vi.fn() },
   teams: { get: vi.fn() },
   labels: { list: vi.fn() },
}));
vi.mock('@/lib/client', () => ({ api }));

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

/** Deixa as promessas dos fetches direcionados resolverem. */
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
   vi.useFakeTimers();
   vi.clearAllMocks();
   FakeEventSource.instances = [];
   vi.stubGlobal('EventSource', FakeEventSource);
   useIssuesStore.setState({ hydrate: hydrateIssues, issues: [] });
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
      expect(seen).toEqual([{ id: 'i1' }, { id: undefined }]);
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
