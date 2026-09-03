import {
   pgTable,
   varchar,
   integer,
   boolean,
   date,
   timestamp,
   text,
   jsonb,
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
   // Grupo de labels (paridade Linear): labels no mesmo grupo são mutuamente exclusivas
   // por issue. NULL = label solta. O nome do grupo é a chave (ex.: 'kind', 'area').
   groupId: varchar('group_id', { length: 64 }),
});

export const health = pgTable('health', {
   id: varchar('id', { length: 64 }).primaryKey(),
   name: varchar('name', { length: 128 }).notNull(),
   color: varchar('color', { length: 16 }).notNull(),
   description: varchar('description', { length: 512 }),
});

// Catálogo de status de PROJETO (separado do workflow de issue — paridade Linear:
// Backlog / Planned / In Progress / Completed / Canceled). Antes o projeto reusava
// a tabela `status` das issues.
export const projectStatus = pgTable('project_status', {
   id: varchar('id', { length: 64 }).primaryKey(),
   name: varchar('name', { length: 128 }).notNull(),
   color: varchar('color', { length: 16 }).notNull(),
   category: varchar('category', { length: 32 }).notNull(), // backlog|planned|started|completed|canceled
   position: integer('position').notNull(),
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
   // Handle do GitHub. Sem isto nao ha como ligar um PR (que guarda o LOGIN do GitHub)
   // ao usuario do Circle — era o bloqueio de "For you"/"Created" em Reviews.
   githubLogin: varchar('github_login', { length: 128 }),
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

// Config das notificações de saída pro Slack (singleton, id='default'). Quais
// eventos disparam mensagem no Incoming Webhook (SLACK_WEBHOOK_URL, no env). O
// envio em si é best-effort; estes toggles decidem QUAIS eventos notificam.
export const slackConfig = pgTable('slack_config', {
   id: varchar('id', { length: 16 }).primaryKey(), // 'default'
   onIssueCreated: boolean('on_issue_created').notNull().default(true),
   onIssueCompleted: boolean('on_issue_completed').notNull().default(true),
   onIssueAssigned: boolean('on_issue_assigned').notNull().default(true),
   onPrMerged: boolean('on_pr_merged').notNull().default(true),
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
   // Escala de estimate do time (paridade Linear): fibonacci|exponential|linear|tshirt.
   estimateScale: varchar('estimate_scale', { length: 16 }).notNull().default('fibonacci'),
   // Cool-down (#24): dias entre o fim de um cycle e o início do próximo, sem cycle
   // `current` no meio (paridade Linear). 0 = sem cool-down.
   cycleCooldownDays: integer('cycle_cooldown_days').notNull().default(0),
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
   icon: varchar('icon', { length: 64 }),
   iconColor: varchar('icon_color', { length: 32 }),
   status: varchar('status', { length: 16 }).notNull(), // active|planned|completed
   priorityId: varchar('priority_id', { length: 64 })
      .notNull()
      .references(() => priority.id),
   ownerId: varchar('owner_id', { length: 36 }).references(() => appUser.id),
   /** Rótulo humano do período alvo ("Q3 2026", "H2 2026", "2026", "Sep 2026"). */
   target: varchar('target', { length: 64 }),
   // Datas reais do período: `targetDate` é o fim do período do rótulo (derivada por
   // `targetDateFromLabel`, backfill em 0036_backfill_initiative_dates.sql).
   startDate: date('start_date'),
   targetDate: date('target_date'),
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
         .references(() => projectStatus.id),
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

export const initiativeLabel = pgTable(
   'initiative_label',
   {
      initiativeId: varchar('initiative_id', { length: 36 })
         .notNull()
         .references(() => initiative.id),
      labelId: varchar('label_id', { length: 64 })
         .notNull()
         .references(() => label.id),
   },
   (t) => [primaryKey({ columns: [t.initiativeId, t.labelId] })]
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
   (t) => [
      index('idx_cycle_team').on(t.teamId),
      // Nº de cycle é único por time — barra colisão sob concorrência (dois inserts
      // computando max(number)+1 ao mesmo tempo). O 2º insert falha em vez de duplicar.
      unique('cycle_team_id_number_unique').on(t.teamId, t.number),
   ]
);

// Snapshot diário do cycle (#24): matéria-prima do burn-up real e do `scopeDelta`.
// Sem job — o upsert do dia acontece no rollover (boot) e no GET do detalhe do cycle.
// 1 linha por (cycle, dia); dias sem acesso são interpolados na leitura.
export const cycleSnapshot = pgTable(
   'cycle_snapshot',
   {
      cycleId: varchar('cycle_id', { length: 36 })
         .notNull()
         .references(() => cycle.id, { onDelete: 'cascade' }),
      date: date('date').notNull(),
      scope: integer('scope').notNull(),
      started: integer('started').notNull(),
      completed: integer('completed').notNull(),
   },
   (t) => [primaryKey({ columns: [t.cycleId, t.date] })]
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
      // Milestone estruturada (paridade Linear): FK p/ project_milestone. Substitui o
      // texto livre issue_content.milestone. NULL = sem milestone.
      milestoneId: varchar('milestone_id', { length: 36 }),
      // Snooze da issue (paridade Linear/triage): enquanto > now, some da fila de triage.
      snoozedUntil: timestamp('snoozed_until'),
      // Marcos temporais p/ métricas (cycle/lead time). startedAt = 1ª entrada em status
      // 'started' (sticky); completedAt = entrada em 'completed' (limpo se reaberto).
      startedAt: timestamp('started_at'),
      completedAt: timestamp('completed_at'),
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
   description: text('description'), // projeção em texto (markdown) — busca, API antiga
   // Documento ProseMirror (JSON) do editor de blocos. NULL = só há a projeção em texto.
   descriptionDoc: jsonb('description_doc').$type<Record<string, unknown>>(),
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

// Assinatura de issue (Linear-style): quem recebe atualizações e vê a issue na
// aba "Subscribed"/"Activity" do My issues. Auto-assinada em create/assign/comment/
// mention; PK composta (uma linha por issue+user).
export const issueSubscription = pgTable(
   'issue_subscription',
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
      index('idx_issue_subscription_user').on(t.userId),
   ]
);

// Múltiplos responsáveis (#96): `issue.assignee_id` segue como o PRINCIPAL (contrato
// atual intacto); esta tabela guarda o conjunto completo (principal incluído).
// `created_at` dá a ordem de adição dos colaboradores.
export const issueAssignee = pgTable(
   'issue_assignee',
   {
      issueId: varchar('issue_id', { length: 36 })
         .notNull()
         .references(() => issue.id, { onDelete: 'cascade' }),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [
      primaryKey({ columns: [t.issueId, t.userId] }),
      index('idx_issue_assignee_user').on(t.userId),
   ]
);

// Favoritos do usuário (paridade Linear): pin heterogêneo de issue/project/view
// numa seção dedicada da sidebar. Integridade app-level (sem FK polimorfica) —
// entidade removida é limpa no resolve/list. `position` p/ ordenação (drag futuro).
export const favorite = pgTable(
   'favorite',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      entityType: varchar('entity_type', { length: 16 }).notNull(), // issue | project | view
      entityId: varchar('entity_id', { length: 36 }).notNull(),
      position: integer('position').notNull().default(0),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [
      unique('uniq_favorite_user_entity').on(t.userId, t.entityType, t.entityId),
      index('idx_favorite_user').on(t.userId),
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
      /** Comentário-pai (threading, paridade Linear). NULL = comentário raiz. */
      parentId: varchar('parent_id', { length: 36 }),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_comment_issue').on(t.issueId), index('idx_comment_parent').on(t.parentId)]
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
      /** Adiado até este instante (paridade Linear "snooze"): enquanto > now, some do
       * inbox e não conta como não-lida; NULL = nunca adiada. */
      snoozedUntil: timestamp('snoozed_until'),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_notification_recipient').on(t.recipientId)]
);

// Audit log append-only no nível workspace (paridade Linear): quem fez o quê nas
// ações administrativas (role change, criar/excluir time, add/remove membro, join-request).
export const auditLog = pgTable(
   'audit_log',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      actorId: varchar('actor_id', { length: 36 }).references(() => appUser.id),
      action: varchar('action', { length: 48 }).notNull(), // role.change|team.create|...
      targetType: varchar('target_type', { length: 24 }), // team|member|...
      targetId: varchar('target_id', { length: 64 }),
      meta: text('meta'), // JSON opcional (ex.: {from,to})
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_audit_log_created').on(t.createdAt)]
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

// Updates de INITIATIVE (espelha project_update; health do último update propaga p/
// initiative.healthId, paridade Linear).
export const initiativeUpdate = pgTable(
   'initiative_update',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      initiativeId: varchar('initiative_id', { length: 36 })
         .notNull()
         .references(() => initiative.id),
      authorId: varchar('author_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      health: varchar('health', { length: 16 }).notNull(), // on-track|at-risk|off-track
      blocks: text('blocks').notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_initiative_update_initiative').on(t.initiativeId)]
);

/**
 * Feed de alterações da iniciativa — espelha `project_activity`. Uma linha por update,
 * resumindo os campos que mudaram (o "changed status, owner" do Linear). Distinto de
 * `initiative_update`, que é o post editorial de health escrito à mão.
 */
/**
 * Convite de acesso ao Circle. Existe porque o acesso normal vem do grupo Keycloak
 * `app-circle` (concedido no Orbis), e havia dois buracos: quem foi concedido mas ainda
 * nao logou nao aparece em lugar nenhum, e quem nao foi concedido nao tem caminho.
 *
 * Um convite valido e uma EXCECAO ao grupo no `signIn` (ver `auth.ts`) — dispensa a
 * associacao ao grupo, NUNCA a autenticacao: a pessoa ainda precisa logar no Keycloak
 * como usuario @nimbloo.ai real. Single-use (`acceptedAt`) e com validade.
 *
 * Tabela separada de propositalmente NAO ser `app_user`: criar linha de usuario para
 * quem nunca logou foi o que gerou "membro fantasma" na lista e nos seletores.
 */
export const invite = pgTable(
   'invite',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      // Normalizado (trim + lowercase) na escrita; unico para nao acumular convite
      // duplicado do mesmo e-mail — reconvidar renova o token e a validade.
      email: varchar('email', { length: 255 }).notNull().unique(),
      token: varchar('token', { length: 64 }).notNull().unique(),
      invitedById: varchar('invited_by_id', { length: 36 }).references(() => appUser.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
      expiresAt: timestamp('expires_at').notNull(),
      acceptedAt: timestamp('accepted_at'),
   },
   // Lookup por token (magic link) e por email (gate do signIn, a cada login).
   (t) => [index('idx_invite_token').on(t.token), index('idx_invite_email').on(t.email)]
);

export const initiativeActivity = pgTable(
   'initiative_activity',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      initiativeId: varchar('initiative_id', { length: 36 })
         .notNull()
         .references(() => initiative.id),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      text: varchar('text', { length: 1024 }).notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_initiative_activity_initiative').on(t.initiativeId, t.createdAt)]
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
   description: text('description'), // ContentBlock[] (json) — projeção legada
   // Documento ProseMirror (JSON) do editor de blocos. NULL = só há a projeção em blocos.
   descriptionDoc: jsonb('description_doc').$type<Record<string, unknown>>(),
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
      // Logins do GitHub solicitados como reviewer, em CSV. Lista curta e so lida por
      // igualdade — nao justifica tabela filha.
      requestedReviewers: varchar('requested_reviewers', { length: 512 }),
      resolvesIdentifier: varchar('resolves_identifier', { length: 32 }),
      resolvesTitle: varchar('resolves_title', { length: 512 }),
      checksPassed: integer('checks_passed').notNull().default(0),
      checksTotal: integer('checks_total').notNull().default(0),
      createdAt: timestamp('created_at').notNull().defaultNow(),
      syncedAt: timestamp('synced_at').notNull().defaultNow(),
      // Quando arquivos/commits foram buscados (sync, webhook ou sob demanda no detalhe).
      // Null = nunca tentou; a abertura do detalhe tenta UMA vez e marca, com ou sem sucesso.
      depthSyncedAt: timestamp('depth_synced_at'),
      // Guia de review gerado a partir do diff: JSON { sections, generatedAt, model }.
      guide: text('guide'),
   },
   (t) => [index('idx_review_status').on(t.status)]
);

/**
 * Arquivos de um PR (GET /pulls/{n}/files). `patch` é o unified diff que o GitHub
 * devolve por arquivo — null para binários/arquivos grandes (o GitHub omite).
 * Substituído por inteiro a cada sync do PR (sem histórico).
 */
export const reviewFile = pgTable(
   'review_file',
   {
      reviewId: varchar('review_id', { length: 128 })
         .notNull()
         .references(() => review.id, { onDelete: 'cascade' }),
      path: varchar('path', { length: 512 }).notNull(),
      status: varchar('status', { length: 16 }).notNull(), // added|modified|removed|renamed
      additions: integer('additions').notNull().default(0),
      deletions: integer('deletions').notNull().default(0),
      patch: text('patch'),
   },
   (t) => [primaryKey({ columns: [t.reviewId, t.path] })]
);

/** Commits de um PR (GET /pulls/{n}/commits), substituídos por inteiro a cada sync. */
export const reviewCommit = pgTable(
   'review_commit',
   {
      reviewId: varchar('review_id', { length: 128 })
         .notNull()
         .references(() => review.id, { onDelete: 'cascade' }),
      sha: varchar('sha', { length: 40 }).notNull(),
      message: varchar('message', { length: 512 }).notNull(),
      author: varchar('author', { length: 128 }),
      committedAt: timestamp('committed_at'),
   },
   (t) => [primaryKey({ columns: [t.reviewId, t.sha] })]
);

/**
 * Comentários de review (thread do PR no Circle): gerais (`path`/`line` nulos), por
 * arquivo (`path` preenchido) ou ancorados numa linha do diff (`path` + `line`, linha do
 * arquivo NOVO). `kind` registra o veredito — `approve`/`request_changes` são comentários
 * com peso de decisão; o último deles é o veredito corrente do review.
 */
export const reviewComment = pgTable(
   'review_comment',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      reviewId: varchar('review_id', { length: 128 })
         .notNull()
         .references(() => review.id, { onDelete: 'cascade' }),
      authorId: varchar('author_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      path: varchar('path', { length: 512 }),
      line: integer('line'),
      kind: varchar('kind', { length: 16 }).notNull().default('comment'), // comment|approve|request_changes
      body: text('body').notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
      updatedAt: timestamp('updated_at').notNull().defaultNow(),
   },
   (t) => [index('idx_review_comment_review').on(t.reviewId)]
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
      statusId: varchar('status_id', { length: 64 }).references(() => projectStatus.id),
      priorityId: varchar('priority_id', { length: 64 }).references(() => priority.id),
      healthId: varchar('health_id', { length: 64 }).references(() => health.id),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_project_template_team').on(t.teamId)]
);

// ── Agent (chat com IA — Bedrock) — conversas persistidas ────────────────
export const agentChat = pgTable(
   'agent_chat',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      userId: varchar('user_id', { length: 36 })
         .notNull()
         .references(() => appUser.id),
      title: varchar('title', { length: 256 }).notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
      updatedAt: timestamp('updated_at').notNull().defaultNow(),
   },
   (t) => [index('idx_agent_chat_user').on(t.userId)]
);

export const agentMessage = pgTable(
   'agent_message',
   {
      id: varchar('id', { length: 36 }).primaryKey(),
      chatId: varchar('chat_id', { length: 36 })
         .notNull()
         .references(() => agentChat.id),
      role: varchar('role', { length: 16 }).notNull(), // user|assistant
      content: text('content').notNull(),
      createdAt: timestamp('created_at').notNull().defaultNow(),
   },
   (t) => [index('idx_agent_message_chat').on(t.chatId, t.createdAt)]
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
