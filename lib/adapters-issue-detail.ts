/**
 * Adapters API -> tipos ricos do detalhe da issue. O backend guarda descrição/
 * comentário como texto plano; a UI usa ContentBlock[]. Convertemos texto em
 * blocos de parágrafo (split em linhas em branco) e resolvemos os UserRef em User.
 */
import { adaptUser } from '@/lib/adapters';
import type { User } from '@/data/users';
import type { ActivityItem, Attachment, IssueDetail, PrLink } from '@/data/issue-details';
import type { IssueDetailDto, ActivityItem as ActivityDto } from '@/lib/api/issue-detail';
import type { AttachmentDto } from '@/lib/api/attachments';
import { textToBlocks } from '@/lib/text-blocks';
import { relativeTime } from '@/lib/relative-time';

export { textToBlocks };

/**
 * Milestone apagada (evento remoto): o detalhe que apontava para ela fica sem milestone.
 * Devolve o MESMO objeto quando não é a milestone dele (sem re-render à toa).
 */
export function clearRemovedMilestone<T extends Pick<IssueDetail, 'milestoneId' | 'milestoneName'>>(
   detail: T,
   milestoneId: string
): T {
   return detail.milestoneId === milestoneId
      ? { ...detail, milestoneId: null, milestoneName: null }
      : detail;
}

export function adaptAttachment(dto: AttachmentDto): Attachment {
   return {
      id: dto.id,
      url: dto.url,
      fileName: dto.fileName,
      contentType: dto.contentType,
      size: dto.size,
      commentId: dto.commentId,
      uploadedById: dto.uploadedBy?.id ?? null,
      createdAt: dto.createdAt,
   };
}

/** Usuário sintético para eventos/comentários sem actor conhecido (ex.: sistema). */
const SYSTEM_USER: User = {
   id: 'system',
   name: 'Circle',
   email: '',
   avatarUrl: '',
   status: 'offline',
   role: 'Application',
   joinedDate: '2026-01-01',
   teamIds: [],
   timezone: 'UTC',
};

/**
 * Assinatura do DTO de onde cada item adaptado saiu: um reload que devolve o MESMO item
 * (mesmo DTO e mesmo "há X") reaproveita o objeto anterior — o card memoizado não
 * re-renderiza. Item mexido por patch otimista é objeto novo, sem assinatura.
 */
const sourceOf = new WeakMap<ActivityItem, string>();

function adaptOne(a: ActivityDto, timeAgo: string): ActivityItem {
   const actor = a.actor ? adaptUser(a.actor) : SYSTEM_USER;
   const extra = { createdAt: a.createdAt, ...(a.context ? { context: true } : {}) };
   if (a.kind === 'comment') {
      return {
         kind: 'comment',
         id: a.id,
         actor,
         timeAgo,
         ...extra,
         body: textToBlocks(a.body),
         source: a.body ?? '',
         parentId: a.parentId ?? null,
         updatedAt: a.updatedAt ?? null,
         resolvedAt: a.resolvedAt ?? null,
         resolvedBy: a.resolvedBy ? adaptUser(a.resolvedBy) : null,
         reactions: a.reactions,
         attachments: (a.attachments ?? []).map(adaptAttachment),
      };
   }
   return {
      kind: 'event',
      id: a.id,
      actor,
      event: a.event ?? '',
      text: a.text ?? '',
      timeAgo,
      ...extra,
   };
}

/** DTOs do feed → itens da UI; `prev` = itens atuais, reaproveitados quando iguais. */
export function adaptActivity(dtos: ActivityDto[], prev: ActivityItem[] = []): ActivityItem[] {
   const byId = new Map(prev.map((p) => [p.id, p]));
   return dtos.map((a) => {
      const timeAgo = relativeTime(a.createdAt);
      const source = JSON.stringify(a);
      const old = byId.get(a.id);
      if (old && old.timeAgo === timeAgo && sourceOf.get(old) === source) return old;
      const item = adaptOne(a, timeAgo);
      sourceOf.set(item, source);
      return item;
   });
}

type Positioned = { createdAt?: string; id: string };

/** Ordem do feed (mesma do servidor): data e, no empate, id. */
function feedOrder(a: Positioned, b: Positioned): number {
   const ca = a.createdAt ?? '';
   const cb = b.createdAt ?? '';
   if (ca !== cb) return ca < cb ? -1 : 1;
   return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Cursor da página anterior: o item mais antigo que não veio só como contexto. */
export function activityCursor(items: ActivityItem[]): { createdAt: string; id: string } | null {
   let oldest: (ActivityItem & { createdAt: string }) | null = null;
   for (const it of items) {
      if (it.context || !it.createdAt) continue;
      if (!oldest || feedOrder(it, oldest) < 0) oldest = it as ActivityItem & { createdAt: string };
   }
   return oldest ? { createdAt: oldest.createdAt, id: oldest.id } : null;
}

/**
 * Junta uma página mais antiga ao feed: sem duplicar, trocando o item que estava só como
 * contexto (raiz de thread) pela versão da página dele.
 */
export function mergeOlderActivity(current: ActivityItem[], older: ActivityItem[]): ActivityItem[] {
   const byId = new Map(current.map((it) => [it.id, it]));
   for (const it of older) {
      const had = byId.get(it.id);
      if (!had || (had.context && !it.context)) byId.set(it.id, it);
   }
   return [...byId.values()].sort(feedOrder);
}

/**
 * Página mais recente recarregada, com as páginas antigas já abertas: mantém os itens
 * anteriores ao início da página nova (o que a página nova traz ganha).
 */
export function keepOlderActivity(fresh: ActivityItem[], prev: ActivityItem[]): ActivityItem[] {
   const cursor = activityCursor(fresh);
   if (!cursor) return fresh;
   const ids = new Set(fresh.map((it) => it.id));
   const older = prev.filter(
      (it) => !ids.has(it.id) && !it.context && it.createdAt && feedOrder(it, cursor) < 0
   );
   return older.length ? [...older, ...fresh].sort(feedOrder) : fresh;
}

export function adaptIssueDetail(dto: IssueDetailDto, activity: ActivityDto[]): IssueDetail {
   return {
      identifier: dto.identifier,
      description: textToBlocks(dto.description),
      descriptionDoc: dto.descriptionDoc ?? null,
      activity: adaptActivity(activity),
      parent: dto.parent ?? null,
      subIssues: dto.subIssues ?? [],
      subIssueIds: dto.subIssueIds,
      relatedIds: dto.relatedIds,
      blockedByIds: dto.blockedByIds,
      blockingIds: dto.blockingIds,
      duplicateIds: dto.duplicateIds,
      prLinks: dto.prLinks.map((p) => ({ ...p, status: p.status as PrLink['status'] })),
      attachments: (dto.attachments ?? []).map(adaptAttachment),
      milestone: dto.milestone ?? undefined,
      // FK estruturada (o painel exibe milestoneName; sem isto o picker sempre mostrava
      // "Add milestone" mesmo com milestone salva — o adapter dropava os campos).
      milestoneId: dto.milestoneId,
      milestoneName: dto.milestoneName,
   };
}
