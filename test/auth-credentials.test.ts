import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import { appUser } from '@/db/schema';
import { inviteUser, setPassword, getOrCreateUser } from '@/lib/api/users';
import { ApiError } from '@/lib/api/errors';

describe('inviteUser', () => {
   it('creates a user with the given role, no password, and a fresh invite token', async () => {
      const db = await makeTestDb();
      const u = await inviteUser(db, 'New.Person@Nimbloo.ai', 'Admin');
      expect(u.email).toBe('new.person@nimbloo.ai');
      expect(u.role).toBe('Admin');
      expect(u.inviteToken).toMatch(/^[0-9a-f]{64}$/);
      const [row] = await db
         .select()
         .from(appUser)
         .where(eq(appUser.email, 'new.person@nimbloo.ai'));
      expect(row.passwordHash).toBeNull();
      expect(row.inviteToken).toBe(u.inviteToken);
   });

   it('is idempotent by email and updates the role of an existing user', async () => {
      const db = await makeTestDb();
      await seedUser(db, { name: 'Bob', email: 'bob@nimbloo.ai', role: 'Member' });
      const u = await inviteUser(db, 'bob@nimbloo.ai', 'Admin');
      expect(u.role).toBe('Admin');
      const rows = await db.select().from(appUser).where(eq(appUser.email, 'bob@nimbloo.ai'));
      expect(rows).toHaveLength(1);
      expect(rows[0].role).toBe('Admin');
   });

   it('generates a new token on every (re-)invite', async () => {
      const db = await makeTestDb();
      const first = await inviteUser(db, 'reinv@nimbloo.ai', 'Member');
      const second = await inviteUser(db, 'reinv@nimbloo.ai', 'Member');
      expect(second.inviteToken).toBeTruthy();
      expect(second.inviteToken).not.toBe(first.inviteToken);
   });
});

describe('setPassword', () => {
   it('rejects an email that was not invited (403)', async () => {
      const db = await makeTestDb();
      await expect(
         setPassword(db, 'ghost@nimbloo.ai', 'sup3rsecret', 'sometoken')
      ).rejects.toMatchObject({ status: 403 });
   });

   it('sets a bcrypt hash for an invited user with the correct token', async () => {
      const db = await makeTestDb();
      const u = await inviteUser(db, 'inv@nimbloo.ai', 'Member');
      await setPassword(db, 'inv@nimbloo.ai', 'sup3rsecret', u.inviteToken!);
      const [row] = await db.select().from(appUser).where(eq(appUser.email, 'inv@nimbloo.ai'));
      expect(row.passwordHash).toBeTruthy();
      expect(await bcrypt.compare('sup3rsecret', row.passwordHash!)).toBe(true);
      expect(await bcrypt.compare('wrong-password', row.passwordHash!)).toBe(false);
      // single-use: token limpo após o resgate.
      expect(row.inviteToken).toBeNull();
   });

   it('rejects a wrong token (403) and leaves the account without a password', async () => {
      const db = await makeTestDb();
      await inviteUser(db, 'wrong@nimbloo.ai', 'Member');
      await expect(
         setPassword(db, 'wrong@nimbloo.ai', 'sup3rsecret', 'not-the-real-token')
      ).rejects.toMatchObject({ status: 403 });
      const [row] = await db.select().from(appUser).where(eq(appUser.email, 'wrong@nimbloo.ai'));
      expect(row.passwordHash).toBeNull();
   });

   it('rejects an SSO user with no invite token (403) — closes the takeover', async () => {
      const db = await makeTestDb();
      // provisionado via SSO (getOrCreateUser) → inviteToken null.
      await getOrCreateUser(db, 'sso@nimbloo.ai');
      await expect(
         setPassword(db, 'sso@nimbloo.ai', 'sup3rsecret', 'any-token')
      ).rejects.toMatchObject({ status: 403 });
   });

   it('is single-use: the token stops working after the first successful set (409)', async () => {
      const db = await makeTestDb();
      const u = await inviteUser(db, 'dup@nimbloo.ai', 'Member');
      await setPassword(db, 'dup@nimbloo.ai', 'firstpass1', u.inviteToken!);
      // mesmo token, agora com senha já setada → 409 (não reutilizável).
      await expect(
         setPassword(db, 'dup@nimbloo.ai', 'secondpass1', u.inviteToken!)
      ).rejects.toMatchObject({ status: 409 });
      const [row] = await db.select().from(appUser).where(eq(appUser.email, 'dup@nimbloo.ai'));
      expect(await bcrypt.compare('firstpass1', row.passwordHash!)).toBe(true);
   });

   it('throws ApiError instances (mapped to ProblemDetail)', async () => {
      const db = await makeTestDb();
      await expect(setPassword(db, 'nobody@nimbloo.ai', 'sup3rsecret', 't')).rejects.toBeInstanceOf(
         ApiError
      );
   });
});
