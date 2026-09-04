import { describe, it, expect, beforeEach } from 'vitest';
import type { Db } from '@/db';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import {
   documentFolder,
   initiative,
   issue,
   issueContent,
   project,
   teamDocument,
} from '@/db/schema';
import {
   ACCENTED,
   UNACCENTED,
   search,
   unaccent,
   type SearchEntityType,
   type SearchGroup,
} from '@/lib/api/search';
import { readFileSync } from 'node:fs';

/**
 * Busca insensível a acento (auditoria v0.29.0). O índice era
 * `to_tsvector('simple', …)` sem normalização, a consulta idem e o fallback `ILIKE`
 * também: "producao" não achava "produção" NEM o contrário. `unaccent`/`pg_trgm` não
 * existem no RDS compartilhado — a normalização é por `translate` (migration 0047).
 */

let db: Db;
let ownerId: string;

function idsOf(groups: SearchGroup[], type: SearchEntityType): string[] {
   return (groups.find((g) => g.type === type)?.items ?? []).map((i) => i.id);
}

async function addIssue(id: string, identifier: string, title: string, description?: string) {
   const now = new Date('2026-01-01T00:00:00Z');
   await db.insert(issue).values({
      id,
      identifier,
      teamId: 'CORE',
      title,
      statusId: 'in-progress',
      priorityId: 'high',
      createdById: ownerId,
      rank: id,
      createdAt: now,
      updatedAt: now,
   });
   if (description) await db.insert(issueContent).values({ issueId: id, description });
}

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   ownerId = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
});

describe('tabela de normalização — índice e código em sincronia', () => {
   it('as duas metades têm o mesmo tamanho (exigência do translate)', () => {
      expect(ACCENTED.length).toBe(UNACCENTED.length);
   });

   it('a migration usa exatamente a mesma tabela do código', () => {
      const sql = readFileSync('db/migrations/0047_search_unaccent.sql', 'utf8');
      const pairs = [...sql.matchAll(/translate\(.+?, '([^']+)', '([^']+)'\)/g)];
      expect(pairs.length).toBeGreaterThan(0);
      for (const [, accented, unaccented] of pairs) {
         expect(accented).toBe(ACCENTED);
         expect(unaccented).toBe(UNACCENTED);
      }
   });

   it('unaccent preserva o comprimento (o snippet mapeia posição → texto original)', () => {
      const s = 'Relatório de manutenção — ação';
      expect(unaccent(s)).toHaveLength(s.length);
      expect(unaccent(s)).toBe('Relatorio de manutencao — acao');
   });
});

describe('busca — acento nas duas direções', () => {
   it('sem acento na consulta acha o termo acentuado (índice)', async () => {
      await addIssue('i-1', 'CORE-1', 'Deploy em produção travado');
      const res = await search(db, { q: 'producao' });
      expect(idsOf(res.groups, 'issue')).toEqual(['i-1']);
      expect(res.fallback).toBe(false);
   });

   it('com acento na consulta acha o termo sem acento', async () => {
      await addIssue('i-1', 'CORE-1', 'Deploy em producao travado');
      const res = await search(db, { q: 'produção' });
      expect(idsOf(res.groups, 'issue')).toEqual(['i-1']);
      expect(res.fallback).toBe(false);
   });

   it('normaliza também a descrição da issue', async () => {
      await addIssue('i-1', 'CORE-1', 'Título neutro', 'a manutenção do índice ficou lenta');
      const res = await search(db, { q: 'manutencao' });
      expect(idsOf(res.groups, 'issue')).toEqual(['i-1']);
   });

   it('vale para projeto, initiative e documento', async () => {
      await db.insert(project).values({
         id: 'p-1',
         name: 'Migração do índice',
         statusId: 'proj-in-progress',
         percentComplete: 0,
         priorityId: 'high',
         healthId: 'on-track',
         teamId: 'CORE',
      });
      await db.insert(initiative).values({
         id: 'n-1',
         slug: 'obs',
         name: 'Observabilidade e automações',
         status: 'active',
         priorityId: 'high',
         healthId: 'on-track',
      });
      await db.insert(documentFolder).values({ id: 'f-1', teamId: 'CORE', name: 'Docs' });
      await db.insert(teamDocument).values({
         id: 'd-1',
         folderId: 'f-1',
         name: 'Padrões de operação',
         creatorId: ownerId,
      });

      expect(idsOf((await search(db, { q: 'migracao' })).groups, 'project')).toEqual(['p-1']);
      expect(idsOf((await search(db, { q: 'automacoes' })).groups, 'initiative')).toEqual(['n-1']);
      expect(idsOf((await search(db, { q: 'padroes' })).groups, 'document')).toEqual(['d-1']);
   });

   it('o fallback ILIKE (trecho no MEIO da palavra) também ignora acento', async () => {
      await addIssue('i-1', 'CORE-1', 'Relatório de incidentes');
      // "latorio" não é prefixo de token nenhum → o tsquery não casa e cai no ILIKE.
      const res = await search(db, { q: 'latorio' });
      expect(res.fallback).toBe(true);
      expect(idsOf(res.groups, 'issue')).toEqual(['i-1']);
   });

   it('no fallback a direção contrária também vale (consulta acentuada, conteúdo sem acento)', async () => {
      await addIssue('i-1', 'CORE-1', 'Relatorio de incidentes');
      const res = await search(db, { q: 'latório' });
      expect(res.fallback).toBe(true);
      expect(idsOf(res.groups, 'issue')).toEqual(['i-1']);
   });
});
