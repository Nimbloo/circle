/**
 * Adapters API -> tipos ricos do detalhe da issue. O backend guarda descrição/
 * comentário como texto plano; a UI usa ContentBlock[]. Convertemos texto em
 * blocos de parágrafo (split em linhas em branco) e resolvemos os UserRef em User.
 */
import { adaptUser } from '@/lib/adapters';
import type { User } from '@/data/users';
import type { ContentBlock, ActivityItem, IssueDetail, PrLink } from '@/data/issue-details';
import type { IssueDetailDto, ActivityItem as ActivityDto } from '@/lib/api/issue-detail';

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

/** Tempo relativo compacto ("2h", "1d") a partir de um ISO. */
function relativeTime(iso: string): string {
   const then = new Date(iso).getTime();
   const diff = Math.max(0, Date.now() - then);
   const min = Math.floor(diff / 60000);
   if (min < 1) return 'now';
   if (min < 60) return `${min}m`;
   const hours = Math.floor(min / 60);
   if (hours < 24) return `${hours}h`;
   const days = Math.floor(hours / 24);
   if (days < 7) return `${days}d`;
   return `${Math.floor(days / 7)}w`;
}

/** Texto plano -> ContentBlock[]: cada bloco separado por linha em branco vira um parágrafo. */
export function textToBlocks(text: string | null | undefined): ContentBlock[] {
   if (!text || !text.trim()) return [];
   return text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ({ type: 'paragraph', text: p }) as ContentBlock);
}

function adaptActivity(dtos: ActivityDto[]): ActivityItem[] {
   return dtos.map((a) => {
      const actor = a.actor ? adaptUser(a.actor) : SYSTEM_USER;
      const timeAgo = relativeTime(a.createdAt);
      if (a.kind === 'comment') {
         return {
            kind: 'comment',
            id: a.id,
            actor,
            timeAgo,
            body: textToBlocks(a.body),
            reactions: a.reactions,
         };
      }
      return {
         kind: 'event',
         id: a.id,
         actor,
         event: a.event ?? '',
         text: a.text ?? '',
         timeAgo,
      };
   });
}

export function adaptIssueDetail(dto: IssueDetailDto, activity: ActivityDto[]): IssueDetail {
   return {
      identifier: dto.identifier,
      description: textToBlocks(dto.description),
      activity: adaptActivity(activity),
      subIssueIds: dto.subIssueIds,
      parentIds: dto.parentIds,
      relatedIds: dto.relatedIds,
      blockedByIds: dto.blockedByIds,
      blockingIds: dto.blockingIds,
      prLinks: dto.prLinks.map((p) => ({ ...p, status: p.status as PrLink['status'] })),
      milestone: dto.milestone ?? undefined,
      subscriberIds: dto.subscriberIds,
      subscribed: dto.subscribed,
      favorited: dto.favorited,
      resources: dto.resources,
      reactions: dto.reactions,
      attachments: dto.attachments,
   };
}
