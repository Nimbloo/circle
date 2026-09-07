import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedUser } from './helpers/fixtures';
import type { Db } from '@/db';
import { roleFromProfile } from '@/auth.config';
import { decideKeycloakLogin } from '@/lib/api/login-gate';
import { getOrCreateUser } from '@/lib/api/users';

/**
 * Papel PELO KEYCLOAK, no mesmo padrão do Grafana aqui (`role_attribute_path` +
 * `role_attribute_strict`): client role manda, grupo `app-circle` é o piso `Member`, e
 * sem os dois o login é negado. Quem concede e revoga é o Orbis, pela Admin API.
 */
let db: Db;
const EMAIL = 'pessoa@nimbloo.ai';

const profile = (opts: { groups?: string[]; roles?: string[] } = {}) => ({
   email: EMAIL,
   email_verified: true,
   ...(opts.groups ? { groups: opts.groups } : {}),
   ...(opts.roles ? { resource_access: { circle: { roles: opts.roles } } } : {}),
});

beforeEach(async () => {
   db = await makeTestDb();
});

describe('papel derivado do token do Keycloak', () => {
   it('client role manda sobre o grupo, na grafia que o realm usar', () => {
      // O realm declara hoje `member` minúsculo; `admin`/`guest` entram no PR do realm.
      expect(roleFromProfile(profile({ groups: ['app-circle'], roles: ['member'] }))).toBe(
         'Member'
      );
      expect(roleFromProfile(profile({ groups: ['app-circle'], roles: ['Admin'] }))).toBe('Admin');
      expect(roleFromProfile(profile({ groups: ['app-circle'], roles: ['guest'] }))).toBe('Guest');
   });

   it('só o grupo cai no piso Member (evita lockout de quem já usa)', () => {
      expect(roleFromProfile(profile({ groups: ['app-circle'] }))).toBe('Member');
   });

   it('sem grupo e sem role: nulo, e o gate NEGA o login', async () => {
      expect(roleFromProfile(profile({ groups: ['app-grafana'] }))).toBeNull();
      expect(await decideKeycloakLogin(db, profile({ groups: ['app-grafana'] }), EMAIL)).toEqual({
         allowed: false,
         reason: 'unauthorized',
      });
   });

   it('role desconhecida no realm não vira papel: cai no piso do grupo', () => {
      expect(roleFromProfile(profile({ groups: ['app-circle'], roles: ['Auditor'] }))).toBe(
         'Member'
      );
      expect(roleFromProfile(profile({ roles: ['Auditor'] }))).toBeNull();
   });

   it('login sincroniza o papel de quem já existe (revogar no Orbis rebaixa)', async () => {
      const id = await seedUser(db, { name: 'Pessoa', email: EMAIL, teamIds: [] });
      await db.update((await import('@/db/schema')).appUser).set({ role: 'Admin' });

      // Sem `syncRole` (chamada de rota) o papel do banco é preservado.
      expect((await getOrCreateUser(db, EMAIL, 'Member')).role).toBe('Admin');

      // No login, o papel do token manda.
      const user = await getOrCreateUser(db, EMAIL, 'Member', { syncRole: true });
      expect(user.id).toBe(id);
      expect(user.role).toBe('Member');
   });
});
