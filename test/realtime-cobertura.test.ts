import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, type CircleEvent } from '@/lib/api/events';
import { createStatus, updateStatus, deleteStatus } from '@/lib/api/statuses';
import { createTemplate, updateTemplate, deleteTemplate } from '@/lib/api/templates';
import { updateProfile } from '@/lib/api/users';

/**
 * COBERTURA DE TEMPO REAL.
 *
 * Uma escrita que não publica evento é um lugar onde o app volta a exigir "aperta F5":
 * o outro usuário segue vendo o estado velho. A auditoria de 08/09 encontrou quatro
 * famílias assim — status (que são as COLUNAS DO BOARD), templates, SLA e perfil.
 *
 * Estes testes são a trava: se alguém adicionar escrita sem publicar, ou remover o
 * publish existente, a suíte acusa.
 */
const EMAIL = 'pessoa@nimbloo.ai';
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Pessoa', email: EMAIL, teamIds: ['CORE'] });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
   vi.restoreAllMocks();
});

const doTipo = (entity: string) => eventos.filter((e) => e.entity === entity).map((e) => e.action);

describe('escritas que precisam chegar em tempo real', () => {
   it('status publica em criar, editar e excluir (são as colunas do board)', async () => {
      const criado = await createStatus(db, {
         name: 'Em revisão',
         color: '#bd93f9',
         category: 'started',
      });
      await updateStatus(db, criado.id, { name: 'Em revisão técnica' });
      await deleteStatus(db, criado.id);

      expect(doTipo('catalog')).toEqual(['created', 'updated', 'deleted']);
   });

   it('template publica em criar, editar e excluir', async () => {
      const criado = await createTemplate(db, { teamId: 'CORE', name: 'Bug' });
      await updateTemplate(db, criado.id, { name: 'Bug crítico' });
      await deleteTemplate(db, criado.id);

      expect(doTipo('catalog')).toEqual(['created', 'updated', 'deleted']);
   });

   it('mudar o próprio perfil avisa os outros (nome e avatar aparecem em autoria)', async () => {
      await updateProfile(db, EMAIL, { name: 'Pessoa Renomeada' });

      const membro = eventos.filter((e) => e.entity === 'member');
      expect(membro.map((e) => e.action)).toEqual(['updated']);
      expect(membro[0].actorEmail).toBe(EMAIL);
   });

   it('patch sem mudança de fato não gera evento (não acorda cliente à toa)', async () => {
      await updateProfile(db, EMAIL, {});
      expect(doTipo('member')).toEqual([]);
   });
});
