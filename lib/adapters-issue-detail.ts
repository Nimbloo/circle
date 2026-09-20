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

export function adaptActivity(dtos: ActivityDto[]): ActivityItem[] {
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
      };
   });
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
