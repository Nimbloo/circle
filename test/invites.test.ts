import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { invite } from '@/db/schema';
import {
   createInvite,
   listInvites,
   revokeInvite,
   getInviteByToken,
   consumeInvite,
} from '@/lib/api/invites';

const ADMIN = 'ana@nimbloo.ai';

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ADMIN, role: 'Admin', teamIds: ['CORE'] });
   return db;
}

describe('convites', () => {
   it('cria o convite com token e validade, e registra quem convidou', async () => {
      const db = await setup();
      const dto = await createInvite(db, 'Novo.Dev@Nimbloo.ai', ADMIN);

      expect(dto.email).toBe('novo.dev@nimbloo.ai'); // normalizado
      expect(dto.token).toHaveLength(64);
      expect(dto.acceptedAt).toBeNull();
      expect(dto.expired).toBe(false);
      expect(dto.invitedBy?.email).toBe(ADMIN);
      expect(new Date(dto.expiresAt).getTime()).toBeGreaterThan(Date.now());
   });

   it('recusa dominio de fora — o gate nao pode depender so do signIn', async () => {
      const db = await setup();
      await expect(createInvite(db, 'alguem@gmail.com', ADMIN)).rejects.toMatchObject({
         status: 400,
      });
      expect(await listInvites(db)).toHaveLength(0);
   });

   it('recusa convidar quem ja e usuario (409)', async () => {
      const db = await setup();
      await expect(createInvite(db, ADMIN, ADMIN)).rejects.toMatchObject({ status: 409 });
   });

   it('reconvidar renova token e validade em vez de duplicar', async () => {
      const db = await setup();
      const first = await createInvite(db, 'dev@nimbloo.ai', ADMIN);
      const second = await createInvite(db, 'dev@nimbloo.ai', ADMIN);

      expect(second.token).not.toBe(first.token);
      expect(await listInvites(db)).toHaveLength(1);
   });

   it('o token so resolve enquanto o convite vale', async () => {
      const db = await setup();
      const dto = await createInvite(db, 'dev@nimbloo.ai', ADMIN);
      expect(await getInviteByToken(db, dto.token!)).not.toBeNull();
      expect(await getInviteByToken(db, 'token-inexistente')).toBeNull();
   });

   it('consumeInvite libera UMA vez e depois nao libera mais (single-use)', async () => {
      const db = await setup();
      await createInvite(db, 'dev@nimbloo.ai', ADMIN);

      expect(await consumeInvite(db, 'Dev@Nimbloo.ai')).toBe(true); // normaliza
      expect(await consumeInvite(db, 'dev@nimbloo.ai')).toBe(false); // ja aceito
   });

   it('nao libera e-mail sem convite, nem convite vencido', async () => {
      const db = await setup();
      expect(await consumeInvite(db, 'estranho@nimbloo.ai')).toBe(false);

      const dto = await createInvite(db, 'atrasado@nimbloo.ai', ADMIN);
      await db
         .update(invite)
         .set({ expiresAt: new Date(Date.now() - 1000) })
         .where(eq(invite.id, dto.id));

      expect(await consumeInvite(db, 'atrasado@nimbloo.ai')).toBe(false);
      expect(await getInviteByToken(db, dto.token!)).toBeNull();
      expect((await listInvites(db))[0].expired).toBe(true);
   });

   it('a listagem nunca devolve o token (segredo do magic link)', async () => {
      const db = await setup();
      await createInvite(db, 'dev@nimbloo.ai', ADMIN);
      expect((await listInvites(db))[0].token).toBeUndefined();
   });

   it('revoga o convite', async () => {
      const db = await setup();
      const dto = await createInvite(db, 'dev@nimbloo.ai', ADMIN);

      expect(await revokeInvite(db, dto.id)).toBe(true);
      expect(await listInvites(db)).toHaveLength(0);
      expect(await consumeInvite(db, 'dev@nimbloo.ai')).toBe(false);
      expect(await revokeInvite(db, dto.id)).toBe(false); // idempotente
   });
});
