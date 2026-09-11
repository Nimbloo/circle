import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { __setTestDb, type Db } from '@/db';
import { createIssue, listIssues, updateIssue } from '@/lib/api/issues';
import { bootstrapWorkspace } from '@/lib/api/workspace';
import { search } from '@/lib/api/search';
import { adaptIssues } from '@/lib/adapters';

/**
 * SONDAS DE BORDA — auditoria de sanidade.
 *
 * Cada caso aqui é uma situação que o uso normal não produz, mas que o dado real
 * produz: workspace recém-criado, convidado sem time, lista exatamente do tamanho
 * da página, texto com acento, issue sem nenhuma relação preenchida.
 *
 * Não são testes de feature — são perguntas: "isso quebra?". O valor está tanto em
 * achar um defeito quanto em provar que não há um.
 */
const DONO = 'dono@nimbloo.ai';

let db: Db;

beforeEach(async () => {
   db = await makeTestDb();
   __setTestDb(db);
});
afterEach(() => __setTestDb(null));

describe('sondas de borda', () => {
   it('workspace vazio (sem time e sem issue) não quebra o bootstrap', async () => {
      await seedUser(db, { name: 'Dono', email: DONO });
      const ws = await bootstrapWorkspace(db, DONO);
      expect(ws).toBeTruthy();
      expect(Array.isArray(ws.teams)).toBe(true);
      expect(ws.teams).toHaveLength(0);
   });

   it('listar issues num workspace vazio devolve lista vazia, não erro', async () => {
      await seedUser(db, { name: 'Dono', email: DONO });
      await expect(listIssues(db, {})).resolves.toEqual([]);
   });

   it('adaptar uma lista vazia devolve lista vazia', () => {
      expect(adaptIssues([])).toEqual([]);
   });

   it('busca com string vazia não varre o banco', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      const r = await search(db, { q: '   ' });
      expect(r.groups).toEqual([]);
   });

   it('convidado SEM time não enxerga nada na busca (escopo vazio ≠ sem escopo)', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      await createIssue(
         db,
         { teamId: 'CORE', title: 'segredo do core', priorityId: 'no-priority' },
         DONO
      );

      // `teamIds: []` = convidado sem time. Se a busca tratar lista vazia como
      // "sem restrição", ela vaza o workspace inteiro — foi um bug real do projeto.
      const r = await search(db, { q: 'segredo', teamIds: [] });
      const achados = r.groups.flatMap((g) => g.items ?? []);
      expect(achados).toHaveLength(0);
   });

   it('busca casa com e sem acento', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      await createIssue(
         db,
         { teamId: 'CORE', title: 'Manutenção de máquina', priorityId: 'no-priority' },
         DONO
      );

      const comAcento = await search(db, { q: 'manutenção' });
      const semAcento = await search(db, { q: 'manutencao' });
      const conta = (r: Awaited<ReturnType<typeof search>>) =>
         r.groups.flatMap((g) => g.items ?? []).length;
      expect(conta(comAcento)).toBeGreaterThan(0);
      expect(conta(semAcento)).toBe(conta(comAcento));
   });

   it('issue sem responsável, projeto ou ciclo sobrevive ao adapter', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      await createIssue(db, { teamId: 'CORE', title: 'pelada', priorityId: 'no-priority' }, DONO);

      const dtos = await listIssues(db, {});
      expect(dtos).toHaveLength(1);
      const [issue] = adaptIssues(dtos);
      expect(issue.title).toBe('pelada');
      expect(issue.assignee).toBeNull();
   });

   it('paginação na fronteira exata não duplica nem perde issue', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      const TOTAL = 5;
      for (let i = 0; i < TOTAL; i++) {
         await createIssue(
            db,
            { teamId: 'CORE', title: `issue ${i}`, priorityId: 'no-priority' },
            DONO
         );
      }

      // Página do tamanho EXATO do total: o cliente só para quando a página vem
      // menor que o limite, então precisa existir uma segunda página vazia.
      const p1 = await listIssues(db, { limit: TOTAL });
      expect(p1).toHaveLength(TOTAL);
      const p2 = await listIssues(db, { limit: TOTAL, cursor: p1[p1.length - 1].rank });
      expect(p2).toHaveLength(0);

      const ids = new Set([...p1, ...p2].map((i) => i.id));
      expect(ids.size).toBe(TOTAL);
   });

   it('sub-issue não pode virar pai do próprio pai (ciclo)', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      const pai = await createIssue(
         db,
         { teamId: 'CORE', title: 'pai', priorityId: 'no-priority' },
         DONO
      );
      const filha = await createIssue(
         db,
         { teamId: 'CORE', title: 'filha', priorityId: 'no-priority', parentId: pai.id },
         DONO
      );

      // Fechar o ciclo: o pai passa a ser filho da própria filha.
      await expect(updateIssue(db, pai.id, { parentId: filha.id }, DONO)).rejects.toThrow();
   });

   it('issue não pode ser pai de si mesma', async () => {
      await seedTeam(db, 'CORE', 'Core');
      await seedUser(db, { name: 'Dono', email: DONO, teamIds: ['CORE'] });
      const issue = await createIssue(
         db,
         { teamId: 'CORE', title: 'sozinha', priorityId: 'no-priority' },
         DONO
      );
      await expect(updateIssue(db, issue.id, { parentId: issue.id }, DONO)).rejects.toThrow();
   });
});
