import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb } from './helpers/db';
import { review, reviewFile } from '@/db/schema';
import { getReview } from '@/lib/api/reviews';
import { buildGuidePrompt, generateReviewGuide, PATCH_BUDGET_BYTES } from '@/lib/api/review-guide';
import { ApiError } from '@/lib/api/errors';

const PATCH = '@@ -1,2 +1,3 @@\n line1\n+added\n line2';

type Db = Awaited<ReturnType<typeof makeTestDb>>;

// Um PGlite por arquivo (subir um por teste estoura o timeout em máquina carregada);
// cada teste usa um id de review próprio.
let db: Db;
beforeAll(async () => {
   db = await makeTestDb();
});

async function seedReview(id: string, withFiles = true) {
   await db.insert(review).values({
      id,
      title: 'Add files ingestion',
      status: 'open',
      repo: 'x/y',
      prNumber: 7,
      targetBranch: 'main',
      sourceBranch: 'feat/files',
      createdAt: new Date('2026-09-01T00:00:00Z'),
   });
   if (withFiles) {
      await db.insert(reviewFile).values([
         {
            reviewId: id,
            path: 'src/app.ts',
            status: 'modified',
            additions: 1,
            deletions: 0,
            patch: PATCH,
         },
         {
            reviewId: id,
            path: 'test/app.test.ts',
            status: 'added',
            additions: 9,
            deletions: 2,
            patch: PATCH,
         },
         {
            reviewId: id,
            path: 'assets/logo.png',
            status: 'added',
            additions: 0,
            deletions: 0,
            patch: null,
         },
      ]);
   }
}

const VALID = {
   sections: [
      {
         title: 'What changes',
         paragraphs: ['The ingestion now reads `files`.'],
         fileRefs: [{ name: 'app.ts', path: 'src', stat: '+99' }],
         diffName: 'app.ts',
      },
      {
         title: 'Tests',
         paragraphs: ['Covered by a new test.', ''],
         fileRefs: [{ name: 'app.test.ts', path: 'test', stat: '' }],
         diffName: 'does-not-exist.ts',
      },
   ],
};

describe('review guide: geração a partir do diff', () => {
   it('persiste o guia com JSON válido (mesmo com prosa em volta) e o detalhe o devolve', async () => {
      const id = 'x/y#1';
      await seedReview(id);
      const prompts: string[] = [];
      const invoke = async (prompt: string) => {
         prompts.push(prompt);
         return `Here is the guide:\n\`\`\`json\n${JSON.stringify(VALID)}\n\`\`\``;
      };

      const guide = await generateReviewGuide(db, id, { invoke });
      expect(guide.sections).toHaveLength(2);
      expect(guide.model).toBeTruthy();
      expect(new Date(guide.generatedAt).getTime()).not.toBeNaN();
      // fileRefs ancorados nos arquivos reais (stat vem do PR, não do modelo)
      expect(guide.sections[0].fileRefs[0]).toEqual({ name: 'app.ts', path: 'src', stat: '+1' });
      expect(guide.sections[1].fileRefs[0]).toEqual({
         name: 'app.test.ts',
         path: 'test',
         stat: '+9 -2',
      });
      // diffName desconhecido cai no primeiro arquivo COM patch (logo.png é binário);
      // parágrafo vazio é descartado
      expect(guide.sections[0].diffName).toBe('app.ts');
      expect(guide.sections[1].diffName).toBe('app.ts');
      expect(guide.sections[1].paragraphs).toEqual(['Covered by a new test.']);

      // prompt carrega título, repo#n, branches, arquivos e patches
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain('Add files ingestion');
      expect(prompts[0]).toContain('Pull request: x/y#7');
      expect(prompts[0]).toContain('main <- feat/files');
      expect(prompts[0]).toContain('- src/app.ts (modified, +1)');
      expect(prompts[0]).toContain(PATCH);
      expect(prompts[0]).toContain('assets/logo.png');

      const detail = await getReview(db, id);
      expect(detail?.guide?.sections).toEqual(guide.sections);
      expect(detail?.guide?.generatedAt).toBe(guide.generatedAt);
   });

   it('JSON inválido → erro claro e nada persistido', async () => {
      const id = 'x/y#2';
      await seedReview(id);
      await expect(
         generateReviewGuide(db, id, { invoke: async () => 'I cannot help with that.' })
      ).rejects.toMatchObject({ status: 502 });
      await expect(
         generateReviewGuide(db, id, { invoke: async () => '{"sections": []}' })
      ).rejects.toMatchObject({ status: 502 });
      const detail = await getReview(db, id);
      expect(detail?.guide).toBeNull();
   });

   it('review sem arquivos → 409 sem chamar o modelo', async () => {
      const id = 'x/y#3';
      await seedReview(id, false);
      let called = 0;
      const err = await generateReviewGuide(db, id, {
         invoke: async () => {
            called += 1;
            return '';
         },
      }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(409);
      expect(called).toBe(0);
   });

   it('review inexistente → 404; falha do modelo → 503', async () => {
      const id = 'x/y#4';
      await seedReview(id);
      await expect(generateReviewGuide(db, 'nope#1', {})).rejects.toMatchObject({ status: 404 });
      await expect(
         generateReviewGuide(db, id, {
            invoke: async () => {
               throw new Error('no credentials');
            },
         })
      ).rejects.toMatchObject({ status: 503 });
   });

   it('prompt: corta o patch do maior arquivo primeiro ao estourar o teto', () => {
      const big = '+'.padEnd(PATCH_BUDGET_BYTES, 'x');
      const prompt = buildGuidePrompt(
         { title: 't', repo: 'x/y', prNumber: 1, targetBranch: 'main', sourceBranch: 'b' },
         [
            { path: 'big.ts', status: 'modified', additions: 1, deletions: 0, patch: big },
            { path: 'small.ts', status: 'modified', additions: 1, deletions: 0, patch: PATCH },
         ]
      );
      expect(prompt).not.toContain(big);
      expect(prompt).toContain('### big.ts\n(patch omitted from this prompt: too large)');
      expect(prompt).toContain(PATCH);
   });
});
