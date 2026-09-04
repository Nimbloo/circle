import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SearchResult } from '@/lib/api/search';

const bedrock = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock('@/lib/api/agent', () => ({ embedTexts: bedrock.embedTexts }));

const { rerankSemantic, __clearEmbedCache } = await import('@/lib/api/search-semantic');

/** Resultado léxico com 3 issues: a ordem original é a1, a2, a3. */
function lexical(): SearchResult {
   const item = (id: string, title: string) => ({
      id,
      identifier: null,
      title,
      snippet: title,
      rank: 1,
      teamId: null,
      statusId: null,
      url: `/issue/${id}`,
   });
   return {
      query: 'autenticação',
      groups: [
         {
            type: 'issue' as const,
            items: [item('a1', 'nada a ver'), item('a2', 'login por SSO'), item('a3', 'outro')],
         },
      ],
      fallback: false,
      semantic: false,
   };
}

beforeEach(() => {
   vi.clearAllMocks();
   __clearEmbedCache();
   delete process.env.CIRCLE_SEARCH_SEMANTIC;
});

afterEach(() => {
   delete process.env.CIRCLE_SEARCH_SEMANTIC;
});

describe('rerankSemantic', () => {
   it('sem a flag não chama o Bedrock e devolve a ordem léxica', async () => {
      const res = await rerankSemantic(lexical());
      expect(bedrock.embedTexts).not.toHaveBeenCalled();
      expect(res.semantic).toBe(false);
      expect(res.groups[0].items.map((i) => i.id)).toEqual(['a1', 'a2', 'a3']);
   });

   it('com a flag reordena por similaridade com a query', async () => {
      process.env.CIRCLE_SEARCH_SEMANTIC = '1';
      // Vetores: a query aponta na mesma direção de 'login por SSO'.
      const byText: Record<string, number[]> = {
         'autenticação': [1, 0],
         'nada a ver': [0, 1],
         'login por SSO': [1, 0],
         'outro': [0.5, 0.8],
      };
      bedrock.embedTexts.mockImplementation(async (texts: string[]) =>
         texts.map((t) => byText[t] ?? [0, 0])
      );

      const res = await rerankSemantic(lexical());
      expect(res.semantic).toBe(true);
      expect(res.groups[0].items.map((i) => i.id)).toEqual(['a2', 'a3', 'a1']);
   });

   it('erro do Bedrock devolve o resultado léxico intacto (nunca quebra a busca)', async () => {
      process.env.CIRCLE_SEARCH_SEMANTIC = '1';
      bedrock.embedTexts.mockRejectedValue(new Error('ResourceNotFound'));

      const res = await rerankSemantic(lexical());
      expect(res.semantic).toBe(false);
      expect(res.groups[0].items.map((i) => i.id)).toEqual(['a1', 'a2', 'a3']);
   });

   it('cacheia por texto: a segunda busca igual não reembeda nada', async () => {
      process.env.CIRCLE_SEARCH_SEMANTIC = '1';
      bedrock.embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0]));

      await rerankSemantic(lexical());
      expect(bedrock.embedTexts).toHaveBeenCalledTimes(1);
      const first = bedrock.embedTexts.mock.calls[0][0] as string[];
      expect(first).toHaveLength(4); // query + 3 títulos

      await rerankSemantic(lexical());
      expect(bedrock.embedTexts).toHaveBeenCalledTimes(1);
   });
});
