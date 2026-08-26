import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { createDocPage, getDocPage, updateDocPage } from '@/lib/api/doc-pages';

const ANA = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedUser(db, { name: 'Ana', email: ANA });
   return { db };
}

describe('doc pages', () => {
   it('cria um documento (título default quando vazio) e lê de volta', async () => {
      const { db } = await setup();
      const doc = await createDocPage(db, {}, ANA);
      expect(doc.title).toBe('Untitled document');
      expect(doc.content).toBe('');

      const read = await getDocPage(db, doc.id);
      expect(read?.id).toBe(doc.id);
      expect(read?.title).toBe('Untitled document');
   });

   it('usa o título fornecido (trim)', async () => {
      const { db } = await setup();
      const doc = await createDocPage(db, { title: '  Plano Q3  ' }, ANA);
      expect(doc.title).toBe('Plano Q3');
   });

   it('atualiza título e conteúdo e bumpa updatedAt', async () => {
      const { db } = await setup();
      const doc = await createDocPage(db, { title: 'A' }, ANA);
      const updated = await updateDocPage(db, doc.id, { title: 'B', content: '# corpo' });
      expect(updated.title).toBe('B');
      expect(updated.content).toBe('# corpo');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
         new Date(doc.updatedAt).getTime()
      );
   });

   it('getDocPage retorna null para id inexistente e update lança 404', async () => {
      const { db } = await setup();
      expect(await getDocPage(db, 'nao-existe')).toBeNull();
      await expect(updateDocPage(db, 'nao-existe', { title: 'X' })).rejects.toThrow(
         /não encontrado/i
      );
   });
});
