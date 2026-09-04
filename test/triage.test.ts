import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import {
   activityEvent,
   issue as issueT,
   issueLabel,
   issueRelation,
   issueTriageSuggestion,
} from '@/db/schema';
import { createIssue, deleteIssue, getIssue, updateIssue } from '@/lib/api/issues';

// O Bedrock é o único ponto de IA: mockado, cada caso decide se responde JSON válido,
// lixo, ou explode (que é o comportamento REAL em produção — modelo bloqueado).
const agentMocks = vi.hoisted(() => ({ invokeText: vi.fn() }));
vi.mock('@/lib/api/agent', () => ({
   invokeText: agentMocks.invokeText,
   MODEL_ID: 'test-model',
   embedTexts: vi.fn(),
   EMBED_MODEL_ID: 'test-embed',
}));

import {
   acceptTriageSuggestion,
   dismissTriageSuggestion,
   ensureTriageSuggestion,
   generateTriageSuggestion,
   getTriageSuggestion,
   heuristicDuplicates,
   jaccard,
   listTeamTriageSuggestions,
   parseTriageResponse,
   titleTokens,
} from '@/lib/api/triage';

const ANA = 'ana@nimbloo.ai';

/** Bedrock indisponível — o estado de produção (`ResourceNotFoundException`). */
function bedrockDown() {
   agentMocks.invokeText.mockRejectedValue(
      new Error('ResourceNotFoundException: Model use case details have not been submitted')
   );
}

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedTeam(db, 'DESIGN', 'Design');
   await seedUser(db, { name: 'Ana', email: ANA, role: 'Admin', teamIds: ['CORE'] });
   return db;
}

type Db = Awaited<ReturnType<typeof setup>>;

/** Cria uma issue já na fila de Triage. */
async function newTriageIssue(db: Db, title: string, description?: string) {
   return createIssue(
      db,
      { teamId: 'CORE', title, statusId: 'triage', priorityId: 'no-priority', description },
      ANA
   );
}

beforeEach(() => {
   agentMocks.invokeText.mockReset();
});

describe('similaridade de títulos (fallback sem IA)', () => {
   it('ignora acento, caixa e pontuação e descarta tokens de 1 caractere', () => {
      expect([...titleTokens('Botão de Login não funciona!')]).toEqual([
         'botao',
         'de',
         'login',
         'nao',
         'funciona',
      ]);
   });

   it('Jaccard é 1 para títulos iguais e 0 quando não há tokens', () => {
      expect(jaccard(titleTokens('login quebrado'), titleTokens('Login Quebrado'))).toBe(1);
      expect(jaccard(titleTokens('...'), titleTokens('login'))).toBe(0);
   });

   it('só propõe duplicata acima do limiar de 0,5', () => {
      const candidates = [
         { id: 'a', identifier: 'CORE-1', title: 'Login quebrado no Safari' },
         { id: 'b', identifier: 'CORE-2', title: 'Exportar CSV do roadmap' },
      ];
      const dups = heuristicDuplicates('Login quebrado no safari', candidates);
      expect(dups).toHaveLength(1);
      expect(dups[0].issueId).toBe('a');
      expect(dups[0].reason).toContain('CORE-1');
   });
});

describe('parse da resposta do modelo', () => {
   const catalog = {
      teams: [{ id: 'CORE', name: 'Core' }],
      priorities: [{ id: 'high', name: 'High' }],
      labels: [{ id: 'bug', name: 'Bug' }],
   };
   const candidates = [{ id: 'i1', identifier: 'CORE-1', title: 'Login' }];

   it('aceita JSON com prosa/fences em volta e ancora os ids no catálogo real', () => {
      const text = `Claro!\n\`\`\`json\n{"teamId":"CORE","priorityId":"high","labelIds":["bug","inventada"],"duplicates":[{"issueId":"i1","reason":"mesmo sintoma"},{"issueId":"fantasma","reason":"x"}],"summary":"Login falha"}\n\`\`\``;
      expect(parseTriageResponse(text, catalog, candidates)).toEqual({
         teamId: 'CORE',
         priorityId: 'high',
         labelIds: ['bug'],
         duplicates: [{ issueId: 'i1', reason: 'mesmo sintoma' }],
         summary: 'Login falha',
      });
   });

   it('lança quando não há JSON utilizável', () => {
      expect(() => parseTriageResponse('desculpe, não consegui', catalog, candidates)).toThrow();
      expect(() => parseTriageResponse('{"teamId":42}', catalog, candidates)).toThrow();
   });
});

