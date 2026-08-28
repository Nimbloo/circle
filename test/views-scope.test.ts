import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createView, listViews, getView, resolveView } from '@/lib/api/views';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';

describe('views: escopo pessoal/compartilhada (#25 paridade Linear)', () => {
   it('viewer vê as compartilhadas + as suas pessoais, não as pessoais de outros', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const anaId = await seedUser(db, { name: 'Ana', email: ANA });
      const bobId = await seedUser(db, { name: 'Bob', email: BOB });

      // pessoal da Ana (sem teamId)
      await createView(
         db,
         { slug: 'ana-pessoal', name: 'Ana pessoal', type: 'issue', filter: {} },
         ANA
      );
      // pessoal do Bob
      await createView(
         db,
         { slug: 'bob-pessoal', name: 'Bob pessoal', type: 'issue', filter: {} },
         BOB
      );
      // compartilhada (com time)
      await createView(
         db,
         { slug: 'time', name: 'Time', type: 'issue', filter: {}, teamId: 'CORE' },
         ANA
      );

      const forBob = await listViews(db, undefined, bobId);
      const names = forBob.map((v) => v.name).sort();
      expect(names).toEqual(['Bob pessoal', 'Time']); // vê a sua + a compartilhada, NÃO a da Ana

      const forAna = await listViews(db, undefined, anaId);
      expect(forAna.map((v) => v.name).sort()).toEqual(['Ana pessoal', 'Time']);

      // sem viewerId → todas (uso interno)
      expect(await listViews(db)).toHaveLength(3);
   });

   it('getView/resolveView escondem a view pessoal de outro usuário (anti-IDOR)', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      const anaId = await seedUser(db, { name: 'Ana', email: ANA });
      const bobId = await seedUser(db, { name: 'Bob', email: BOB });

      const anaView = await createView(
         db,
         { slug: 'ana-secreta', name: 'Ana secreta', type: 'issue', filter: {} },
         ANA
      );
      const shared = await createView(
         db,
         { slug: 'time', name: 'Time', type: 'issue', filter: {}, teamId: 'CORE' },
         ANA
      );

      // Bob NÃO lê a view pessoal da Ana por id direto.
      expect(await getView(db, anaView.id, bobId)).toBeNull();
      expect(await resolveView(db, anaView.id, bobId)).toBeNull();
      // A dona lê a sua; qualquer um lê a compartilhada.
      expect(await getView(db, anaView.id, anaId)).not.toBeNull();
      expect(await getView(db, shared.id, bobId)).not.toBeNull();
   });
});
