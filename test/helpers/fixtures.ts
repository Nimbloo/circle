import { randomUUID } from 'node:crypto';
import type { Db } from '@/db';
import { team, appUser, teamMember } from '@/db/schema';

/** Semeia um time para os testes de issue (FK obrigatória). */
export async function seedTeam(db: Db, id = 'CORE', name = 'LNDev Core') {
   await db
      .insert(team)
      .values({ id, name, icon: '🛠️', color: '#FF0000', issueSeq: 0 })
      .onConflictDoNothing();
   return id;
}

export interface SeedUserOpts {
   id?: string;
   name: string;
   email: string;
   role?: string;
   joinedAt?: string;
   teamIds?: string[];
}

/** Cria um usuário e, opcionalmente, o vincula a times. */
export async function seedUser(db: Db, opts: SeedUserOpts): Promise<string> {
   const id = opts.id ?? randomUUID();
   const now = new Date();
   await db
      .insert(appUser)
      .values({
         id,
         slug: opts.email.split('@')[0].toLowerCase(),
         name: opts.name,
         email: opts.email.toLowerCase(),
         avatarUrl: null,
         role: opts.role ?? 'Member',
         presence: 'offline',
         timezone: null,
         joinedAt: opts.joinedAt ?? '2026-01-01',
         createdAt: now,
         updatedAt: now,
      })
      .onConflictDoNothing();
   for (const tid of opts.teamIds ?? []) {
      await db
         .insert(teamMember)
         .values({ teamId: tid, userId: id, joined: true })
         .onConflictDoNothing();
   }
   return id;
}
