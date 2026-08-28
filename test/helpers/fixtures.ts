import { randomUUID } from 'node:crypto';
import type { Db } from '@/db';
import {
   team,
   appUser,
   teamMember,
   project,
   cycle,
   initiative,
   initiativeProject,
   savedView,
   issue,
} from '@/db/schema';

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

export interface WorkspaceFixture {
   teamId: string;
   ownerId: string;
   ownerEmail: string;
   memberId: string;
   projectId: string;
   cycleId: string;
   initiativeId: string;
   viewId: string;
   issueId: string;
}

/**
 * Semeia um grafo mínimo porém completo (team + members + project + cycle +
 * initiative + view + issue) direto via schema — fixture self-contida para os
 * testes de bootstrap/seed, já que os mock-data do app ficam zerados de propósito.
 */
export async function seedWorkspaceFixture(db: Db): Promise<WorkspaceFixture> {
   const now = new Date('2026-01-01T00:00:00Z');
   const teamId = await seedTeam(db, 'CORE');
   const ownerEmail = 'ana.silva@nimbloo.ai';
   const ownerId = await seedUser(db, {
      name: 'Ana Silva',
      email: ownerEmail,
      role: 'Admin',
      teamIds: [teamId],
   });
   const memberId = await seedUser(db, {
      name: 'Lia Costa',
      email: 'lia.costa@nimbloo.ai',
      teamIds: [teamId],
   });

   const initiativeId = 'INI-1';
   await db
      .insert(initiative)
      .values({
         id: initiativeId,
         slug: 'ini-1',
         name: 'Design System',
         description: null,
         icon: null,
         status: 'active',
         priorityId: 'high',
         ownerId,
         target: null,
         healthId: 'on-track',
         createdAt: now,
      })
      .onConflictDoNothing();

   const projectId = 'P-1';
   await db
      .insert(project)
      .values({
         id: projectId,
         name: 'Core Components',
         statusId: 'proj-in-progress',
         iconKey: null,
         percentComplete: 50,
         startDate: '2026-01-01',
         targetDate: '2026-06-01',
         leadId: ownerId,
         priorityId: 'high',
         healthId: 'on-track',
         teamId,
         initiativeId,
         healthUpdatedAt: null,
         createdAt: now,
         updatedAt: now,
      })
      .onConflictDoNothing();
   await db.insert(initiativeProject).values({ initiativeId, projectId }).onConflictDoNothing();

   const cycleId = 'C-1';
   await db
      .insert(cycle)
      .values({
         id: cycleId,
         number: 1,
         name: 'Cycle 1',
         teamId,
         status: 'current',
         startDate: '2026-01-01',
         endDate: '2026-01-14',
         capacity: 20,
      })
      .onConflictDoNothing();

   const viewId = 'V-1';
   await db
      .insert(savedView)
      .values({
         id: viewId,
         slug: 'v-1',
         name: 'Active issues',
         description: null,
         icon: null,
         type: 'issue',
         teamId,
         ownerId,
         filter: '{}',
         createdAt: now,
         updatedAt: now,
      })
      .onConflictDoNothing();

   const issueId = 'I-1';
   await db
      .insert(issue)
      .values({
         id: issueId,
         identifier: 'CORE-1',
         teamId,
         title: 'Botão perde foco no teclado',
         statusId: 'in-progress',
         priorityId: 'high',
         assigneeId: ownerId,
         createdById: ownerId,
         projectId,
         cycleId,
         rank: 'a3c',
         dueDate: null,
         createdAt: now,
         updatedAt: now,
      })
      .onConflictDoNothing();

   return {
      teamId,
      ownerId,
      ownerEmail,
      memberId,
      projectId,
      cycleId,
      initiativeId,
      viewId,
      issueId,
   };
}
