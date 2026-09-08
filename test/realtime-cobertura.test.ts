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

   it('webhook de PR publica review (a LISTA de reviews só carregava no mount)', async () => {
      const { handlePullRequestEvent } = await import('@/lib/api/reviews');
      await handlePullRequestEvent(db, {
         action: 'opened',
         repository: { full_name: 'Nimbloo/circle' },
         pull_request: {
            number: 7,
            title: 'feat: algo',
            state: 'open',
            draft: false,
            html_url: 'https://github.com/Nimbloo/circle/pull/7',
            user: { login: 'alguem' },
            head: { ref: 'branch', sha: 'abc' },
            base: { ref: 'develop' },
            created_at: '2026-09-08T10:00:00Z',
            updated_at: '2026-09-08T10:00:00Z',
         },
      } as never);

      const review = eventos.filter((e) => e.entity === 'review');
      expect(review.map((e) => e.action)).toEqual(['updated']);
      expect(review[0].id).toBe('Nimbloo/circle#7');
   });

   it('trocar e apagar a foto avisa os outros (avatar aparece na autoria alheia)', async () => {
      const { setAvatar, deleteAvatar } = await import('@/lib/api/avatar');
      const { getOrCreateUser } = await import('@/lib/api/users');
      const eu = await getOrCreateUser(db, EMAIL);
      // 1x1 PNG transparente.
      const png =
         'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      await setAvatar(db, eu.id, png, 'image/png');
      await deleteAvatar(db, eu.id);

      expect(doTipo('member')).toEqual(['updated', 'updated']);
   });

   it('template de PROJETO publica igual ao de issue (a varredura por rota não pegou)', async () => {
      const { createProjectTemplate, updateProjectTemplate, deleteProjectTemplate } = await import(
         '@/lib/api/project-templates'
      );
      const criado = await createProjectTemplate(db, { teamId: 'CORE', name: 'Discovery' });
      await updateProjectTemplate(db, criado.id, { name: 'Discovery v2' });
      await deleteProjectTemplate(db, criado.id);

      expect(doTipo('catalog')).toEqual(['created', 'updated', 'deleted']);
   });

   it('patch sem mudança de fato não gera evento (não acorda cliente à toa)', async () => {
      await updateProfile(db, EMAIL, {});
      expect(doTipo('member')).toEqual([]);
   });
});
