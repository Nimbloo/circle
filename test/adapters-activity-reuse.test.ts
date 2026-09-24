import { describe, expect, it } from 'vitest';
import { activityCursor, adaptActivity, mergeOlderActivity } from '@/lib/adapters-issue-detail';
import type { ActivityItem as ActivityDto } from '@/lib/api/issue-detail';

const actor = {
   id: 'u1',
   slug: 'ana',
   name: 'Ana',
   email: 'ana@nimbloo.ai',
   avatarUrl: null,
};
const at = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString();
const c = (id: string, n: number, over: Partial<ActivityDto> = {}): ActivityDto => ({
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
const e = (id: string, n: number): ActivityDto => ({
   kind: 'event',
   id,
   actor,
   createdAt: at(n),
   event: 'status',
   text: 'mudou',
});

describe('adaptActivity — reaproveita itens iguais (feed longo)', () => {
   it('item sem mudança mantém a identidade; o que mudou vira objeto novo', () => {
      const first = adaptActivity([e('e1', 1), c('c1', 2), c('c2', 3)]);
      const second = adaptActivity(
         [
            e('e1', 1),
            c('c1', 2),
            c('c2', 3, { reactions: [{ emoji: '👍', count: 1, reactedByMe: false }] }),
         ],
         first
      );
      expect(second[0]).toBe(first[0]);
      expect(second[1]).toBe(first[1]);
      expect(second[2]).not.toBe(first[2]);
   });

   it('leva createdAt e a marca de contexto', () => {
      const [item] = adaptActivity([c('c1', 2, { context: true })]);
      expect(item.createdAt).toBe(at(2));
      expect(item.context).toBe(true);
   });
});

describe('paginação do feed no cliente', () => {
   it('cursor = item mais antigo que não é contexto', () => {
      const items = adaptActivity([c('root', 1, { context: true }), e('e5', 5), c('c6', 6)]);
      expect(activityCursor(items)).toEqual({ createdAt: at(5), id: 'e5' });
   });

   it('página anterior entra antes, sem duplicar, e troca o item de contexto pelo real', () => {
      const current = adaptActivity([
         c('root', 1, { context: true }),
         e('e5', 5),
         c('r6', 6, { parentId: 'root' }),
      ]);
      const older = adaptActivity([c('root', 1), e('e2', 2), e('e3', 3)]);
      const merged = mergeOlderActivity(current, older);
      expect(merged.map((i) => i.id)).toEqual(['root', 'e2', 'e3', 'e5', 'r6']);
      expect(merged[0].context).toBeFalsy();
   });
});
