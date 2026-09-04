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
   projectDetail,
   teamDocument,
} from '@/db/schema';
import {
   search,
   searchIssueIds,
   type SearchEntityType,
   type SearchGroup,
   type SearchItem,
} from '@/lib/api/search';

let db: Db;
let ownerId: string;

async function addIssue(
   id: string,
   identifier: string,
   title: string,
   description: string | null,
   opts: { teamId?: string; statusId?: string } = {}
) {
   const now = new Date('2026-01-01T00:00:00Z');
   await db.insert(issue).values({
      id,
      identifier,
      teamId: opts.teamId ?? 'CORE',
      title,
      statusId: opts.statusId ?? 'in-progress',
      priorityId: 'high',
      assigneeId: null,
      createdById: ownerId,
      projectId: null,
      cycleId: null,
      rank: id,
      createdAt: now,
      updatedAt: now,
   });
   if (description !== null) {
      await db.insert(issueContent).values({ issueId: id, description });
   }
}

function itemsOf(groups: SearchGroup[], type: SearchEntityType): SearchItem[] {
   return groups.find((g) => g.type === type)?.items ?? [];
}

beforeEach(async () => {
   db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'OPS', 'Operações');
   ownerId = await seedUser(db, { name: 'Ana', email: 'ana@nimbloo.ai', teamIds: ['CORE'] });
});

describe('search — ranking e casamento', () => {
   it('ranqueia título acima de descrição', async () => {
      await addIssue('i-desc', 'CORE-1', 'Ajuste de espaçamento', 'o fluxo de login trava aqui');
      await addIssue('i-title', 'CORE-2', 'Login trava no SSO', 'nada relevante no corpo');

      const res = await search(db, { q: 'login' });
      const ids = itemsOf(res.groups, 'issue').map((i) => i.id);
      expect(ids).toEqual(['i-title', 'i-desc']);
      expect(res.fallback).toBe(false);
   });

   it('casa termo parcial (prefixo) enquanto o usuário digita', async () => {
      await addIssue('i-1', 'CORE-1', 'Autenticação por SSO', null);
      const res = await search(db, { q: 'autent' });
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-1']);
      expect(res.fallback).toBe(false);
   });

   it('casa frase exata entre aspas e descarta o que só tem as palavras soltas', async () => {
      await addIssue('i-frase', 'CORE-1', 'Corrigir o login por SSO', null);
      await addIssue('i-solto', 'CORE-2', 'SSO instável e login lento', null);

      const res = await search(db, { q: '"login por SSO"' });
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-frase']);
   });

   it('casa o identificador da issue', async () => {
      await addIssue('i-1', 'CORE-42', 'Qualquer coisa', null);
      const res = await search(db, { q: 'CORE-42' });
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-1']);
   });

   it('agrupa por tipo: issue, project, initiative e document', async () => {
      await addIssue('i-1', 'CORE-1', 'Relatório mensal', null);
      await db.insert(project).values({
         id: 'p-1',
         name: 'Relatório executivo',
         statusId: 'proj-in-progress',
         percentComplete: 0,
         priorityId: 'high',
         healthId: 'on-track',
         teamId: 'CORE',
      });
      await db.insert(initiative).values({
         id: 'n-1',
         slug: 'rel',
         name: 'Relatórios',
         status: 'active',
         priorityId: 'high',
         healthId: 'on-track',
      });
      await db.insert(documentFolder).values({ id: 'f-1', teamId: 'CORE', name: 'Docs' });
      await db.insert(teamDocument).values({
         id: 'd-1',
         folderId: 'f-1',
         name: 'Relatório de incidentes',
         creatorId: ownerId,
      });

      const res = await search(db, { q: 'relatório' });
      expect(res.groups.map((g) => g.type)).toEqual(['issue', 'project', 'initiative', 'document']);
      expect(itemsOf(res.groups, 'document').map((i) => i.id)).toEqual(['d-1']);
   });

   it('casa a descrição do projeto (project_detail) e devolve a url do overview', async () => {
      await db.insert(project).values({
         id: 'p-1',
         name: 'Núcleo',
         statusId: 'proj-in-progress',
         percentComplete: 0,
         priorityId: 'high',
         healthId: 'on-track',
         teamId: 'CORE',
      });
      await db
         .insert(projectDetail)
         .values({ projectId: 'p-1', summary: 'migração para telemetria aberta' });

      const res = await search(db, { q: 'telemetria', types: ['project'] });
      const items = itemsOf(res.groups, 'project');
      expect(items).toHaveLength(1);
      expect(items[0].url).toBe('/project/p-1/overview');
   });

   it('respeita o recorte de tipos', async () => {
      await addIssue('i-1', 'CORE-1', 'Relatório', null);
      await db.insert(initiative).values({
         id: 'n-1',
         slug: 'rel',
         name: 'Relatórios',
         status: 'active',
         priorityId: 'high',
         healthId: 'on-track',
      });
      const res = await search(db, { q: 'relatório', types: ['initiative'] });
      expect(res.groups.map((g) => g.type)).toEqual(['initiative']);
   });
});