describe('geração da sugestão', () => {
   it('usa a resposta do modelo quando ela é válida (source ai)', async () => {
      const db = await setup();
      const dup = await newTriageIssue(db, 'Login quebrado no Safari');
      const target = await newTriageIssue(db, 'Não consigo entrar pelo Safari');
      agentMocks.invokeText.mockResolvedValue(
         JSON.stringify({
            teamId: 'DESIGN',
            priorityId: 'high',
            labelIds: ['bug'],
            duplicates: [{ issueId: dup.id, reason: 'mesmo login no Safari' }],
            summary: 'Usuário não consegue autenticar no Safari.',
         })
      );

      const s = await generateTriageSuggestion(db, target.id, { force: true });
      expect(s).toMatchObject({
         source: 'ai',
         teamId: 'DESIGN',
         priorityId: 'high',
         labelIds: ['bug'],
         summary: 'Usuário não consegue autenticar no Safari.',
      });
      // A duplicata volta resolvida (link + motivo) para a UI.
      expect(s!.duplicates).toEqual([
         {
            issueId: dup.id,
            identifier: dup.identifier,
            title: dup.title,
            reason: 'mesmo login no Safari',
         },
      ]);
   });

   it('cai no heurístico quando o modelo devolve JSON inválido', async () => {
      const db = await setup();
      const dup = await newTriageIssue(db, 'Login quebrado no Safari');
      const target = await newTriageIssue(db, 'Login quebrado no safari');
      agentMocks.invokeText.mockResolvedValue('não sei responder em JSON');

      const s = await generateTriageSuggestion(db, target.id, { force: true });
      expect(s!.source).toBe('heuristic');
      expect(s!.teamId).toBeNull();
      expect(s!.priorityId).toBeNull();
      expect(s!.labelIds).toEqual([]);
      expect(s!.duplicates.map((d) => d.issueId)).toEqual([dup.id]);
   });

   it('cai no heurístico quando o Bedrock está bloqueado (produção)', async () => {
      const db = await setup();
      const dup = await newTriageIssue(db, 'Exportar relatório em CSV');
      const target = await newTriageIssue(db, 'Exportar relatorio em csv');
      bedrockDown();

      const s = await generateTriageSuggestion(db, target.id, { force: true });
      expect(s!.source).toBe('heuristic');
      expect(s!.duplicates.map((d) => d.issueId)).toEqual([dup.id]);
      // Sem par parecido, o heurístico devolve sugestão vazia (a UI não mostra nada).
      const solo = await newTriageIssue(db, 'Migrar o pipeline para ARM');
      const empty = await generateTriageSuggestion(db, solo.id, { force: true });
      expect(empty!.duplicates).toEqual([]);
   });

   it('não compara com issues de outro time nem consigo mesma', async () => {
      const db = await setup();
      await createIssue(
         db,
         {
            teamId: 'DESIGN',
            title: 'Login quebrado no Safari',
            statusId: 'triage',
            priorityId: 'no-priority',
         },
         ANA
      );
      const target = await newTriageIssue(db, 'Login quebrado no Safari');
      bedrockDown();
      const s = await generateTriageSuggestion(db, target.id, { force: true });
      expect(s!.duplicates).toEqual([]);
   });

   it('geração lazy no GET: a 1ª leitura cria, a 2ª reusa', async () => {
      const db = await setup();
      const target = await newTriageIssue(db, 'Algo novo para triar');
      bedrockDown();
      // A geração fire-and-forget do create pode ainda não ter gravado — o GET garante.
      expect(await ensureTriageSuggestion(db, target.id)).toBeTruthy();
      const calls = agentMocks.invokeText.mock.calls.length;
      await ensureTriageSuggestion(db, target.id);
      expect(agentMocks.invokeText.mock.calls.length).toBe(calls);
   });

   it('fila do time gera as que faltam e ignora as adiadas', async () => {
      const db = await setup();
      const a = await newTriageIssue(db, 'Primeira da fila');
      const b = await newTriageIssue(db, 'Segunda da fila');
      await updateIssue(db, b.id, { snoozedUntil: '2099-01-01T00:00:00.000Z' }, ANA);
      // Fora da fila (não é triage) — não deve ganhar sugestão.
      const c = await createIssue(
         db,
         { teamId: 'CORE', title: 'Já triada', statusId: 'to-do', priorityId: 'no-priority' },
         ANA
      );
      bedrockDown();

      const list = await listTeamTriageSuggestions(db, 'CORE', { wait: true });
      const ids = list.map((s) => s.issueId);
      expect(ids).toContain(a.id);
      expect(ids).not.toContain(b.id);
      expect(ids).not.toContain(c.id);
   });
});

