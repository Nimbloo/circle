import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createInvite } from '@/lib/api/invites';
import { decideKeycloakLogin } from '@/lib/api/login-gate';

/**
 * A regra de autorização do produto, testada direto — dentro do callback `signIn` ela só
 * seria exercitável através do NextAuth.
 *
 * O ponto sensível: o convite dispensa o grupo `app-circle`, NUNCA a autenticação. Se
 * algum dia essa ordem inverter, estes testes caem.
 */

const ADMIN = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   return db;
}

const profile = (over: Record<string, unknown> = {}) => ({
   email: 'novo@nimbloo.ai',
   email_verified: true,
   groups: [] as string[],
   ...over,
});

describe('gate de login (grupo OU convite)', () => {
   it('grupo app-circle entra pelo caminho normal, sem tocar em convite', async () => {
      const db = await setup();
      const d = await decideKeycloakLogin(
         db,
         profile({ groups: ['app-circle'] }),
         'novo@nimbloo.ai'
      );
      expect(d).toEqual({ allowed: true, via: 'group' });
   });

   it('sem grupo e sem convite: negado', async () => {
      const db = await setup();
      const d = await decideKeycloakLogin(db, profile(), 'novo@nimbloo.ai');
      expect(d).toEqual({ allowed: false, reason: 'unauthorized' });
   });

   it('sem grupo mas COM convite valido: entra e consome (single-use)', async () => {
      const db = await setup();
      await createInvite(db, 'novo@nimbloo.ai', ADMIN);

      const first = await decideKeycloakLogin(db, profile(), 'novo@nimbloo.ai');
      expect(first).toEqual({ allowed: true, via: 'invite' });

      // Segundo login sem grupo nao entra mais — o convite ja foi gasto.
      const second = await decideKeycloakLogin(db, profile(), 'novo@nimbloo.ai');
      expect(second).toEqual({ allowed: false, reason: 'unauthorized' });
   });

   it('quem TEM grupo nao queima o convite a toa', async () => {
      const db = await setup();
      await createInvite(db, 'novo@nimbloo.ai', ADMIN);

      await decideKeycloakLogin(db, profile({ groups: ['app-circle'] }), 'novo@nimbloo.ai');

      // O convite continua utilizavel: quem entrou pelo grupo nao o consumiu.
      const viaInvite = await decideKeycloakLogin(db, profile(), 'novo@nimbloo.ai');
      expect(viaInvite).toEqual({ allowed: true, via: 'invite' });
   });

   // ---- O piso: convite NAO dispensa autenticacao ----

   it('convite NAO vale para dominio de fora, mesmo que exista linha no banco', async () => {
      const db = await setup();
      // O createInvite barra dominio externo, entao nem da pra criar — confirma a 1a barreira.
      await expect(createInvite(db, 'invasor@gmail.com', ADMIN)).rejects.toMatchObject({
         status: 400,
      });
      // E o gate barra de novo, independente de convite.
      const d = await decideKeycloakLogin(
         db,
         profile({ email: 'invasor@gmail.com' }),
         'invasor@gmail.com'
      );
      expect(d).toEqual({ allowed: false, reason: 'identity' });
   });

   it('convite NAO vale com e-mail nao verificado pelo Keycloak', async () => {
      const db = await setup();
      await createInvite(db, 'novo@nimbloo.ai', ADMIN);

      const d = await decideKeycloakLogin(
         db,
         profile({ email_verified: false }),
         'novo@nimbloo.ai'
      );
      expect(d).toEqual({ allowed: false, reason: 'identity' });
   });

   it('identidade invalida e barrada ANTES de consumir o convite', async () => {
      const db = await setup();
      await createInvite(db, 'novo@nimbloo.ai', ADMIN);

      await decideKeycloakLogin(db, profile({ email_verified: false }), 'novo@nimbloo.ai');

      // Convite intacto: a barreira de identidade nao pode gastar o convite de ninguem.
      const d = await decideKeycloakLogin(db, profile(), 'novo@nimbloo.ai');
      expect(d).toEqual({ allowed: true, via: 'invite' });
   });

   it('convite de OUTRO e-mail nao serve', async () => {
      const db = await setup();
      await createInvite(db, 'convidado@nimbloo.ai', ADMIN);

      const d = await decideKeycloakLogin(db, profile(), 'novo@nimbloo.ai');
      expect(d).toEqual({ allowed: false, reason: 'unauthorized' });
   });
});
