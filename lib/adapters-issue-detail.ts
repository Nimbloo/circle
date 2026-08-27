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
 * Markdown -> ContentBlock[] (#16): parseia headings (#), listas (- / 1.),
 * checklists (- [ ] / - [x]), code fences (```), quotes (>), dividers (---) e
 * parágrafos. O editor continua sendo um textarea (escreve markdown), mas o
 * RENDER vira rico (o content-blocks.tsx já desenha esses tipos).
 */
export function textToBlocks(text: string | null | undefined): ContentBlock[] {
   if (!text || !text.trim()) return [];
   const lines = text.replace(/\r\n/g, '\n').split('\n');
   const blocks: ContentBlock[] = [];
   let para: string[] = [];
   const flushPara = () => {
      const t = para.join(' ').trim();
      if (t) blocks.push({ type: 'paragraph', text: t });
      para = [];
   };

   let i = 0;
   while (i < lines.length) {
      const trimmed = lines[i].trim();

      // code fence ```lang ... ```
      const fence = trimmed.match(/^```(\w*)$/);
      if (fence) {
         flushPara();
         const code: string[] = [];
         i++;
         while (i < lines.length && lines[i].trim() !== '```') code.push(lines[i++]);
         i++; // pula a fence de fechamento
         blocks.push({ type: 'code', language: fence[1] || 'text', code: code.join('\n') });
         continue;
      }
      // linha em branco separa parágrafos
      if (trimmed === '') {
         flushPara();
         i++;
         continue;
      }
      // divider
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
         flushPara();
         blocks.push({ type: 'divider' });
         i++;
         continue;
      }
      // heading # / ##…
      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
         flushPara();
         blocks.push({ type: 'heading', text: h[2].trim(), level: h[1].length === 1 ? 1 : 2 });
         i++;
         continue;
      }
      // checklist - [ ] / - [x]
      if (/^[-*]\s+\[( |x|X)\]\s+/.test(trimmed)) {
         flushPara();
         const items: { text: string; checked: boolean }[] = [];
         let m: RegExpMatchArray | null;
         while (i < lines.length && (m = lines[i].trim().match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
            items.push({ text: m[2].trim(), checked: m[1].toLowerCase() === 'x' });
            i++;
         }
         blocks.push({ type: 'checklist', items });
         continue;
      }
      // bullet list - / *
      if (/^[-*]\s+/.test(trimmed)) {
         flushPara();
         const items: string[] = [];
         let m: RegExpMatchArray | null;
         while (i < lines.length && (m = lines[i].trim().match(/^[-*]\s+(.*)$/))) {
            if (/^\[( |x|X)\]/.test(m[1])) break;
            items.push(m[1].trim());
            i++;
         }
         blocks.push({ type: 'bullet-list', items });
         continue;
      }
      // numbered list 1. 2. …
      if (/^\d+\.\s+/.test(trimmed)) {
         flushPara();
         const items: string[] = [];
         let m: RegExpMatchArray | null;
         while (i < lines.length && (m = lines[i].trim().match(/^\d+\.\s+(.*)$/))) {
            items.push(m[1].trim());
            i++;
         }
         blocks.push({ type: 'numbered-list', items });
         continue;
      }
      // quote >
      if (/^>\s?/.test(trimmed)) {
         flushPara();
         const quote: string[] = [];
         while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
            quote.push(lines[i].trim().replace(/^>\s?/, ''));
            i++;
         }
         blocks.push({ type: 'quote', text: quote.join(' ').trim() });
         continue;
      }
      // linha de parágrafo
      para.push(trimmed);
      i++;
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
            parentId: a.parentId ?? null,
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
      relatedIds: dto.relatedIds,
      blockedByIds: dto.blockedByIds,
      duplicateIds: dto.duplicateIds,
      prLinks: dto.prLinks.map((p) => ({ ...p, status: p.status as PrLink['status'] })),
      milestone: dto.milestone ?? undefined,
   };
}