describe('accept', () => {
   it('aplica os quatro campos, relaciona duplicatas, registra activity e carimba applied_at', async () => {
      const db = await setup();
      const dup = await newTriageIssue(db, 'Login quebrado no Safari');
      const target = await newTriageIssue(db, 'Não consigo entrar pelo Safari');
      agentMocks.invokeText.mockResolvedValue(
         JSON.stringify({
            teamId: 'DESIGN',
            priorityId: 'high',
            labelIds: ['bug'],
            duplicates: [{ issueId: dup.id, reason: 'mesmo sintoma' }],
            summary: 'Autenticação no Safari',
         })
      );
      await generateTriageSuggestion(db, target.id, { force: true });

      const applied = await acceptTriageSuggestion(db, target.id, ANA);
      expect(applied.appliedAt).toBeTruthy();

      const after = (await getIssue(db, target.id))!;
      expect(after.teamId).toBe('DESIGN');
      // Numeração é por time: mover troca o identifier.
      expect(after.identifier.startsWith('DESIGN-')).toBe(true);
      expect(after.priority.id).toBe('high');
      expect(after.status.category).toBe('unstarted');
      expect(after.labels.map((l) => l.id)).toEqual(['bug']);

      const rel = await db
         .select()
         .from(issueRelation)
         .where(and(eq(issueRelation.issueId, target.id), eq(issueRelation.kind, 'related')));
      expect(rel.map((r) => r.relatedId)).toEqual([dup.id]);

      const acts = await db
         .select()
         .from(activityEvent)
         .where(and(eq(activityEvent.issueId, target.id), eq(activityEvent.event, 'triage')));
      expect(acts).toHaveLength(1);
      expect(acts[0].text).toContain('triaged with suggestion');

      // Aplicar de novo é 409 (a sugestão já foi consumida).
      await expect(acceptTriageSuggestion(db, target.id, ANA)).rejects.toThrow(/já aplicada/);
   });

   it('respeita os overrides do Edit e mantém o time quando o usuário limpa a sugestão', async () => {
      const db = await setup();
      const target = await newTriageIssue(db, 'Ajustar o rodapé');
      agentMocks.invokeText.mockResolvedValue(
         JSON.stringify({
            teamId: 'DESIGN',
            priorityId: 'high',
            labelIds: ['bug'],
            duplicates: [],
            summary: '',
         })
      );
      await generateTriageSuggestion(db, target.id, { force: true });

      await acceptTriageSuggestion(db, target.id, ANA, {
         teamId: null,
         priorityId: 'low',
         labelIds: ['design'],
         duplicateIds: [],
      });
      const after = (await getIssue(db, target.id))!;
      expect(after.teamId).toBe('CORE');
      expect(after.identifier).toBe(target.identifier);
      expect(after.priority.id).toBe('low');
      expect(after.labels.map((l) => l.id)).toEqual(['design']);
   });

   it('recusa label inexistente sem tocar na issue', async () => {
      const db = await setup();
      const target = await newTriageIssue(db, 'Coisa qualquer');
      bedrockDown();
      await ensureTriageSuggestion(db, target.id);

      await expect(
         acceptTriageSuggestion(db, target.id, ANA, { labelIds: ['nao-existe'] })
      ).rejects.toThrow(/não existe/);
      const after = (await getIssue(db, target.id))!;
      expect(after.status.category).toBe('triage');
      expect(await db.select().from(issueLabel).where(eq(issueLabel.issueId, target.id))).toEqual(
         []
      );
   });
});

describe('dismiss e ciclo de vida', () => {
   it('descarta a sugestão sem tirar a issue da fila', async () => {
      const db = await setup();
      const target = await newTriageIssue(db, 'Uma issue para descartar');
      bedrockDown();
      await ensureTriageSuggestion(db, target.id);

      const dismissed = await dismissTriageSuggestion(db, target.id);
      expect(dismissed.dismissedAt).toBeTruthy();
      expect(dismissed.appliedAt).toBeNull();
      expect((await getIssue(db, target.id))!.status.category).toBe('triage');
      // Idempotente: um segundo dismiss devolve o mesmo carimbo.
      expect((await dismissTriageSuggestion(db, target.id)).dismissedAt).toBe(
         dismissed.dismissedAt
      );
   });

   it('gera ao ENTRAR na fila por mudança de status', async () => {
      const db = await setup();
      bedrockDown();
      const moved = await createIssue(
         db,
         { teamId: 'CORE', title: 'Nasceu fora da triagem', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      expect(await getTriageSuggestion(db, moved.id)).toBeNull();
      await updateIssue(db, moved.id, { statusId: 'triage' }, ANA);
      expect(await ensureTriageSuggestion(db, moved.id)).toBeTruthy();
   });

   it('apagar a issue leva a sugestão junto (FK)', async () => {
      const db = await setup();
      const target = await newTriageIssue(db, 'Vai sumir');
      bedrockDown();
      await ensureTriageSuggestion(db, target.id);
      expect(await deleteIssue(db, target.id)).toBe(true);
      expect(await db.select().from(issueTriageSuggestion)).toEqual([]);
      expect(await db.select().from(issueT).where(eq(issueT.id, target.id))).toEqual([]);
   });
});