describe('search — filtros', () => {
   it('filtra por time (e tira initiatives, que são de workspace)', async () => {
      await addIssue('i-core', 'CORE-1', 'Login travado', null, { teamId: 'CORE' });
      await addIssue('i-ops', 'OPS-1', 'Login travado', null, { teamId: 'OPS' });
      await db.insert(initiative).values({
         id: 'n-1',
         slug: 'login',
         name: 'Login unificado',
         status: 'active',
         priorityId: 'high',
         healthId: 'on-track',
      });

      const res = await search(db, { q: 'login', teamId: 'OPS' });
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-ops']);
      expect(res.groups.some((g) => g.type === 'initiative')).toBe(false);
   });

   it('filtra por status', async () => {
      await addIssue('i-prog', 'CORE-1', 'Login travado', null, { statusId: 'in-progress' });
      await addIssue('i-done', 'CORE-2', 'Login travado', null, { statusId: 'done' });

      const res = await search(db, { q: 'login', statusId: 'done' });
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-done']);
   });
});

describe('search — snippet', () => {
   it('destaca o termo com <mark> — e <mark> é a ÚNICA tag do snippet', async () => {
      await addIssue(
         'i-1',
         'CORE-1',
         'Erro no parser',
         'quebra ao encontrar <script>alert(1)</script> no telemetria do corpo'
      );
      const res = await search(db, { q: 'telemetria' });
      const snippet = itemsOf(res.groups, 'issue')[0].snippet as string;
      expect(snippet).toContain('<mark>telemetria</mark>');
      expect(snippet).not.toContain('<script>');
      // Invariante de segurança: removidas as <mark>, não sobra nenhum caractere de tag.
      expect(snippet.replaceAll('<mark>', '').replaceAll('</mark>', '')).not.toMatch(/[<>]/);
   });

   it('escapa < e > soltos do texto (o fallback ilike também)', async () => {
      await addIssue('i-1', 'CORE-1', 'Regra: a > b em telemetria', null);
      const fts = await search(db, { q: 'telemetria' });
      expect(itemsOf(fts.groups, 'issue')[0].snippet).toContain('&gt;');

      const like = await search(db, { q: '>' });
      expect(like.fallback).toBe(true);
      const snippet = itemsOf(like.groups, 'issue')[0].snippet as string;
      expect(snippet).toContain('&gt;');
      expect(snippet.replaceAll('<mark>', '').replaceAll('</mark>', '')).not.toMatch(/[<>]/);
   });
});

describe('search — fallback ilike', () => {
   it('entrada só com símbolos cai no ilike', async () => {
      await addIssue('i-1', 'CORE-1', 'Regra de negócio: a >= b', null);
      const res = await search(db, { q: '>=' });
      expect(res.fallback).toBe(true);
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-1']);
   });

   it('pedaço no MEIO da palavra (que o tsquery com prefixo não alcança) cai no ilike', async () => {
      await addIssue('i-1', 'CORE-1', 'Autenticação', null);
      const res = await search(db, { q: 'entica' });
      expect(res.fallback).toBe(true);
      expect(itemsOf(res.groups, 'issue').map((i) => i.id)).toEqual(['i-1']);
   });

   it('sem nenhum acerto devolve grupos vazios (sem estourar)', async () => {
      await addIssue('i-1', 'CORE-1', 'Autenticação', null);
      const res = await search(db, { q: 'inexistentexyz' });
      expect(res.groups).toEqual([]);
   });

   it('query vazia não consulta nada', async () => {
      const res = await search(db, { q: '   ' });
      expect(res).toEqual({ query: '', groups: [], fallback: false, semantic: false });
   });
});

describe('searchIssueIds', () => {
   it('devolve só ids de issue em ordem de relevância', async () => {
      await addIssue('i-desc', 'CORE-1', 'Outro assunto', 'menção a telemetria no corpo');
      await addIssue('i-title', 'CORE-2', 'Telemetria aberta', null);
      expect(await searchIssueIds(db, { q: 'telemetria' })).toEqual(['i-title', 'i-desc']);
   });
});
