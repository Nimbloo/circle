import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createView, listViews } from '@/lib/api/views';

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
});
