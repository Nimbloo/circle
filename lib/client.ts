/**
 * Cliente HTTP tipado do frontend para /api/v1. Reusa os DTOs do backend (mesmo repo),
 * então o contrato é compartilhado 1:1 — sem drift entre front e back.
 */
import type {
   IssueDto,
   IssueListOptions,
   CreateIssueInput,
   UpdateIssueInput,
} from '@/lib/api/issues';
import type { ProjectDto } from '@/lib/api/projects';
import type { TeamDto } from '@/lib/api/teams';
import type { MemberDto } from '@/lib/api/members';
import type { CycleDto } from '@/lib/api/cycles';
import type { InitiativeDto } from '@/lib/api/initiatives';
import type { ViewDto } from '@/lib/api/views';
import type { NotificationDto } from '@/lib/api/notifications';
import type { ReviewDto } from '@/lib/api/reviews';
import type { FolderDto } from '@/lib/api/documents';
import type { IssueDetailDto, CommentDto, ActivityItem } from '@/lib/api/issue-detail';
import type { IssueMatrix, ProjectProgress } from '@/lib/api/aggregations';
import type { MeDto } from '@/lib/api/users';

export class ApiError extends Error {
   constructor(
      public readonly status: number,
      message: string,
      public readonly problem?: unknown
   ) {
      super(message);
      this.name = 'ApiError';
   }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
   const res = await fetch(`/api/v1${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
   });
   const json = await res.json().catch(() => null);
   if (!res.ok) {
      const detail = (json && (json.detail || json.title)) || res.statusText;
      throw new ApiError(res.status, String(detail), json);
   }
   return (json?.data ?? json) as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

/** Serializa filtros de issue em query string (params planos multivalorados). */
function issueQuery(opts: IssueListOptions = {}): string {
   const sp = new URLSearchParams();
   const arr = (k: string, v?: string[]) => v?.forEach((x) => sp.append(k, x));
   if (opts.team) sp.set('team', opts.team);
   arr('status', opts.status);
   arr('statusType', opts.statusType);
   arr('assignee', opts.assignee);
   arr('priority', opts.priority);
   arr('labels', opts.labels);
   arr('project', opts.project);
   arr('cycle', opts.cycle);
   if (opts.q) sp.set('q', opts.q);
   if (opts.orderBy) sp.set('orderBy', opts.orderBy);
   const s = sp.toString();
   return s ? `?${s}` : '';
}

export const api = {
   me: () => get<MeDto>('/me'),

   statuses: () =>
      get<{ id: string; name: string; color: string; category: string; position: number }[]>(
         '/statuses'
      ),
   priorities: () =>
      get<{ id: string; name: string; position: number; sortRank: number }[]>('/priorities'),
   labels: () => get<{ id: string; name: string; color: string }[]>('/labels'),
   healthStates: () =>
      get<{ id: string; name: string; color: string; description: string | null }[]>(
         '/health-states'
      ),

   issues: {
      list: (opts?: IssueListOptions) => get<IssueDto[]>(`/issues${issueQuery(opts)}`),
      get: (id: string) => get<IssueDto>(`/issues/${id}`),
      create: (input: CreateIssueInput) => post<IssueDto>('/issues', input),
      update: (id: string, patchInput: UpdateIssueInput) =>
         patch<IssueDto>(`/issues/${id}`, patchInput),
      remove: (id: string) => del<{ deleted: boolean }>(`/issues/${id}`),
      reorder: (id: string, beforeId?: string | null, afterId?: string | null) =>
         patch<IssueDto>(`/issues/${id}/rank`, { beforeId, afterId }),
      addLabel: (id: string, labelId: string) =>
         post<IssueDto>(`/issues/${id}/labels`, { labelId }),
      removeLabel: (id: string, labelId: string) =>
         del<IssueDto>(`/issues/${id}/labels/${labelId}`),
      detail: (id: string) => get<IssueDetailDto>(`/issues/${id}/detail`),
      addRelation: (id: string, relatedId: string, kind: string) =>
         post<IssueDetailDto>(`/issues/${id}/relations`, { relatedId, kind }),
      removeRelation: (id: string, relatedId: string, kind: string) =>
         del<IssueDetailDto>(
            `/issues/${id}/relations?relatedId=${encodeURIComponent(relatedId)}&kind=${kind}`
         ),
      activity: (id: string) => get<ActivityItem[]>(`/issues/${id}/activity`),
      comments: (id: string) => get<CommentDto[]>(`/issues/${id}/comments`),
      addComment: (id: string, body: string) =>
         post<CommentDto>(`/issues/${id}/comments`, { body }),
      aggregate: (team?: string) =>
         get<IssueMatrix>(`/issues/aggregate${team ? `?team=${team}` : ''}`),
   },

   teams: {
      list: (q = '') => get<TeamDto[]>(`/teams${q}`),
      get: (key: string) => get<TeamDto>(`/teams/${key}`),
      members: (key: string) => get<MemberDto[]>(`/teams/${key}/members`),
      issues: (key: string, opts?: IssueListOptions) =>
         get<IssueDto[]>(`/teams/${key}/issues${issueQuery(opts)}`),
      cycles: (key: string) => get<CycleDto[]>(`/teams/${key}/cycles`),
      documents: (key: string) => get<FolderDto[]>(`/teams/${key}/documents`),
   },

   members: {
      list: (q = '') => get<MemberDto[]>(`/members${q}`),
      get: (id: string) => get<MemberDto>(`/members/${id}`),
   },

   projects: {
      list: (q = '') => get<ProjectDto[]>(`/projects${q}`),
      get: (id: string) => get<ProjectDto>(`/projects/${id}`),
      issues: (id: string, opts?: IssueListOptions) =>
         get<IssueDto[]>(`/projects/${id}/issues${issueQuery(opts)}`),
      progress: (id: string) => get<ProjectProgress>(`/projects/${id}/progress`),
   },

   cycles: { get: (id: string) => get<CycleDto>(`/cycles/${id}`) },

   initiatives: {
      list: (q = '') => get<InitiativeDto[]>(`/initiatives${q}`),
      get: (id: string) => get<InitiativeDto>(`/initiatives/${id}`),
   },

   views: {
      list: (team?: string) => get<ViewDto[]>(`/views${team ? `?team=${team}` : ''}`),
      get: (id: string) => get<ViewDto>(`/views/${id}`),
      results: (id: string) =>
         get<{ type: string; issues?: IssueDto[]; projects?: ProjectDto[] }>(
            `/views/${id}/results`
         ),
   },

   inbox: {
      list: (q = '') => get<NotificationDto[]>(`/inbox${q}`),
      unreadCount: () => get<{ count: number }>('/inbox/unread-count'),
      setRead: (id: string, read: boolean) =>
         patch<{ id: string; read: boolean }>(`/notifications/${id}`, { read }),
      readAll: () => post<{ marked: number }>('/notifications/read-all'),
   },

   reviews: {
      list: () => get<ReviewDto[]>('/reviews'),
      get: (id: string) => get<ReviewDto>(`/reviews/${id}`),
      sync: () => post<{ synced: number }>('/reviews/sync'),
   },
};
