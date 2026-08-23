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
import type { ProjectDto, CreateProjectInput, UpdateProjectInput } from '@/lib/api/projects';
import type {
   ProjectDetailDto,
   ProjectMilestoneDto,
   ProjectResourceDto,
   ProjectUpdateDto,
   UpdateDetailInput,
   AddMilestoneInput,
   UpdateMilestoneInput,
   AddResourceInput,
   PostUpdateInput,
} from '@/lib/api/project-detail';
import type { TeamDto, CreateTeamInput, JoinRequestDto } from '@/lib/api/teams';
import type { MemberDto } from '@/lib/api/members';
import type { CycleDto, CreateCycleInput, UpdateCycleInput } from '@/lib/api/cycles';
import type { TemplateDto, CreateTemplateInput, UpdateTemplateInput } from '@/lib/api/templates';
import type { StatusDto, CreateStatusInput, UpdateStatusInput } from '@/lib/api/statuses';
import type {
   InitiativeDto,
   CreateInitiativeInput,
   UpdateInitiativeInput,
} from '@/lib/api/initiatives';
import type { ViewDto, CreateViewInput, UpdateViewInput } from '@/lib/api/views';
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

/** Como `request`, mas devolve o envelope inteiro {data, meta} (pra ler `meta.total`). */
async function requestEnvelope<T>(path: string): Promise<{ data: T; meta?: unknown }> {
   const res = await fetch(`/api/v1${path}`, { method: 'GET' });
   const json = await res.json().catch(() => null);
   if (!res.ok) {
      const detail = (json && (json.detail || json.title)) || res.statusText;
      throw new ApiError(res.status, String(detail), json);
   }
   return { data: (json?.data ?? json) as T, meta: json?.meta };
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
   if (opts.limit != null) sp.set('limit', String(opts.limit));
   if (opts.cursor) sp.set('cursor', opts.cursor);
   const s = sp.toString();
   return s ? `?${s}` : '';
}

/**
 * `api.me()` lê o perfil; `.update(...)` faz PATCH parcial (name/timezone);
 * `.uploadAvatar/.removeAvatar` gerenciam a foto de perfil (retornam o MeDto novo).
 */
const me = Object.assign(() => get<MeDto>('/me'), {
   update: (body: { name?: string; timezone?: string | null }) => patch<MeDto>('/me', body),
   uploadAvatar: (dataUrl: string, contentType: string) =>
      post<MeDto>('/me/avatar', { dataUrl, contentType }),
   removeAvatar: () => del<MeDto>('/me/avatar'),
});

