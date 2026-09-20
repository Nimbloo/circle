import { describe, it, expect } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import type { Db } from '@/db';
import { getTeam } from '@/lib/api/teams';
import { getMember } from '@/lib/api/members';
import { createInvite, listInvites } from '@/lib/api/invites';

/**
 * Ad#25 — `getTeam`/`getMember` calculavam contagens e memberships de TODOS os times e
 * membros, e `listInvites` carregava todos os `app_user`, para usar um só. Toda leitura
 * dessas tabelas nestes caminhos precisa ser filtrada no SQL.
 */
function captureSql(db: Db): string[] {
   const client = (db as unknown as { $client: PGlite }).$client;
   const seen: string[] = [];
   for (const method of ['query', 'exec'] as const) {
      const original = client[method].bind(client) as (...a: unknown[]) => unknown;
      (client as unknown as Record<string, unknown>)[method] = (
         sql: string,
         ...rest: unknown[]
      ) => {
         seen.push(sql.toLowerCase());
         return original(sql, ...rest);
      };
   }
   return seen;
}

const TABLES = ['"team_member"', '"project"', '"app_user"'];
function unfiltered(sqls: string[]): string[] {
   return sqls.filter(
      (sql) => TABLES.some((t) => sql.includes(`from ${t}`)) && !sql.includes(' where ')
   );
}

async function seed(db: Db) {
   await seedTeam(db, 'CORE', 'Core');
   await seedTeam(db, 'OPS', 'Ops');
   const ana = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
   await seedUser(db, { name: 'Bia', email: 'bia@nimbloo.ai', teamIds: ['CORE', 'OPS'] });
   await seedUser(db, { name: 'Caio', email: 'caio@nimbloo.ai', teamIds: ['OPS'] });
   return ana;
}

describe('leituras de admin filtradas no SQL (Ad#25)', () => {
   it('getTeam conta só o time pedido', async () => {
      const db = await makeTestDb();
      const ana = await seed(db);
      const sqls = captureSql(db);
      const team = await getTeam(db, 'CORE', ana);
      expect(team).toMatchObject({ memberCount: 2, projectCount: 0, joined: true });
      expect(unfiltered(sqls)).toEqual([]);
   });

   it('getMember busca só as memberships do membro', async () => {
      const db = await makeTestDb();
      await seed(db);
      const bia = (await db.query.appUser.findFirst({
         where: (u, { eq }) => eq(u.email, 'bia@nimbloo.ai'),
      }))!.id;
      const sqls = captureSql(db);
      const member = await getMember(db, bia);
      expect([...(member?.teamIds ?? [])].sort()).toEqual(['CORE', 'OPS']);
      expect(unfiltered(sqls)).toEqual([]);
   });

   it('listInvites carrega só quem convidou', async () => {
      const db = await makeTestDb();
      await seed(db);
      await createInvite(db, 'novo@nimbloo.ai', 'ana@nimbloo.ai');
      const sqls = captureSql(db);
      const invites = await listInvites(db);
      expect(invites).toHaveLength(1);
      expect(invites[0].invitedBy?.email).toBe('ana@nimbloo.ai');
      expect(unfiltered(sqls)).toEqual([]);
   });
});
