import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createView, updateView, listViews, getView } from '@/lib/api/views';
import { ApiError } from '@/lib/api/errors';

/**
 * Compartilhar view = atribuir um time a ela. O modelo já existia (`savedView.teamId`
 * nulo = pessoal, preenchido = visível ao time); faltava a AÇÃO — não havia como mudar
 * isso depois de criada.
 *
 * Como isto muda QUEM ENXERGA a view, os testes cobrem os dois sentidos e quem pode
 * fazer: compartilhar e voltar a pessoal.
 */

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   const ana = await seedUser(db, { name: 'Ana', email: ANA, teamIds: ['CORE'] });
   const bob = await seedUser(db, { name: 'Bob', email: BOB, teamIds: ['CORE'] });
   return { db, ana, bob };
}

describe('compartilhar view', () => {
   it('view pessoal so aparece para o dono ate ser compartilhada', async () => {
      const { db, ana, bob } = await setup();
      const view = await createView(
         db,
         { slug: 'minha', name: 'Minha', type: 'issue', filter: {} },
         ANA
      );

      expect((await listViews(db, undefined, ana)).map((v) => v.id)).toContain(view.id);
      expect((await listViews(db, undefined, bob)).map((v) => v.id)).not.toContain(view.id);
      expect(await getView(db, view.id, bob)).toBeNull();

      await updateView(db, view.id, { teamId: 'CORE' }, ANA);

      // Agora o Bob enxerga.
      expect((await listViews(db, undefined, bob)).map((v) => v.id)).toContain(view.id);
      expect(await getView(db, view.id, bob)).not.toBeNull();
   });

   it('voltar a pessoal tira a view da vista dos outros', async () => {
      const { db, bob } = await setup();
      const view = await createView(
         db,
         {
            slug: 'compartilhada',
            name: 'Compartilhada',
            type: 'issue',
            filter: {},
            teamId: 'CORE',
         },
         ANA
      );
      expect(await getView(db, view.id, bob)).not.toBeNull();

      await updateView(db, view.id, { teamId: null }, ANA);

      expect(await getView(db, view.id, bob)).toBeNull();
   });

   it('so o dono compartilha — outro usuario nao consegue', async () => {
      const { db, bob } = await setup();
      const view = await createView(
         db,
         { slug: 'minha', name: 'Minha', type: 'issue', filter: {} },
         ANA
      );

      // 403 explícito, não `null` silencioso — quem não é dono tem que saber por quê.
      await expect(updateView(db, view.id, { teamId: 'CORE' }, BOB)).rejects.toMatchObject({
         status: 403,
      });
      expect(await getView(db, view.id, bob)).toBeNull(); // segue pessoal
   });

   it('recusa time inexistente em vez de deixar a view orfa', async () => {
      const { db } = await setup();
      const view = await createView(
         db,
         { slug: 'minha', name: 'Minha', type: 'issue', filter: {} },
         ANA
      );

      await expect(updateView(db, view.id, { teamId: 'NOPE' }, ANA)).rejects.toBeInstanceOf(
         ApiError
      );
   });
});
