import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam } from './helpers/fixtures';
import {
   verifySignature,
   signatureFrom,
   createCardFromSentry,
   linkCardFromSentry,
   teamOptions,
   cardUrl,
} from '@/lib/api/integrations/sentry';
import { getIssueByIdentifier } from '@/lib/api/issues';

const SECRET = 'test-sentry-client-secret';

function sign(body: string): string {
   return createHmac('sha256', SECRET).update(body, 'utf8').digest('hex');
}

describe('sentry integration', () => {
   beforeEach(() => {
      process.env.CIRCLE_SENTRY_CLIENT_SECRET = SECRET;
      process.env.CIRCLE_APP_URL = 'https://circle.nimbloo.ai';
      process.env.CIRCLE_WORKSPACE_SLUG = 'nimbloo';
      delete process.env.CIRCLE_SENTRY_DEFAULT_TEAM;
      process.env.CIRCLE_SENTRY_ACTOR_EMAIL = 'sentry@nimbloo.ai';
   });

   it('verifySignature: aceita HMAC válido, rejeita inválido e sem-secret', () => {
      const body = JSON.stringify({ fields: { title: 'x' } });
      expect(verifySignature(body, sign(body))).toBe(true);
      expect(verifySignature(body, 'deadbeef')).toBe(false);
      expect(verifySignature(body, null)).toBe(false);
      const saved = process.env.CIRCLE_SENTRY_CLIENT_SECRET;
      delete process.env.CIRCLE_SENTRY_CLIENT_SECRET;
      expect(verifySignature(body, sign(body))).toBe(false); // integração off
      process.env.CIRCLE_SENTRY_CLIENT_SECRET = saved;
   });

   it('signatureFrom: lê Sentry-App-Signature (UI components) E Sentry-Hook-Signature (webhooks)', () => {
      // UI components (issue-link create/link) mandam Sentry-App-Signature — foi o bug do 401.
      const appSig = new Headers({ 'sentry-app-signature': 'aaa' });
      expect(signatureFrom(appSig)).toBe('aaa');
      // Webhooks de evento mandam Sentry-Hook-Signature.
      const hookSig = new Headers({ 'sentry-hook-signature': 'bbb' });
      expect(signatureFrom(hookSig)).toBe('bbb');
      // App-Signature tem precedência quando ambos vierem; sem nenhum → null.
      const both = new Headers({ 'sentry-app-signature': 'aaa', 'sentry-hook-signature': 'bbb' });
      expect(signatureFrom(both)).toBe('aaa');
      expect(signatureFrom(new Headers())).toBeNull();
   });

   it('signatureFrom + verifySignature: assinatura via Sentry-App-Signature valida (fluxo real do create)', () => {
      const body = JSON.stringify({ fields: { title: 'x' }, issueId: 'e-1' });
      const headers = new Headers({ 'sentry-app-signature': sign(body) });
      expect(verifySignature(body, signatureFrom(headers))).toBe(true);
   });

   it('createCardFromSentry: cria card com label sentry, status triage, priority high', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');

      const res = await createCardFromSentry(db, {
         title: 'TypeError: cannot read x of undefined',
         description: 'Stacktrace resumida',
         teamId: 'CORE',
         sentryWebUrl: 'https://nimbloo.sentry.io/issues/123/',
      });

      expect(res.identifier).toBe('CORE-1');
      expect(res.project).toBe('Core');
      expect(res.webUrl).toBe('https://circle.nimbloo.ai/nimbloo/issue/CORE-1');

      const issue = await getIssueByIdentifier(db, 'CORE-1');
      expect(issue).toBeTruthy();
      expect(issue!.title).toContain('TypeError');
      expect(issue!.status.id).toBe('triage');
      expect(issue!.priority.id).toBe('high');
      expect(issue!.labels.map((l) => l.id)).toContain('sentry');
   });

   it('createCardFromSentry: cai no time default quando o teamId não existe', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      const res = await createCardFromSentry(db, { title: 'erro', teamId: 'INEXISTENTE' });
      expect(res.identifier).toBe('CORE-1'); // resolveu pro único time existente
   });

   it('createCardFromSentry: title vazio → 400', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE');
      await expect(createCardFromSentry(db, { title: '   ' })).rejects.toMatchObject({
         status: 400,
      });
   });

   it('linkCardFromSentry: identifier existente → link; inexistente → null', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      await createCardFromSentry(db, { title: 'erro pra linkar', teamId: 'CORE' });

      const ok = await linkCardFromSentry(db, 'CORE-1');
      expect(ok).toEqual({
         identifier: 'CORE-1',
         project: 'Core',
         webUrl: cardUrl('CORE-1'),
      });
      expect(await linkCardFromSentry(db, 'CORE-999')).toBeNull();
      expect(await linkCardFromSentry(db, '')).toBeNull();
   });

   it('createCardFromSentry: dedup por sentryIssueId — reenvio reusa o MESMO card', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');

      const first = await createCardFromSentry(db, {
         title: 'Erro recorrente',
         teamId: 'CORE',
         sentryIssueId: 'sentry-abc-123',
      });
      // 2º create com o MESMO issueId do Sentry (replay/retry) não cria card novo.
      const second = await createCardFromSentry(db, {
         title: 'Erro recorrente (reenvio)',
         teamId: 'CORE',
         sentryIssueId: 'sentry-abc-123',
      });
      expect(second.identifier).toBe(first.identifier); // mesmo card
      expect(second.identifier).toBe('CORE-1'); // não avançou pra CORE-2

      // issueId diferente → card novo.
      const other = await createCardFromSentry(db, {
         title: 'Outro erro',
         teamId: 'CORE',
         sentryIssueId: 'sentry-def-456',
      });
      expect(other.identifier).toBe('CORE-2');
   });

   it('createCardFromSentry: aceita sentryIssueId NUMÉRICO (o Sentry manda number) e dedup funciona', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      // O Sentry envia issueId como número — não pode quebrar com .trim() (era o 500).
      const first = await createCardFromSentry(db, {
         title: 'Erro numérico',
         teamId: 'CORE',
         sentryIssueId: 7685502426,
      });
      expect(first.identifier).toBe('CORE-1');
      const replay = await createCardFromSentry(db, {
         title: 'Erro numérico (replay)',
         teamId: 'CORE',
         sentryIssueId: 7685502426,
      });
      expect(replay.identifier).toBe('CORE-1'); // dedup por id numérico coagido
   });

   it('teamOptions: lista os times como {label,value}', async () => {
      const db = await makeTestDb();
      await seedTeam(db, 'CORE', 'Core');
      const opts = await teamOptions(db);
      expect(opts).toContainEqual({ label: 'Core (CORE)', value: 'CORE' });
   });
});
