import {
   pgTable,
   varchar,
   integer,
   boolean,
   date,
   timestamp,
   text,
   primaryKey,
   index,
} from 'drizzle-orm/pg-core';

// ─────────────────────────────────────────────────────────────
// Catálogos (semeados; fixos no produto) — DESIGN §3
// ─────────────────────────────────────────────────────────────
export const status = pgTable('status', {
   id: varchar('id', { length: 64 }).primaryKey(),
   name: varchar('name', { length: 128 }).notNull(),
   color: varchar('color', { length: 16 }).notNull(),
   category: varchar('category', { length: 32 }).notNull(), // triage|backlog|unstarted|started|completed|canceled
   position: integer('position').notNull(),
});

export const priority = pgTable('priority', {
   id: varchar('id', { length: 64 }).primaryKey(),
   name: varchar('name', { length: 128 }).notNull(),
   position: integer('position').notNull(),
   sortRank: integer('sort_rank').notNull(), // urgent<high<medium<low<no-priority
});

export const label = pgTable('label', {
   id: varchar('id', { length: 64 }).primaryKey(),
   name: varchar('name', { length: 128 }).notNull(),
   color: varchar('color', { length: 32 }).notNull(), // nome de cor, não hex
});

export const health = pgTable('health', {
   id: varchar('id', { length: 64 }).primaryKey(),
   name: varchar('name', { length: 128 }).notNull(),
   color: varchar('color', { length: 16 }).notNull(),
   description: varchar('description', { length: 512 }),
});

