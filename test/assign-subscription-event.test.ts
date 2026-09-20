import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createIssue, updateIssue } from '@/lib/api/issues';

/**
 * #22 — atribuir assina o responsável (Linear-style), mas a aba DELE não sabia: o
 * `me.subscribedIssueIds` ficava velho até recarregar. Agora cada nova assinatura
 * automática publica o evento endereçado (`recipientId` + `issueId`) depois do commit.
 */
const ANA = 'ana@nimbloo.ai';
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;
let bobId = '';
let carlId = '';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA, teamIds: ['CORE'] });
   bobId = await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai', teamIds: ['CORE'] });
   carlId = await seedUser(db, { name: 'Carl', email: 'carl@nimbloo.ai', teamIds: ['CORE'] });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
});

const own = (uid: string, issueId: string) =>
   eventos.filter((e) => e.entity === 'member' && e.recipientId === uid && e.issueId === issueId);

describe('auto-assinatura avisa o responsável (#22)', () => {
   it('criar com responsável e atribuir depois publicam o evento endereçado', async () => {
      const issue = await createIssue(
         db,
         {
            teamId: 'CORE',
            title: 'X',
            statusId: 'to-do',
            priorityId: 'low',
            assigneeIds: [bobId],
         },
         ANA
      );
      expect(own(bobId, issue.id)).toHaveLength(1);

      eventos = [];
      await updateIssue(db, issue.id, { assigneeIds: [bobId, carlId] }, ANA);
      expect(own(carlId, issue.id)).toHaveLength(1);
      // Bob já assinava: nada novo para ele.
      expect(own(bobId, issue.id)).toHaveLength(0);
   });

   it('silent (import) não publica por linha', async () => {
      await createIssue(
         db,
         { teamId: 'CORE', title: 'Y', statusId: 'to-do', priorityId: 'low', assigneeIds: [bobId] },
         ANA,
         { silent: true }
      );
      expect(eventos.filter((e) => e.entity === 'member')).toHaveLength(0);
   });
});
