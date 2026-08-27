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
   unique,
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
   passwordHash: varchar('password_hash', { length: 255 }), // nullable — login por credenciais (bcrypt); null = só SSO/convite pendente
   inviteToken: varchar('invite_token', { length: 64 }), // nullable — token single-use do convite; null = SSO ou já resgatado
   avatarUrl: varchar('avatar_url', { length: 512 }),
   role: varchar('role', { length: 16 }).notNull().default('Member'), // Member|Admin|Guest|Application
   presence: varchar('presence', { length: 16 }).notNull().default('offline'),
   timezone: varchar('timezone', { length: 64 }),
   joinedAt: date('joined_at').notNull(),
   createdAt: timestamp('created_at').notNull().defaultNow(),
   updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Settings por-usuário (JSON serializado em `data`). Fonte da verdade
// server-side de preferências (tema, notificações) — o localStorage vira cache.
export const userSettings = pgTable('user_settings', {
   userId: varchar('user_id', { length: 36 })
      .primaryKey()
      .references(() => appUser.id),
   data: text('data').notNull().default('{}'),
   updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Foto de perfil (avatar) enviada pelo usuário, armazenada self-contained no
// banco como data-URL base64. Servida por /api/v1/users/{id}/avatar; o
// `app_user.avatar_url` aponta pra esse endpoint. Linha 1:1 com o usuário (PK = userId).
export const userAvatar = pgTable('user_avatar', {
   userId: varchar('user_id', { length: 36 })
      .primaryKey()
      .references(() => appUser.id),
   data: text('data').notNull(), // imagem em base64 (payload do data-URL, sem o prefixo)
   contentType: varchar('content_type', { length: 64 }).notNull(),
   updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const team = pgTable('team', {
   id: varchar('id', { length: 16 }).primaryKey(), // key curta (CORE, DESIGN)
   name: varchar('name', { length: 128 }).notNull(),
   icon: varchar('icon', { length: 16 }),
   color: varchar('color', { length: 16 }),
   issueSeq: integer('issue_seq').notNull().default(0), // contador p/ identifier <KEY>-<n>
   // ── Configuração de Cycles (estilo Linear: automáticos e repetitivos) ──
   /** Cycles habilitados no time → o schedule é auto-gerado. */
   cyclesEnabled: boolean('cycles_enabled').notNull().default(false),
   /** Duração de cada ciclo em semanas (1–8). */
   cycleDurationWeeks: integer('cycle_duration_weeks').notNull().default(2),
   /** Dia da semana em que o ciclo começa (0=domingo … 6=sábado). */
   cycleStartDay: integer('cycle_start_day').notNull().default(1),
   /** Cooldown em semanas entre ciclos (0 = sem cooldown). */
   cycleCooldownWeeks: integer('cycle_cooldown_weeks').notNull().default(0),
   /** Quantos ciclos futuros manter pré-criados (1–15). */
   cycleUpcomingCount: integer('cycle_upcoming_count').notNull().default(2),
   /** Auto-add: issues iniciadas entram no ciclo corrente automaticamente. */
   cycleAutoAdd: boolean('cycle_auto_add').notNull().default(true),
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

// Solicitação de entrada num time (Linear-style "request to join"). Um usuário pede,
// um admin aprova (vira team_member) ou nega. 1 linha por (team,user) — re-pedido
// reusa a linha (volta pra pending). Convite direto pelo admin NÃO passa por aqui.
export const teamJoinRequest = pgTable(
   'team_join_request',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      teamId: varchar('team_id', { length: 16 })
         .notNull()
         .references(() => team.id),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      status: varchar('status', { length: 16 }).notNull().default('pending'), // pending|approved|denied
      createdAt: timestamp('created_at').notNull().defaultNow(),
      decidedAt: timestamp('decided_at'),
      decidedBy: varchar('decided_by', { length: 36 }).references(() => appUser.id),
   },
   (t) => [
      unique('team_join_request_team_user_unique').on(t.teamId, t.userId),
      index('idx_team_join_request_team').on(t.teamId),
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
      status: varchar('status', { length: 16 }).notNull(), // legado: status agora é DERIVADO das datas
      startDate: date('start_date').notNull(),
      endDate: date('end_date').notNull(),
      capacity: integer('capacity').notNull().default(0),
      /** Cooldown (semanas) que SEGUE este ciclo — pra desenhar o gap "Cycles paused". */
      cooldownWeeks: integer('cooldown_weeks').notNull().default(0),
      /** Snapshot histórico congelado no fechamento do ciclo (Linear preserva o gráfico
       *  do ciclo completo). NULL enquanto não fechou → usa agregado ao vivo. */
      snapshotScope: integer('snapshot_scope'),
      snapshotStarted: integer('snapshot_started'),
      snapshotCompleted: integer('snapshot_completed'),
   },
   (t) => [
      index('idx_cycle_team').on(t.teamId),
      // Nº de cycle é único por time — barra colisão sob concorrência (dois inserts
      // computando max(number)+1 ao mesmo tempo). O 2º insert falha em vez de duplicar.
      unique('cycle_team_id_number_unique').on(t.teamId, t.number),
   ]
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
      // Card originado de um erro do Sentry: id da issue do Sentry (dedup/idempotência).
      // Nullable (issues normais = null); único → replay/retry do Sentry não duplica card.
      sentryIssueId: varchar('sentry_issue_id', { length: 128 }),
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
      unique('issue_sentry_issue_id_unique').on(t.sentryIssueId),
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

/** Resources de uma issue (estilo Linear): "Add link" / "Add document" — um label +
 *  URL externa. Mesmo modelo do `projectResource`. `kind` distingue link vs document
 *  (só afeta o ícone/rotulagem no UI). */
export const issueResource = pgTable(
   'issue_resource',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      kind: varchar('kind', { length: 16 }).notNull().default('link'), // link|document
      label: varchar('label', { length: 196 }).notNull(),
      url: varchar('url', { length: 1024 }).notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_issue_resource_issue').on(t.issueId)]
);

/** Followers de uma issue: recebem notificação in-app da atividade (comentário,
 *  mudança de status/priority/assignee/cycle/project) mesmo sem serem o responsável.
 *  Auto-preenchida (criador/assignee/autor de comentário/@mencionado) + toggle manual. */
export const issueSubscriber = pgTable(
   'issue_subscriber',
   {
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [
      primaryKey({ columns: [t.issueId, t.userId] }),
      index('idx_issue_subscriber_issue').on(t.issueId),
   ]
);

/** Issues favoritadas por usuário (estrela) — aparecem em destaque. Toggle manual. */
export const issueFavorite = pgTable(
   'issue_favorite',
   {
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [
      primaryKey({ columns: [t.issueId, t.userId] }),
      index('idx_issue_favorite_user').on(t.userId),
   ]
);

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

/** Documentos (estilo Linear): entidade própria com título + conteúdo, editável numa
 *  página dedicada. Criar um "document" numa issue cria a linha aqui e um issue_resource
 *  (kind='document') apontando para /[orgId]/document/[id]. */
export const document = pgTable('document', {
   id: varchar('id', { length: 36 }).primaryKey(),
   title: varchar('title', { length: 512 }).notNull().default('Untitled document'),
   content: text('content').notNull().default(''),
   createdById: varchar('created_by_id', { length: 36 }).references(() => appUser.id),
   createdAt: timestamp('created_at').notNull().defaultNow(),
   updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** Anexos de uma issue ("Attach images, files, or videos", estilo Linear).
 *  Self-contained (mesmo padrão do avatar): os bytes vivem no banco em base64 e são
 *  servidos por `GET /api/v1/issues/{id}/attachments/{aid}`. O detail carrega só o
 *  METADADO (nunca o blob) — os bytes só saem pelo endpoint de servir. */
export const attachment = pgTable(
   'attachment',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      uploaderId: varchar('uploader_id', { length: 36 }).references(() => appUser.id),
      name: varchar('name', { length: 512 }).notNull(),
      contentType: varchar('content_type', { length: 128 }).notNull(),
      size: integer('size').notNull(),
      data: text('data').notNull(), // base64 (payload, sem o prefixo data-URL)
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_attachment_issue').on(t.issueId)]
);

/** Reactions a nível de ISSUE (o "Add reaction" abaixo da descrição, estilo Linear).
 *  Mesmo modelo do `commentReaction`, mas escopado à issue. */
export const issueReaction = pgTable(
   'issue_reaction',
   {
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id),
      emoji: varchar('emoji', { length: 32 }).notNull(),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
   },
   (t) => [primaryKey({ columns: [t.issueId, t.emoji, t.userId] })]
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
      /** Notificação adiada: fica oculta do inbox até esse instante (null = não adiada). */
      snoozedUntil: timestamp('snoozed_until'),
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

export const projectActivity = pgTable(
   'project_activity',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      projectId: varchar('project_id', { length: 36 })
         .notNull()
         .references(() => project.id),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      text: varchar('text', { length: 1024 }).notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   // Consultado por projectId ORDER BY createdAt desc (feed de atividade do projeto).
   (t) => [index('idx_project_activity_project').on(t.projectId, t.createdAt)]
);

export const projectMilestone = pgTable(
   'project_milestone',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      projectId: varchar('project_id', { length: 36 })
         .notNull()
         .references(() => project.id),
      name: varchar('name', { length: 196 }).notNull(),
      targetDate: date('target_date'),
      completed: boolean('completed').notNull().default(false),
   },
   (t) => [index('idx_project_milestone_project').on(t.projectId)]
);

export const projectResource = pgTable(
   'project_resource',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      projectId: varchar('project_id', { length: 36 })
         .notNull()
         .references(() => project.id),
      label: varchar('label', { length: 196 }).notNull(),
      url: varchar('url', { length: 1024 }).notNull(),
   },
   (t) => [index('idx_project_resource_project').on(t.projectId)]
);

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

/** Templates de issue por time: pré-preenchem título/descrição/status/prioridade no New Issue. */
export const issueTemplate = pgTable(
   'issue_template',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      teamId: varchar('team_id', { length: 36 })
         .notNull()
         .references(() => team.id),
      name: varchar('name', { length: 128 }).notNull(),
      title: varchar('title', { length: 512 }),
      description: text('description'),
      statusId: varchar('status_id', { length: 64 }).references(() => status.id),
      priorityId: varchar('priority_id', { length: 64 }).references(() => priority.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_issue_template_team').on(t.teamId)]
);

/** Templates de projeto por time: pré-preenchem nome/descrição/status/prioridade/health no novo projeto. */
export const projectTemplate = pgTable(
   'project_template',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      teamId: varchar('team_id', { length: 36 })
         .notNull()
         .references(() => team.id),
      name: varchar('name', { length: 128 }).notNull(),
      projectName: varchar('project_name', { length: 256 }),
      description: text('description'),
      statusId: varchar('status_id', { length: 64 }).references(() => status.id),
      priorityId: varchar('priority_id', { length: 64 }).references(() => priority.id),
      healthId: varchar('health_id', { length: 64 }).references(() => health.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_project_template_team').on(t.teamId)]
);

/** Emojis customizados do workspace (imagem no S3/CDN), usados em reações. */
export const customEmoji = pgTable('custom_emoji', {
   id: varchar('id', { length: 36 }).primaryKey(),
   shortcode: varchar('shortcode', { length: 64 }).notNull().unique(),
   s3Key: varchar('s3_key', { length: 256 }).notNull(),
   url: varchar('url', { length: 512 }).notNull(),
   contentType: varchar('content_type', { length: 64 }).notNull(),
   createdBy: varchar('created_by', { length: 36 }).references(() => appUser.id),
   createdAt: timestamp('created_at').notNull().defaultNow(),
});
