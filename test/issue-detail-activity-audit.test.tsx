// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Issue } from '@/data/issues';
import type { ActivityItem } from '@/data/issue-details';
import type { ActivityItem as ActivityDto } from '@/lib/api/issue-detail';
import type { CommentPatch } from '@/components/common/issues/details/activity-feed';
import { status } from './helpers/catalog-fixture';
import { priorities } from '@/data/priorities';
import { ISSUE_CHANGED_EVENT } from '@/lib/use-live-sync';

const apiMocks = vi.hoisted(() => ({
   issues: {
      detail: vi.fn(),
      activity: vi.fn(),
      activityPage: vi.fn(),
      updateDetail: vi.fn(),
      update: vi.fn(),
   },
}));

/** Props mais recentes que o feed recebeu. */
interface FeedProps {
   activity: ActivityItem[];
   issueContext?: unknown;
   onCommentAdded?: () => void;
   onCommentPatch?: (id: string, patch: CommentPatch) => void;
   onCommentRemoved?: (id: string) => void;
   hasOlder?: boolean;
   onLoadOlder?: () => void | Promise<void>;
}
const feed = vi.hoisted(() => ({ props: null as null | FeedProps, renders: [] as FeedProps[] }));

vi.mock('@/lib/client', () => ({ api: apiMocks, ApiError: class ApiError extends Error {} }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));
vi.mock('@/components/common/editor/block-editor', () => ({ BlockEditor: () => null }));
vi.mock('@/components/common/issues/details/activity-feed', () => ({
   ActivityFeed: (props: FeedProps) => {
      feed.props = props;
      feed.renders.push(props);
      return null;
   },
}));
vi.mock('@/components/common/issues/details/issue-properties-panel', () => ({
   IssuePropertiesPanel: () => null,
}));
vi.mock('@/components/common/detail-side-panel', () => ({
   DetailSidePanel: ({ children }: { children: React.ReactNode }) => <>{children}</>,
   DetailSidePanelTrigger: () => null,
}));

const dto = {
   identifier: 'CORE-1',
   description: '',
   descriptionDoc: null,
   descriptionVersion: 'v1',
   parent: null,
   subIssues: [],
   subIssueIds: [],
   relatedIds: [],
   blockedByIds: [],
   blockingIds: [],
   duplicateIds: [],
   prLinks: [],
   attachments: [],
};

const issue: Issue = {
   id: 'a',
   identifier: 'CORE-1',
   teamId: 'CORE',
   title: 'Título',
   description: '',
   status: status[0],
   assignee: null,
   assignees: [],
   priority: priorities[0],
   labels: [],
   createdAt: '2026-09-01T00:00:00Z',
   cycleId: '',
   rank: 'a1',
};

const actor = { id: 'u1', slug: 'ana', name: 'Ana', email: 'ana@nimbloo.ai', avatarUrl: null };
const at = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString();
const commentDto = (id: string, n: number, over: Partial<ActivityDto> = {}): ActivityDto => ({
   kind: 'comment',
   id,
   actor,
   createdAt: at(n),
   body: `corpo ${id}`,
   parentId: null,
   updatedAt: null,
   resolvedAt: null,
   resolvedBy: null,
   reactions: [],
   attachments: [],
   ...over,
});
const eventDto = (id: string, n: number): ActivityDto => ({
   kind: 'event',
   id,
   actor,
   createdAt: at(n),
   event: 'status',
   text: 'mudou',
});

function deferred<T>() {
   let resolve!: (v: T) => void;
   const promise = new Promise<T>((r) => (resolve = r));
   return { promise, resolve };
}

const commentIn = (id: string) =>
   feed.props!.activity.find((i) => i.id === id) as Extract<ActivityItem, { kind: 'comment' }>;

beforeEach(() => {
   vi.clearAllMocks();
   feed.props = null;
   feed.renders.length = 0;
   apiMocks.issues.detail.mockResolvedValue(dto);
});

