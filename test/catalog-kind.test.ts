import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/api/s3-assets', () => ({
   assetsConfigured: () => true,
   putAsset: vi.fn(async (key: string) => `https://cdn.test/${key}`),
   deleteAsset: vi.fn(async () => undefined),
}));

import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { subscribe, eventForViewer, type CircleEvent } from '@/lib/api/events';

/**
 * #53: o evento `catalog` diz O QUE mudou (`kind`). Só status vive no bootstrap; template,
 * SLA e emoji não — o cliente usa o `kind` para não refazer o bootstrap à toa.
 */
let db: Db;
let eventos: CircleEvent[];
let parar: () => void;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
   await seedTeam(db, 'CORE', 'Core');
   await seedUser(db, { name: 'Pessoa', email: 'p@nimbloo.ai', teamIds: ['CORE'] });
   eventos = [];
   parar = subscribe((e) => eventos.push(e));
});
afterEach(() => {
   parar();
   __setTestDb(null);
});

const catalogo = () =>
   eventos
      .filter((e) => e.entity === 'catalog')
      .map((e) => ({ kind: e.kind, teamId: e.teamId }));

describe('evento catalog com kind (#53)', () => {
   it('status segue sem kind: evento sem kind = dado do bootstrap (compatível)', async () => {
      const { createStatus } = await import('@/lib/api/statuses');
      await createStatus(db, { name: 'Revisão', color: '#bd93f9', category: 'started' });
      expect(catalogo()).toEqual([{ kind: undefined, teamId: undefined }]);
   });

   it('template de issue e de projeto → kind próprio e teamId', async () => {
      const { createTemplate, updateTemplate, deleteTemplate } = await import(
         '@/lib/api/templates'
      );
      const { createProjectTemplate } = await import('@/lib/api/project-templates');
      const t = await createTemplate(db, { teamId: 'CORE', name: 'Bug' });
      await updateTemplate(db, t.id, { name: 'Bug 2' });
      await deleteTemplate(db, t.id);
      await createProjectTemplate(db, { teamId: 'CORE', name: 'Launch' });
      expect(catalogo()).toEqual([
         { kind: 'template', teamId: 'CORE' },
         { kind: 'template', teamId: 'CORE' },
         { kind: 'template', teamId: 'CORE' },
         { kind: 'project_template', teamId: 'CORE' },
      ]);
   });

   it('SLA → kind sla com teamId', async () => {
      const { setTeamSla } = await import('@/lib/api/slas');
      const { priority } = await import('@/db/schema');
      const [p] = await db.select().from(priority).limit(1);
      await setTeamSla(db, 'CORE', p.id, 24);
      expect(catalogo()).toEqual([{ kind: 'sla', teamId: 'CORE' }]);
   });

   it('emoji → kind emoji', async () => {
      const { createEmoji } = await import('@/lib/api/emojis');
      await createEmoji(db, {
         shortcode: 'ok',
         dataUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
         contentType: 'image/png',
      });
      expect(catalogo()).toEqual([{ kind: 'emoji', teamId: undefined }]);
   });

   it('a versão redigida (convidado) preserva o kind, que não é sensível', () => {
      const ev: CircleEvent = { entity: 'catalog', action: 'updated', kind: 'emoji', id: 'x', ts: 1 };
      expect(eventForViewer(ev, { userId: 'u', teamIds: ['CORE'] })).toEqual({
         entity: 'catalog',
         action: 'updated',
         kind: 'emoji',
         ts: 1,
      });
   });
});
