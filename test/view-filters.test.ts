import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createIssue } from '@/lib/api/issues';
import { createProject } from '@/lib/api/projects';
import { createView, resolveView } from '@/lib/api/views';
import { getOrCreateUser } from '@/lib/api/users';
import { filterIssuesForView } from '@/data/views';
import { adaptIssues } from '@/lib/adapters';
import { listIssues } from '@/lib/api/issues';
import type { View } from '@/data/views';

/**
 * Filtro de view por RESPONSÁVEL e por PROJETO.
 *
 * Antes a view só tinha os booleanos `unassigned`/`hasProject`, então as duas perguntas
 * mais comuns do dia a dia — "o que está com a Ana" e "o que é do Projeto X" — não
 * podiam ser salvas.
 *
 * O teste cobre também a PARIDADE servidor/cliente: a mesma view precisa devolver o
 * mesmo conjunto em `resolveView` (SQL) e em `filterIssuesForView` (memória). Esse par
 * já divergiu neste código antes — havia filtro aplicado só de um lado.
 */
const ANA = 'ana@nimbloo.ai';
const BENTO = 'bento@nimbloo.ai';

let db: Db;
let anaId = '';
let bentoId = '';
let projetoId = '';

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   anaId = await seedUser(db, { name: 'Ana', email: ANA, teamIds: ['CORE'] });
   bentoId = await seedUser(db, { name: 'Bento', email: BENTO, teamIds: ['CORE'] });

   projetoId = (
      await createProject(db, {
         name: 'Alpha',
         teamId: 'CORE',
         statusId: 'proj-in-progress',
         priorityId: 'no-priority',
         healthId: 'on-track',
      })
   ).id;

   const base = { teamId: 'CORE', priorityId: 'no-priority' as const };
   await createIssue(
      db,
      { ...base, title: 'da ana, no projeto', assigneeId: anaId, projectId: projetoId },
      ANA
   );
   await createIssue(db, { ...base, title: 'da ana, sem projeto', assigneeId: anaId }, ANA);
   await createIssue(
      db,
      { ...base, title: 'do bento, no projeto', assigneeId: bentoId, projectId: projetoId },
      ANA
   );
   await createIssue(db, { ...base, title: 'de ninguem' }, ANA);
});
afterEach(() => __setTestDb(null));

/** Roda a MESMA view pelos dois caminhos e devolve os títulos ordenados. */
async function pelosDoisCaminhos(filtro: Record<string, unknown>) {
   const view = await createView(
      db,
      {
         name: 'v',
         slug: `v-${Math.random().toString(36).slice(2, 8)}`,
         type: 'issue',
         filter: filtro as never,
      },
      ANA
   );
   const me = await getOrCreateUser(db, ANA);

   const servidor = await resolveView(db, view.id, me.id);
   const todas = adaptIssues(await listIssues(db, {}));
   const cliente = filterIssuesForView({ ...view, filter: filtro } as unknown as View, todas);

   return {
      servidor: (servidor?.issues ?? []).map((i) => i.title).sort(),
      cliente: cliente.map((i) => i.title).sort(),
   };
}

describe('filtro de view por responsável e projeto', () => {
   it('responsável específico traz só as dele, no servidor e no cliente', async () => {
      const { servidor, cliente } = await pelosDoisCaminhos({ assigneeIds: [anaId] });
      expect(servidor).toEqual(['da ana, no projeto', 'da ana, sem projeto']);
      expect(cliente).toEqual(servidor);
   });

   it('projeto específico traz só as dele, no servidor e no cliente', async () => {
      const { servidor, cliente } = await pelosDoisCaminhos({ projectIds: [projetoId] });
      expect(servidor).toEqual(['da ana, no projeto', 'do bento, no projeto']);
      expect(cliente).toEqual(servidor);
   });

   it('responsável + projeto se cruzam (E, não OU)', async () => {
      const { servidor, cliente } = await pelosDoisCaminhos({
         assigneeIds: [anaId],
         projectIds: [projetoId],
      });
      expect(servidor).toEqual(['da ana, no projeto']);
      expect(cliente).toEqual(servidor);
   });

   it('unassigned + responsável somam como OU (padrão do Linear)', async () => {
      const { servidor, cliente } = await pelosDoisCaminhos({
         unassigned: true,
         assigneeIds: [bentoId],
      });
      expect(servidor).toEqual(['de ninguem', 'do bento, no projeto']);
      expect(cliente).toEqual(servidor);
   });

   it('dois responsáveis trazem a união dos dois', async () => {
      const { servidor, cliente } = await pelosDoisCaminhos({ assigneeIds: [anaId, bentoId] });
      expect(servidor).toHaveLength(3);
      expect(cliente).toEqual(servidor);
   });

   it('view antiga, sem os campos novos, continua valendo', async () => {
      const { servidor, cliente } = await pelosDoisCaminhos({ unassigned: true });
      expect(servidor).toEqual(['de ninguem']);
      expect(cliente).toEqual(servidor);
   });
});
