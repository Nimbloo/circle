import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createTeam } from '@/lib/api/teams';
import { createView, updateView, deleteView } from '@/lib/api/views';

let db: Db;
let eventos: CircleEvent[];
let parar: () => void;
let anaId: string;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   anaId = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Gus', email: 'gus@nimbloo.ai', teamIds: ['CORE'], role: 'Guest' });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
});

describe('convidado não cria time (Ad#21–40)', () => {
   it('Guest recebe 403 ao criar time; Member cria', async () => {
      await expect(
         createTeam(db, { id: 'GUEST', name: 'Do convidado' }, 'gus@nimbloo.ai')
      ).rejects.toMatchObject({ status: 403 });
      await expect(
         createTeam(db, { id: 'MEMB', name: 'Do membro' }, 'ana@nimbloo.ai')
      ).resolves.toMatchObject({ id: 'MEMB' });
   });
});

describe('evento de view pessoal só para o dono (Ad#21–40)', () => {
   it('criar/editar/apagar view pessoal publica com recipientId do dono', async () => {
      const v = await createView(
         db,
         { slug: 'minha', name: 'Minha', type: 'issue', filter: {} },
         'ana@nimbloo.ai'
      );
      await updateView(db, v.id, { name: 'Minha 2' }, 'ana@nimbloo.ai');
      await deleteView(db, v.id, 'ana@nimbloo.ai');
      const views = eventos.filter((e) => e.entity === 'view');
      expect(views.map((e) => e.recipientId)).toEqual([anaId, anaId, anaId]);
   });

   it('view de time publica com teamId (convidado de outro time não recebe)', async () => {
      await createView(
         db,
         { slug: 'time', name: 'Do time', type: 'issue', filter: {}, teamId: 'CORE' },
         'ana@nimbloo.ai'
      );
      const [ev] = eventos.filter((e) => e.entity === 'view');
      expect(ev.teamId).toBe('CORE');
      expect(ev.recipientId).toBeUndefined();
   });

   it('view compartilhada que vira pessoal avisa todos (os outros precisam removê-la)', async () => {
      const v = await createView(
         db,
         { slug: 't', name: 'T', type: 'issue', filter: {}, teamId: 'CORE' },
         'ana@nimbloo.ai'
      );
      eventos = [];
      await updateView(db, v.id, { teamId: null }, 'ana@nimbloo.ai');
      const [ev] = eventos.filter((e) => e.entity === 'view');
      expect(ev.recipientId).toBeUndefined();
      expect(ev.teamId).toBe('CORE');
   });
});
