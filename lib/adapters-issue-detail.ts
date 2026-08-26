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

/**
 * Markdown (block-level) -> ContentBlock[]. Suporta heading (#/##), code fence (```),
 * bullet/numbered list, checklist (- [ ]/- [x]), quote (>), divider (---) e parágrafo.
 * A formatação INLINE (bold/italic/code/link) é resolvida no render (InlineText).
 */
export function textToBlocks(text: string | null | undefined): ContentBlock[] {
   if (!text || !text.trim()) return [];
   const lines = text.replace(/\r\n/g, '\n').split('\n');
   const blocks: ContentBlock[] = [];
   let para: string[] = [];
   const flushPara = () => {
      if (para.length) {
         blocks.push({ type: 'paragraph', text: para.join('\n') });
         para = [];
      }
   };

   for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Code fence ```lang ... ```
      const fence = trimmed.match(/^```(\w*)$/);
      if (fence) {
         flushPara();
         const lang = fence[1] || 'text';
         const code: string[] = [];
         i++;
         while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) code.push(lines[i++]);
         blocks.push({ type: 'code', language: lang, code: code.join('\n') });
         continue;
      }

      if (trimmed === '') {
         flushPara();
         continue;
      }

      // Divider
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
         flushPara();
         blocks.push({ type: 'divider' });
         continue;
      }

      // Heading
      const h = trimmed.match(/^(#{1,2})\s+(.*)$/);
      if (h) {
         flushPara();
         blocks.push({ type: 'heading', text: h[2], level: h[1].length as 1 | 2 });
         continue;
      }

      // Quote (agrupa linhas consecutivas)
      if (/^>\s?/.test(trimmed)) {
         flushPara();
         const q: string[] = [];
         while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
            q.push(lines[i].trim().replace(/^>\s?/, ''));
            i++;
         }
         i--;
         blocks.push({ type: 'quote', text: q.join('\n') });
         continue;
      }

      // Checklist - [ ] / - [x]
      if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
         flushPara();
         const items: { text: string; checked: boolean }[] = [];
         while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[i].trim())) {
            const m = lines[i].trim().match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
            if (m) items.push({ text: m[2], checked: m[1].toLowerCase() === 'x' });
            i++;
         }
         i--;
         blocks.push({ type: 'checklist', items });
         continue;
      }

      // Bullet list
      if (/^[-*]\s+/.test(trimmed)) {
         flushPara();
         const items: string[] = [];
         while (
            i < lines.length &&
            /^[-*]\s+/.test(lines[i].trim()) &&
            !/^[-*]\s+\[[ xX]\]\s+/.test(lines[i].trim())
         ) {
            items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
            i++;
         }
         i--;
         blocks.push({ type: 'bullet-list', items });
         continue;
      }

      // Numbered list
      if (/^\d+\.\s+/.test(trimmed)) {
         flushPara();
         const items: string[] = [];
         while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
            items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
            i++;
         }
         i--;
         blocks.push({ type: 'numbered-list', items });
         continue;
      }

      // Parágrafo (acumula linhas consecutivas)
      para.push(trimmed);
   }
   flushPara();
   return blocks;
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