export const api = {
   me,

   /** Agent com IA real (Bedrock/Claude via IRSA) + contexto do workspace. */
   agent: {
      chat: (messages: { role: 'user' | 'assistant'; content: string }[]) =>
         post<{ reply: string }>('/agent/chat', { messages }),
   },

   settings: {
      get: () => get<Record<string, unknown>>('/settings'),
      put: (data: Record<string, unknown>) =>
         request<Record<string, unknown>>('PUT', '/settings', data),
   },

   statuses: Object.assign(() => get<StatusDto[]>('/statuses'), {
      create: (input: CreateStatusInput) => post<StatusDto>('/statuses', input),
      update: (id: string, body: UpdateStatusInput) => patch<StatusDto>(`/statuses/${id}`, body),
      remove: (id: string) => del<{ deleted: boolean }>(`/statuses/${id}`),
      reorder: (ids: string[]) => patch<StatusDto[]>('/statuses', { ids }),
   }),
   priorities: () =>
      get<{ id: string; name: string; position: number; sortRank: number }[]>('/priorities'),
   labels: {
      list: () => get<{ id: string; name: string; color: string }[]>('/labels'),
      create: (input: { id?: string; name: string; color: string }) =>
         post<{ id: string; name: string; color: string }>('/labels', input),
      update: (id: string, body: { name?: string; color?: string }) =>
         patch<{ id: string; name: string; color: string }>(`/labels/${id}`, body),
      remove: (id: string) => del<{ deleted: boolean }>(`/labels/${id}`),
   },
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
      create: (input: CreateTeamInput) => post<TeamDto>('/teams', input),
      update: (key: string, body: { name?: string; icon?: string | null; color?: string | null }) =>
         patch<TeamDto>(`/teams/${key}`, body),
      remove: (key: string) => del<{ deleted: boolean }>(`/teams/${key}`),
      members: (key: string) => get<MemberDto[]>(`/teams/${key}/members`),
      addMember: (key: string, email: string) =>
         post<MemberDto[]>(`/teams/${key}/members`, { email }),
      removeMember: (key: string, userId: string) =>
         del<MemberDto[]>(`/teams/${key}/members/${userId}`),
      /** O usuário atual sai do time (self-service). */
      leave: (key: string) => del<MemberDto[]>(`/teams/${key}/members/self`),
      /** O usuário atual solicita entrada no time (request-to-join). */
      requestJoin: (key: string) => post<{ status: string }>(`/teams/${key}/join-requests`, {}),
      /** Solicitações pendentes do time (admin). */
      joinRequests: (key: string) => get<JoinRequestDto[]>(`/teams/${key}/join-requests`),
      /** Admin aprova/nega uma solicitação. */
      decideJoinRequest: (key: string, id: string, decision: 'approved' | 'denied') =>
         post<JoinRequestDto[]>(`/teams/${key}/join-requests/${id}`, { decision }),
      issues: (key: string, opts?: IssueListOptions) =>
         get<IssueDto[]>(`/teams/${key}/issues${issueQuery(opts)}`),
      cycles: (key: string) => get<CycleDto[]>(`/teams/${key}/cycles`),
      documents: (key: string) => get<FolderDto[]>(`/teams/${key}/documents`),
      /** Templates de issue do time (CRUD; escrita exige admin). */
      templates: (key: string) => get<TemplateDto[]>(`/teams/${key}/templates`),
      createTemplate: (key: string, input: Omit<CreateTemplateInput, 'teamId'>) =>
         post<TemplateDto>(`/teams/${key}/templates`, input),
      updateTemplate: (key: string, id: string, body: UpdateTemplateInput) =>
         patch<TemplateDto>(`/teams/${key}/templates/${id}`, body),
      deleteTemplate: (key: string, id: string) =>
         del<{ deleted: boolean }>(`/teams/${key}/templates/${id}`),
   },

   integrations: {
      /** Quais integrações estão configuradas (por env) — pro badge "Conectado". */
      status: () =>
         get<{ github: boolean; slack: boolean; sentry: boolean; email: boolean }>(
            '/integrations/status'
         ),
      /** Dispara uma mensagem de teste ao Slack (admin) — verificação da integração. */
      slackTest: () => post<{ sent: boolean; reason?: string }>('/integrations/slack/test', {}),
   },

   members: {
      list: (q = '') => get<MemberDto[]>(`/members${q}`),
      get: (id: string) => get<MemberDto>(`/members/${id}`),
      updateRole: (id: string, role: string) => patch<MemberDto>(`/members/${id}`, { role }),
      invite: (email: string, role: string) =>
         post<{ id: string; email: string; role: string }>('/members/invite', { email, role }),
   },

   projects: {
      list: (q = '') => get<ProjectDto[]>(`/projects${q}`),
      get: (id: string) => get<ProjectDto>(`/projects/${id}`),
      create: (input: CreateProjectInput) => post<ProjectDto>('/projects', input),
      update: (id: string, body: UpdateProjectInput) => patch<ProjectDto>(`/projects/${id}`, body),
      remove: (id: string) => del<{ deleted: boolean }>(`/projects/${id}`),
      issues: (id: string, opts?: IssueListOptions) =>
         get<IssueDto[]>(`/projects/${id}/issues${issueQuery(opts)}`),
      progress: (id: string) => get<ProjectProgress>(`/projects/${id}/progress`),

      // Conteúdo editorial (summary/description/milestones/updates/resources).
      detail: (id: string) => get<ProjectDetailDto>(`/projects/${id}/detail`),
      updateDetail: (id: string, body: UpdateDetailInput) =>
         patch<ProjectDetailDto>(`/projects/${id}/detail`, body),
      milestones: (id: string) => get<ProjectMilestoneDto[]>(`/projects/${id}/milestones`),
      addMilestone: (id: string, body: AddMilestoneInput) =>
         post<ProjectMilestoneDto>(`/projects/${id}/milestones`, body),
      updateMilestone: (id: string, mid: string, body: UpdateMilestoneInput) =>
         patch<ProjectMilestoneDto>(`/projects/${id}/milestones/${mid}`, body),
      removeMilestone: (id: string, mid: string) =>
         del<{ deleted: boolean }>(`/projects/${id}/milestones/${mid}`),
      updates: (id: string) => get<ProjectUpdateDto[]>(`/projects/${id}/updates`),
      postUpdate: (id: string, body: PostUpdateInput) =>
         post<ProjectUpdateDto>(`/projects/${id}/updates`, body),
      resources: (id: string) => get<ProjectResourceDto[]>(`/projects/${id}/resources`),
      addResource: (id: string, body: AddResourceInput) =>
         post<ProjectResourceDto>(`/projects/${id}/resources`, body),
      removeResource: (id: string, rid: string) =>
         del<{ deleted: boolean }>(`/projects/${id}/resources/${rid}`),
   },

   cycles: {
      get: (id: string) => get<CycleDto>(`/cycles/${id}`),
      create: (teamKey: string, input: CreateCycleInput) =>
         post<CycleDto>(`/teams/${teamKey}/cycles`, input),
      update: (id: string, body: UpdateCycleInput) => patch<CycleDto>(`/cycles/${id}`, body),
      remove: (id: string) => del<{ deleted: boolean }>(`/cycles/${id}`),
   },

   comments: {
      update: (id: string, body: string) => patch<CommentDto>(`/comments/${id}`, { body }),
      remove: (id: string) => del<{ deleted: boolean }>(`/comments/${id}`),
      addReaction: (id: string, emoji: string) =>
         post<{ ok: boolean }>(`/comments/${id}/reactions`, { emoji }),
      removeReaction: (id: string, emoji: string) =>
         del<{ ok: boolean }>(`/comments/${id}/reactions?emoji=${encodeURIComponent(emoji)}`),
   },

   initiatives: {
      list: (q = '') => get<InitiativeDto[]>(`/initiatives${q}`),
      get: (id: string) => get<InitiativeDto>(`/initiatives/${id}`),
      create: (input: CreateInitiativeInput) => post<InitiativeDto>('/initiatives', input),
      update: (id: string, body: UpdateInitiativeInput) =>
         patch<InitiativeDto>(`/initiatives/${id}`, body),
      remove: (id: string) => del<{ deleted: boolean }>(`/initiatives/${id}`),
   },

   views: {
      list: (team?: string) => get<ViewDto[]>(`/views${team ? `?team=${team}` : ''}`),
      get: (id: string) => get<ViewDto>(`/views/${id}`),
      create: (input: CreateViewInput) => post<ViewDto>('/views', input),
      update: (id: string, body: UpdateViewInput) => patch<ViewDto>(`/views/${id}`, body),
      remove: (id: string) => del<{ deleted: boolean }>(`/views/${id}`),
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
      list: async (opts: { limit?: number; offset?: number } = {}) => {
         const sp = new URLSearchParams();
         if (opts.limit != null) sp.set('limit', String(opts.limit));
         if (opts.offset != null) sp.set('offset', String(opts.offset));
         const qs = sp.toString();
         const { data, meta } = await requestEnvelope<ReviewDto[]>(`/reviews${qs ? `?${qs}` : ''}`);
         const m = (meta ?? {}) as { total?: number; limit?: number; offset?: number };
         return {
            items: data,
            total: m.total ?? data.length,
            limit: m.limit ?? opts.limit ?? data.length,
            offset: m.offset ?? opts.offset ?? 0,
         };
      },
      get: (id: string) => get<ReviewDto>(`/reviews/${id}`),
      sync: () => post<{ started: boolean }>('/reviews/sync'),
   },
};
