/**
 * Seed de dados de exemplo: importa os próprios mock-data do repo e os transforma
 * em inserts, resolvendo os objetos aninhados (issue.status, project.lead, …) em FKs.
 * Idempotente (onConflictDoNothing). Só para dev/hml (flag circle.seed-demo).
 */
import type { Db } from './index';
import {
   appUser,
   team,
   teamMember,
   initiative,
   project,
   projectLabel,
   issue,
   issueLabel,
   issueContent,
   issueRelation,
   savedView,
   documentFolder,
   teamDocument,
   notification,
} from './schema';

import { users } from '@/data/users';
import { teams } from '@/data/teams';
import { projects } from '@/data/projects';
import { issues } from '@/data/issues';
import { initiatives } from '@/data/initiatives';
import { views } from '@/data/views';

function ts(dateish: string | undefined): Date {
   const d = dateish ? new Date(dateish) : new Date('2026-01-01');
   return isNaN(d.getTime()) ? new Date('2026-01-01') : d;
}

export async function seedDemo(db: Db): Promise<void> {
   // Sem dados demo (mock-data zerado por padrão) -> no-op seguro. O app é API-driven;
   // seedDemo só popula algo quando os mock-data são reintroduzidos manualmente (dev).
   if (users.length === 0) return;

   const defaultTeam = teams[0]?.id ?? 'CORE';
   const projectIds = new Set(projects.map((p) => p.id));

   // 1) Users
   await db
      .insert(appUser)
      .values(
         users.map((u) => ({
            id: u.id,
            slug: u.id,
            name: u.name,
            email: u.email,
            avatarUrl: u.avatarUrl,
            role: u.role,
            presence: u.status,
            timezone: u.timezone ?? null,
            joinedAt: u.joinedDate,
            createdAt: ts(u.joinedDate),
            updatedAt: ts(u.joinedDate),
         }))
      )
      .onConflictDoNothing();

   // 2) Teams
   if (teams.length)
      await db
         .insert(team)
         .values(
            teams.map((t) => ({
               id: t.id,
               name: t.name,
               icon: t.icon,
               color: t.color,
               issueSeq: 0,
            }))
         )
         .onConflictDoNothing();

   // 3) Team members (de team.members)
   const memberRows = teams.flatMap((t) =>
      t.members.map((m) => ({ teamId: t.id, userId: m.id, joined: t.joined }))
   );
   const seenMember = new Set<string>();
   const dedupMembers = memberRows.filter((r) => {
      const k = `${r.teamId}:${r.userId}`;
      if (seenMember.has(k)) return false;
      seenMember.add(k);
      return true;
   });
   if (dedupMembers.length) await db.insert(teamMember).values(dedupMembers).onConflictDoNothing();

   // 4) Initiatives + mapa projeto->initiative
   const projectInitiative = new Map<string, string>();
   for (const ini of initiatives) {
      for (const pid of ini.projectIds ?? [])
         if (projectIds.has(pid)) projectInitiative.set(pid, ini.id);
   }
   if (initiatives.length)
      await db
         .insert(initiative)
         .values(
            initiatives.map((i) => ({
               id: i.id,
               slug: i.id,
               name: i.name,
               description: i.description ?? null,
               icon: i.icon ?? null,
               status: i.status,
               priorityId: i.priority.id,
               ownerId: i.owner?.id ?? null,
               target: i.target ?? null,
               healthId: i.health.id,
               createdAt: ts(i.createdAt),
            }))
         )
         .onConflictDoNothing();

   // 5) Projects
   if (projects.length)
      await db
         .insert(project)
         .values(
            projects.map((p) => ({
               id: p.id,
               name: p.name,
               statusId: p.status.id,
               iconKey: null,
               percentComplete: p.percentComplete,
               startDate: p.startDate ?? null,
               targetDate: p.targetDate ?? null,
               leadId: p.lead?.id ?? null,
               priorityId: p.priority.id,
               healthId: p.health.id,
               teamId: p.teamId,
               initiativeId: projectInitiative.get(p.id) ?? null,
               healthUpdatedAt: null,
               createdAt: ts(p.startDate),
               updatedAt: ts(p.startDate),
            }))
         )
         .onConflictDoNothing();

   // 6) Project labels
   const projLabelRows = projects.flatMap((p) =>
      (p.labels ?? []).map((l) => ({ projectId: p.id, labelId: l.id }))
   );
   if (projLabelRows.length)
      await db
         .insert(projectLabel)
         .values(dedupPairs(projLabelRows, (r) => `${r.projectId}:${r.labelId}`))
         .onConflictDoNothing();

   // 7) Initiative↔project: o vínculo é o back-ref project.initiativeId (setado ao
   // inserir o projeto acima); a join table initiative_project foi removida.

   // 8) Cycles — sem seed de ciclos mock (o mock sempre foi vazio); issues nascem sem
   // ciclo. Ciclos reais são criados via API/UI.
   const cycleIds = new Set<string>();

   // 9) Issues
   const projectTeam = new Map(projects.map((p) => [p.id, p.teamId]));
   if (issues.length)
      await db
         .insert(issue)
         .values(
            issues.map((i) => ({
               id: i.id,
               identifier: i.identifier,
               teamId: i.project ? (projectTeam.get(i.project.id) ?? defaultTeam) : defaultTeam,
               title: i.title,
               statusId: i.status.id,
               priorityId: i.priority.id,
               assigneeId: i.assignee?.id ?? null,
               createdById: null,
               projectId: i.project?.id ?? null,
               cycleId: i.cycleId && cycleIds.has(i.cycleId) ? i.cycleId : null,
               rank: i.rank,
               dueDate: i.dueDate ?? null,
               createdAt: ts(i.createdAt),
               updatedAt: ts(i.createdAt),
            }))
         )
         .onConflictDoNothing();

   // 10) Issue labels + descrição
   const issueLabelRows = issues.flatMap((i) =>
      (i.labels ?? []).map((l) => ({ issueId: i.id, labelId: l.id }))
   );
   if (issueLabelRows.length)
      await db
         .insert(issueLabel)
         .values(dedupPairs(issueLabelRows, (r) => `${r.issueId}:${r.labelId}`))
         .onConflictDoNothing();

   const contentRows = issues
      .filter((i) => i.description && i.description.trim())
      .map((i) => ({ issueId: i.id, description: i.description, milestone: null }));
   if (contentRows.length) await db.insert(issueContent).values(contentRows).onConflictDoNothing();

   // 10b) Sub-issues (issue.subissues = identifiers) -> issue_relation kind=sub
   const byIdentifier = new Map(issues.map((i) => [i.identifier, i.id]));
   const relRows = issues.flatMap((i) =>
      (i.subissues ?? [])
         .map((childIdent) => byIdentifier.get(childIdent))
         .filter((cid): cid is string => Boolean(cid))
         .map((cid) => ({ id: `${i.id}-sub-${cid}`, issueId: i.id, relatedId: cid, kind: 'sub' }))
   );
   if (relRows.length) await db.insert(issueRelation).values(relRows).onConflictDoNothing();

   // 11) Views
   if (views.length)
      await db
         .insert(savedView)
         .values(
            views.map((v) => ({
               id: v.id,
               slug: v.id,
               name: v.name,
               description: v.description ?? null,
               icon: v.icon ?? null,
               type: v.type,
               teamId: v.teamId ?? null,
               ownerId: v.owner.id,
               filter: JSON.stringify(v.filter ?? {}),
               createdAt: ts(v.createdAt),
               updatedAt: ts(v.updatedAt),
            }))
         )
         .onConflictDoNothing();

   // 12) Documents (folder default no time principal)
   await db
      .insert(documentFolder)
      .values({ id: 'demo-docs', teamId: defaultTeam, name: 'Documents', icon: '📄' })
      .onConflictDoNothing();
   const docRows = [
      {
         id: 'doc-welcome',
         folderId: 'demo-docs',
         name: 'Welcome',
         icon: '👋',
         creatorId: users[0].id,
         pinned: true,
         createdAt: ts('2026-01-01'),
         updatedAt: ts('2026-01-01'),
      },
      {
         id: 'doc-arch',
         folderId: 'demo-docs',
         name: 'Architecture',
         icon: '🏛️',
         creatorId: users[0].id,
         pinned: false,
         createdAt: ts('2026-01-02'),
         updatedAt: ts('2026-01-02'),
      },
   ];
   await db.insert(teamDocument).values(docRows).onConflictDoNothing();

   // 13) Notifications de exemplo p/ o primeiro usuário (recipient)
   const me = users[0].id;
   const notifRows = issues.slice(0, 6).map((i, idx) => ({
      id: `demo-notif-${idx}`,
      issueId: i.id,
      actorId: i.assignee?.id ?? users[1]?.id ?? me,
      recipientId: me,
      type: ['assignment', 'comment', 'status', 'mention', 'created', 'closed'][idx % 6],
      content: `Atualização em ${i.identifier}`,
      read: idx % 2 === 0,
      createdAt: ts(i.createdAt),
   }));
   if (notifRows.length) await db.insert(notification).values(notifRows).onConflictDoNothing();
}

function dedupPairs<T>(rows: T[], keyOf: (r: T) => string): T[] {
   const seen = new Set<string>();
   return rows.filter((r) => {
      const k = keyOf(r);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
   });
}