async function mount(initial: ActivityDto[]) {
   apiMocks.issues.activity.mockResolvedValueOnce(initial);
   const { IssueDetailView } = await import('@/components/common/issues/details/issue-details');
   render(<IssueDetailView issue={issue} />);
   await waitFor(() => expect(feed.props?.activity.length).toBe(initial.length));
}

describe('detalhe da issue — caminho do feed', () => {
   it('reload iniciado antes de um patch otimista não apaga o patch ao voltar', async () => {
      await mount([commentDto('c1', 1)]);
      const stale = deferred<ActivityDto[]>();
      apiMocks.issues.activity.mockReturnValueOnce(stale.promise);
      act(() => feed.props!.onCommentAdded!());
      act(() =>
         feed.props!.onCommentPatch!('c1', {
            reactions: [{ emoji: '👍', count: 1, reactedByMe: true }],
         })
      );
      expect(commentIn('c1').reactions).toHaveLength(1);
      // o GET começou antes da reação: volta com o snapshot sem ela
      await act(async () => stale.resolve([commentDto('c1', 1)]));
      expect(commentIn('c1').reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: true }]);
   });

   it('eco próprio de comentário (own) não recarrega o feed', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
         await mount([commentDto('c1', 1)]);
         apiMocks.issues.activity.mockClear();
         act(() => {
            window.dispatchEvent(
               new CustomEvent(ISSUE_CHANGED_EVENT, {
                  detail: { id: 'a', scope: 'activity', own: true },
               })
            );
         });
         await act(() => vi.advanceTimersByTimeAsync(500));
         expect(apiMocks.issues.activity).not.toHaveBeenCalled();
      } finally {
         vi.useRealTimers();
      }
   });

   it('feed cheio oferece "Show older activity"; a página anterior entra e sobrevive ao reload', async () => {
      const page = Array.from({ length: 200 }, (_, i) => eventDto(`e${i + 100}`, i + 100));
      await mount(page);
      expect(feed.props!.hasOlder).toBe(true);

      apiMocks.issues.activityPage.mockResolvedValueOnce({
         items: [eventDto('e1', 1), eventDto('e2', 2)],
         hasMore: false,
      });
      await act(async () => {
         await feed.props!.onLoadOlder!();
      });
      expect(apiMocks.issues.activityPage).toHaveBeenCalledWith('a', {
         before: { createdAt: at(100), id: 'e100' },
      });
      expect(feed.props!.activity.slice(0, 3).map((i) => i.id)).toEqual(['e1', 'e2', 'e100']);
      expect(feed.props!.hasOlder).toBe(false);

      // reload do feed (comentário novo): a página mais recente volta, as antigas ficam
      apiMocks.issues.activity.mockResolvedValueOnce([...page.slice(1), commentDto('c-new', 400)]);
      act(() => feed.props!.onCommentAdded!());
      await waitFor(() => expect(feed.props!.activity.some((i) => i.id === 'c-new')).toBe(true));
      const ids = feed.props!.activity.map((i) => i.id);
      expect(ids.slice(0, 3)).toEqual(['e1', 'e2', 'e100']);
      expect(new Set(ids).size).toBe(ids.length);
   });

   it('comentário excluído sai do feed local na hora', async () => {
      await mount([commentDto('c1', 1), commentDto('r1', 2, { parentId: 'c1' })]);
      act(() => feed.props!.onCommentRemoved!('c1'));
      expect(feed.props!.activity).toHaveLength(0);
   });

   it('props do feed ficam estáveis entre reloads (issueContext e itens iguais)', async () => {
      await mount([commentDto('c1', 1), commentDto('c2', 2)]);
      const before = feed.props!;
      apiMocks.issues.activity.mockResolvedValueOnce([
         commentDto('c1', 1),
         commentDto('c2', 2, { body: 'editado', updatedAt: at(3) }),
      ]);
      act(() => feed.props!.onCommentAdded!());
      await waitFor(() => expect(feed.props!.activity).not.toBe(before.activity));
      expect(feed.props!.issueContext).toBe(before.issueContext);
      expect(feed.props!.activity[0]).toBe(before.activity[0]);
      expect(feed.props!.activity[1]).not.toBe(before.activity[1]);
   });
});