// ─────────────────────────────────────────────────────────────
// Usuários / Times
// ─────────────────────────────────────────────────────────────
export const appUser = pgTable('app_user', {
   id: varchar('id', { length: 36 }).primaryKey(),
   slug: varchar('slug', { length: 64 }).notNull().unique(),
   name: varchar('name', { length: 128 }).notNull(),
   email: varchar('email', { length: 255 }).notNull().unique(),
   avatarUrl: varchar('avatar_url', { length: 512 }),
   role: varchar('role', { length: 16 }).notNull().default('Member'), // Member|Admin|Guest|Application
   presence: varchar('presence', { length: 16 }).notNull().default('offline'),
   timezone: varchar('timezone', { length: 64 }),
   joinedAt: date('joined_at').notNull(),
   createdAt: timestamp('created_at').notNull().defaultNow(),
   updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const team = pgTable('team', {
   id: varchar('id', { length: 16 }).primaryKey(), // key curta (CORE, DESIGN)
   name: varchar('name', { length: 128 }).notNull(),
   icon: varchar('icon', { length: 16 }),
   color: varchar('color', { length: 16 }),
   issueSeq: integer('issue_seq').notNull().default(0), // contador p/ identifier <KEY>-<n>
});

export const teamMember = pgTable(
   'team_member',
   {
      teamId: varchar('team_id', { length: 16 })
         .notNull()
         .references(() => team.id),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      joined: boolean('joined').notNull().default(true),
   },
   (t) => [
      primaryKey({ columns: [t.teamId, t.userId] }),
      index('idx_team_member_user').on(t.userId),
   ]
);

// ─────────────────────────────────────────────────────────────
// Initiatives / Projects
// ─────────────────────────────────────────────────────────────
export const initiative = pgTable('initiative', {
   id: varchar('id', { length: 36 }).primaryKey(),
   slug: varchar('slug', { length: 96 }).notNull().unique(),
   name: varchar('name', { length: 196 }).notNull(),
   description: text('description'),
   icon: varchar('icon', { length: 16 }),
   status: varchar('status', { length: 16 }).notNull(), // active|planned|completed
   priorityId: varchar('priority_id', { length: 64 })
      .notNull()
      .references(() => priority.id),
   ownerId: varchar('owner_id', { length: 36 }).references(() => appUser.id),
   target: varchar('target', { length: 64 }),
   healthId: varchar('health_id', { length: 64 })
      .notNull()
      .references(() => health.id),
   createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const project = pgTable(
   'project',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      name: varchar('name', { length: 196 }).notNull(),
      statusId: varchar('status_id', { length: 64 })
         .notNull()
         .references(() => status.id),
      iconKey: varchar('icon_key', { length: 64 }),
      percentComplete: integer('percent_complete').notNull().default(0),
      startDate: date('start_date'),
      targetDate: date('target_date'),
      leadId: varchar('lead_id', { length: 36 }).references(() => appUser.id),
      priorityId: varchar('priority_id', { length: 64 })
         .notNull()
         .references(() => priority.id),
      healthId: varchar('health_id', { length: 64 })
         .notNull()
         .references(() => health.id),
      teamId: varchar('team_id', { length: 16 })
         .notNull()
         .references(() => team.id),
      initiativeId: varchar('initiative_id', { length: 36 }).references(() => initiative.id),
      healthUpdatedAt: timestamp('health_updated_at'),
      createdAt: timestamp('created_at').notNull().defaultNow(),
      updatedAt: timestamp('updated_at').notNull().defaultNow(),
   },
   (t) => [
      index('idx_project_team').on(t.teamId),
      index('idx_project_initiative').on(t.initiativeId),
   ]
);

export const projectLabel = pgTable(
   'project_label',
   {
      projectId: varchar('project_id', { length: 36 })
         .notNull()
         .references(() => project.id),
      labelId: varchar('label_id', { length: 64 })
         .notNull()
         .references(() => label.id),
   },
   (t) => [primaryKey({ columns: [t.projectId, t.labelId] })]
);

export const initiativeProject = pgTable(
   'initiative_project',
   {
      initiativeId: varchar('initiative_id', { length: 36 })
         .notNull()
         .references(() => initiative.id),
      projectId: varchar('project_id', { length: 36 })
         .notNull()
         .references(() => project.id),
   },
   (t) => [primaryKey({ columns: [t.initiativeId, t.projectId] })]
);

// ─────────────────────────────────────────────────────────────
// Cycles / Issues
// ─────────────────────────────────────────────────────────────
export const cycle = pgTable(
   'cycle',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      number: integer('number').notNull(),
      name: varchar('name', { length: 96 }).notNull(),
      teamId: varchar('team_id', { length: 16 })
         .notNull()
         .references(() => team.id),
      status: varchar('status', { length: 16 }).notNull(), // planned|upcoming|current|completed
      startDate: date('start_date').notNull(),
      endDate: date('end_date').notNull(),
      capacity: integer('capacity').notNull().default(0),
   },
   (t) => [index('idx_cycle_team').on(t.teamId)]
);

export const issue = pgTable(
   'issue',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      identifier: varchar('identifier', { length: 32 }).notNull().unique(), // <TEAM_KEY>-<n>
      teamId: varchar('team_id', { length: 16 })
         .notNull()
         .references(() => team.id),
      title: varchar('title', { length: 512 }).notNull(),
      statusId: varchar('status_id', { length: 64 })
         .notNull()
         .references(() => status.id),
      priorityId: varchar('priority_id', { length: 64 })
         .notNull()
         .references(() => priority.id),
      assigneeId: varchar('assignee_id', { length: 36 }).references(() => appUser.id),
      createdById: varchar('created_by_id', { length: 36 }).references(() => appUser.id),
      projectId: varchar('project_id', { length: 36 }).references(() => project.id),
      cycleId: varchar('cycle_id', { length: 36 }).references(() => cycle.id),
      rank: varchar('rank', { length: 64 }).notNull(), // lexorank
      dueDate: date('due_date'),
      estimate: integer('estimate'), // pontos de estimativa (nullable = sem estimativa)
      createdAt: timestamp('created_at').notNull().defaultNow(),
      updatedAt: timestamp('updated_at').notNull().defaultNow(),
   },
   (t) => [
      index('idx_issue_team').on(t.teamId),
      index('idx_issue_status').on(t.statusId),
      index('idx_issue_project').on(t.projectId),
      index('idx_issue_cycle').on(t.cycleId),
      index('idx_issue_assignee').on(t.assigneeId),
      index('idx_issue_created_by').on(t.createdById),
      index('idx_issue_rank').on(t.rank),
   ]
);

export const issueLabel = pgTable(
   'issue_label',
   {
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      labelId: varchar('label_id', { length: 64 })
         .notNull()
         .references(() => label.id),
   },
   (t) => [
      primaryKey({ columns: [t.issueId, t.labelId] }),
      index('idx_issue_label_label').on(t.labelId),
   ]
);

export const issueContent = pgTable('issue_content', {
   issueId: varchar('issue_id', { length: 36 })
      .primaryKey()
      .references(() => issue.id),
   description: text('description'), // ContentBlock[] (json)
   milestone: varchar('milestone', { length: 196 }),
});

export const issueRelation = pgTable(
   'issue_relation',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      relatedId: varchar('related_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      kind: varchar('kind', { length: 16 }).notNull(), // sub|related|blocked_by
   },
   (t) => [
      index('idx_issue_relation_issue').on(t.issueId),
      index('idx_issue_relation_related').on(t.relatedId),
   ]
);

export const issuePrLink = pgTable('issue_pr_link', {
   id: varchar('id', { length: 36 }).primaryKey(),
   issueId: varchar('issue_id', { length: 36 })
      .notNull()
      .references(() => issue.id),
   title: varchar('title', { length: 512 }).notNull(),
   status: varchar('status', { length: 16 }).notNull(), // open|merged|draft
});

export const comment = pgTable(
   'comment',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      authorId: varchar('author_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      body: text('body').notNull(), // ContentBlock[] (json)
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_comment_issue').on(t.issueId)]
);

export const commentReaction = pgTable(
   'comment_reaction',
   {
      commentId: varchar('comment_id', { length: 36 })
         .notNull()
         .references(() => comment.id),
      emoji: varchar('emoji', { length: 32 }).notNull(),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
   },
   (t) => [primaryKey({ columns: [t.commentId, t.emoji, t.userId] })]
);

export const activityEvent = pgTable(
   'activity_event',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      actorId: varchar('actor_id', { length: 36 }).references(() => appUser.id),
      event: varchar('event', { length: 32 }).notNull(),
      text: varchar('text', { length: 1024 }),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_activity_issue').on(t.issueId)]
);

// ─────────────────────────────────────────────────────────────
// Views / Notifications / Project detail / Documents
// ─────────────────────────────────────────────────────────────
export const savedView = pgTable(
   'saved_view',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      slug: varchar('slug', { length: 96 }).notNull(),
      name: varchar('name', { length: 196 }).notNull(),
      description: text('description'),
      icon: varchar('icon', { length: 16 }),
      type: varchar('type', { length: 16 }).notNull(), // issue|project
      teamId: varchar('team_id', { length: 16 }).references(() => team.id),
      ownerId: varchar('owner_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      filter: text('filter').notNull(), // ViewFilter (json)
      createdAt: timestamp('created_at').notNull().defaultNow(),
      updatedAt: timestamp('updated_at').notNull().defaultNow(),
   },
   (t) => [index('idx_saved_view_owner').on(t.ownerId), index('idx_saved_view_team').on(t.teamId)]
);

export const notification = pgTable(
   'notification',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      issueId: varchar('issue_id', { length: 36 }).references(() => issue.id),
      actorId: varchar('actor_id', { length: 36 }).references(() => appUser.id),
      recipientId: varchar('recipient_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      type: varchar('type', { length: 16 }).notNull(),
      content: varchar('content', { length: 1024 }),
      read: boolean('read').notNull().default(false),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_notification_recipient').on(t.recipientId)]
);

export const projectUpdate = pgTable(
   'project_update',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      projectId: varchar('project_id', { length: 36 })
         .notNull()
         .references(() => project.id),
      authorId: varchar('author_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      health: varchar('health', { length: 16 }).notNull(), // on-track|at-risk|off-track
      blocks: text('blocks').notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_project_update_project').on(t.projectId)]
);

export const projectActivity = pgTable('project_activity', {
   id: varchar('id', { length: 36 }).primaryKey(),
   projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => project.id),
   userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => appUser.id),
   text: varchar('text', { length: 1024 }).notNull(),
   createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const projectMilestone = pgTable('project_milestone', {
   id: varchar('id', { length: 36 }).primaryKey(),
   projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => project.id),
   name: varchar('name', { length: 196 }).notNull(),
   targetDate: date('target_date'),
   completed: boolean('completed').notNull().default(false),
});

export const projectResource = pgTable('project_resource', {
   id: varchar('id', { length: 36 }).primaryKey(),
   projectId: varchar('project_id', { length: 36 })
      .notNull()
      .references(() => project.id),
   label: varchar('label', { length: 196 }).notNull(),
   url: varchar('url', { length: 1024 }).notNull(),
});

export const projectDetail = pgTable('project_detail', {
   projectId: varchar('project_id', { length: 36 })
      .primaryKey()
      .references(() => project.id),
   summary: varchar('summary', { length: 1024 }),
   description: text('description'),
});

export const documentFolder = pgTable('document_folder', {
   id: varchar('id', { length: 64 }).primaryKey(),
   teamId: varchar('team_id', { length: 16 })
      .notNull()
      .references(() => team.id),
   name: varchar('name', { length: 196 }).notNull(),
   icon: varchar('icon', { length: 16 }),
});

// ── Reviews (PRs do GitHub — ingeridos via API) ───────────────────
export const review = pgTable(
   'review',
   {
      id: varchar('id', { length: 128 }).primaryKey(), // repo#prNumber
      title: varchar('title', { length: 512 }).notNull(),
      status: varchar('status', { length: 16 }).notNull(), // open|merged|closed
      repo: varchar('repo', { length: 196 }).notNull(),
      prNumber: integer('pr_number').notNull(),
      url: varchar('url', { length: 512 }),
      author: varchar('author', { length: 128 }),
      targetBranch: varchar('target_branch', { length: 196 }),
      sourceBranch: varchar('source_branch', { length: 196 }),
      additions: integer('additions').notNull().default(0),
      deletions: integer('deletions').notNull().default(0),
      resolvesIdentifier: varchar('resolves_identifier', { length: 32 }),
      resolvesTitle: varchar('resolves_title', { length: 512 }),
      checksPassed: integer('checks_passed').notNull().default(0),
      checksTotal: integer('checks_total').notNull().default(0),
      createdAt: timestamp('created_at').notNull().defaultNow(),
      syncedAt: timestamp('synced_at').notNull().defaultNow(),
   },
   (t) => [index('idx_review_status').on(t.status)]
);

export const teamDocument = pgTable('team_document', {
   id: varchar('id', { length: 36 }).primaryKey(),
   folderId: varchar('folder_id', { length: 64 })
      .notNull()
      .references(() => documentFolder.id),
   name: varchar('name', { length: 196 }).notNull(),
   icon: varchar('icon', { length: 16 }),
   creatorId: varchar('creator_id', { length: 36 })
      .notNull()
      .references(() => appUser.id),
   pinned: boolean('pinned').notNull().default(false),
   createdAt: timestamp('created_at').notNull().defaultNow(),
   updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
