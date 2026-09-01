import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { review } from '@/db/schema';
import { listReviews } from '@/lib/api/reviews';

/**
 * "For you" x "Created" em Reviews.
 *
 * Antes as duas abas mostravam o MESMO conjunto — o backend não modelava a distinção, e
 * a UI admitia isso num comentário. O bloqueio real era que `review.author` guarda o
 * LOGIN DO GITHUB e o usuário do Circle não tinha esse handle; sem a ponte, não há como
 * dizer "meus PRs".
 *
 * Decisão consciente: sem handle configurado a lista volta VAZIA, não "tudo". Devolver o
 * conjunto inteiro faria a aba parecer funcionar enquanto não filtra nada — que é
 * exatamente o estado anterior.
 */

const ANA = 'ana-gh';
const BOB = 'bob-gh';

async function setup() {
   const db = await makeTestDb();
   const rows = [
      { id: 'r#1', author: ANA, requestedReviewers: BOB, status: 'open' },
      { id: 'r#2', author: BOB, requestedReviewers: ANA, status: 'open' },
      { id: 'r#3', author: BOB, requestedReviewers: `${ANA},${BOB}`, status: 'merged' },
      { id: 'r#4', author: BOB, requestedReviewers: null, status: 'open' },
      // Armadilha de substring: `ana-gh-bot` NÃO é `ana-gh`.
      { id: 'r#5', author: 'ana-gh-bot', requestedReviewers: 'ana-gh-bot', status: 'open' },
   ];
   for (const [i, r] of rows.entries()) {
      await db.insert(review).values({
         id: r.id,
         title: `PR ${i}`,
         status: r.status,
         repo: 'Nimbloo/circle',
         prNumber: i + 1,
         author: r.author,
         requestedReviewers: r.requestedReviewers,
      });
   }
   return db;
}

describe('reviews: For you x Created', () => {
   it('created devolve so os PRs abertos por mim', async () => {
      const db = await setup();
      const page = await listReviews(db, { list: 'created', viewerLogin: ANA });
      expect(page.items.map((r) => r.id)).toEqual(['r#1']);
      expect(page.total).toBe(1);
   });

   it('for-you devolve so os PRs em que fui solicitado como reviewer', async () => {
      const db = await setup();
      const page = await listReviews(db, { list: 'for-you', viewerLogin: ANA });
      expect(page.items.map((r) => r.id).sort()).toEqual(['r#2', 'r#3']);
   });

   it('nao casa login por substring (ana-gh nao e ana-gh-bot)', async () => {
      const db = await setup();
      const mine = await listReviews(db, { list: 'for-you', viewerLogin: ANA });
      expect(mine.items.map((r) => r.id)).not.toContain('r#5');

      const bot = await listReviews(db, { list: 'for-you', viewerLogin: 'ana-gh-bot' });
      expect(bot.items.map((r) => r.id)).toEqual(['r#5']);
   });

   it('sem handle configurado a lista volta VAZIA, nao "tudo"', async () => {
      const db = await setup();
      expect((await listReviews(db, { list: 'created', viewerLogin: null })).items).toHaveLength(0);
      expect((await listReviews(db, { list: 'for-you', viewerLogin: '' })).items).toHaveLength(0);
      // Sem `list`, segue devolvendo o conjunto todo (comportamento anterior preservado).
      expect((await listReviews(db, {})).items).toHaveLength(5);
   });

   it('combina com o filtro de status', async () => {
      const db = await setup();
      const page = await listReviews(db, {
         list: 'for-you',
         viewerLogin: ANA,
         status: 'merged',
      });
      expect(page.items.map((r) => r.id)).toEqual(['r#3']);
   });
});
