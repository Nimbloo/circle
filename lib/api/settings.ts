import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { userSettings } from '@/db/schema';
import { ApiError } from './errors';
import { MAX_SETTINGS_BYTES } from '@/lib/settings-limits';
import type { DetailPanelKind } from '@/store/detail-panel-store';

export { MAX_SETTINGS_BYTES };

/**
 * Settings por-usuário: um blob JSON (tema, preferências de notificação, etc.)
 * armazenado em `user_settings.data`. A fonte da verdade é o banco; o
 * localStorage do cliente é só cache/fallback.
 */
export type UserSettings = Record<string, unknown>;

/**
 * Schema fechado do blob de settings (espelha `SettingsBlob` de user-settings-sync.ts).
 * `.strict()` rejeita chaves desconhecidas → evita gravar lixo arbitrário no `data`.
 */
const ThemeSchema = z
   .object({
      mode: z.string().optional(),
      lightVariant: z.string().optional(),
      darkVariant: z.string().optional(),
      custom: z
         .object({
            accent: z.string().optional(),
            background: z.string().optional(),
            contrast: z.number().optional(),
            sidebar: z.boolean().optional(),
            sidebarAccent: z.string().optional(),
            sidebarBackground: z.string().optional(),
            sidebarContrast: z.number().optional(),
         })
         .strict()
         .optional(),
   })
   .strict();

const NotificationsSchema = z
   .object({
      // Master switch dos e-mails transacionais (menção/comentário/etc). Default true;
      // honrada em dispatchNotification (o in-app sempre grava, só o e-mail respeita).
      emailNotifications: z.boolean().optional(),
      // Toggle dos alertas via Slack; o cliente (user-settings-sync) sempre envia
      // esta chave e o backend (notify.ts) a lê — precisa estar no schema senão o
      // .strict() rejeita TODO o save de settings com 400.
      slackNotifications: z.boolean().optional(),
      showUpdatesInSidebar: z.boolean().optional(),
      changelogNewsletter: z.boolean().optional(),
      marketing: z.boolean().optional(),
      inviteAccepted: z.boolean().optional(),
      privacyLegal: z.boolean().optional(),
   })
   .strict();

/**
 * Preferências das telas de Settings sem subsistema dedicado (Preferences,
 * Code & reviews, AI & Agents, Agent personalization). Espelha `Preferences`
 * de store/preferences-store.ts. `.strict()` rejeita chaves desconhecidas.
 * Selects guardam o rótulo (string); toggles guardam boolean.
 */
const PreferencesSchema = z
   .object({
      defaultHomeView: z.string().optional(),
      displayNames: z.string().optional(),
      firstDayOfWeek: z.string().optional(),
      convertEmoticons: z.boolean().optional(),
      sendCommentsOn: z.string().optional(),
      fontSize: z.string().optional(),
      pointerCursors: z.boolean().optional(),
      underlineLinks: z.boolean().optional(),
      autoAssignSelf: z.boolean().optional(),
      assignSelfOnStart: z.boolean().optional(),
      codeReviewsEnabled: z.boolean().optional(),
      autoConvertDrafts: z.boolean().optional(),
      mergeStrategy: z.string().optional(),
      codeTheme: z.string().optional(),
      codeFont: z.string().optional(),
      reviewComments: z.string().optional(),
      reviewRequests: z.boolean().optional(),
      githubTeamRequests: z.boolean().optional(),
      checksMergeQueue: z.boolean().optional(),
      requireSignedCommits: z.boolean().optional(),
      gitAttachmentFormat: z.string().optional(),
      gitBranchCopyMoveStarted: z.boolean().optional(),
      openCodingToolMoveStarted: z.boolean().optional(),
      aiUsageFeedback: z.boolean().optional(),
      agentGuidance: z.string().max(8000).optional(),
   })
   .strict();

/**
 * Layout por-usuário (o que antes vivia só no localStorage): opções de display e
 * list/board por view, times abertos na sidebar, customização da sidebar, painéis
 * de detalhe e largura da lista do inbox. Espelha `LayoutBlob` de
 * user-settings-sync.ts e os stores correspondentes; enums repetidos aqui de
 * propósito (o servidor não importa store de UI).
 */
const ViewDisplaySchema = z
   .object({
      grouping: z.enum(['status', 'assignee', 'priority', 'project', 'label', 'none']).optional(),
      ordering: z.enum(['priority', 'created', 'title', 'manual', 'dueDate']).optional(),
      orderCompletedByRecency: z.boolean().optional(),
      completedIssues: z.enum(['all', 'none']).optional(),
      showEmptyGroups: z.boolean().optional(),
      showSubIssues: z.boolean().optional(),
      displayProperties: z
         .object({
            id: z.boolean().optional(),
            status: z.boolean().optional(),
            priority: z.boolean().optional(),
            assignee: z.boolean().optional(),
            labels: z.boolean().optional(),
            project: z.boolean().optional(),
            estimate: z.boolean().optional(),
            dueDate: z.boolean().optional(),
            created: z.boolean().optional(),
            cycle: z.boolean().optional(),
         })
         .strict()
         .optional(),
   })
   .strict();

const SidebarVisibilitySchema = z.enum(['always', 'badged', 'never']);

/** Espelha `DetailPanelKind` (store/detail-panel-store.ts); chave nova entra nos dois. */
const DetailPanelKindSchema = z.enum([
   'initiative',
   'project',
   'issue',
   'member',
] as const satisfies readonly DetailPanelKind[]);

const LayoutSchema = z
   .object({
      displayByView: z.record(z.string(), ViewDisplaySchema).optional(),
      viewTypeByView: z.record(z.string(), z.enum(['list', 'grid'])).optional(),
      sidebarTeams: z
         .object({ openById: z.record(z.string(), z.boolean()) })
         .strict()
         .optional(),
      sidebarPrefs: z
         .object({
            badgeStyle: z.enum(['count', 'dot']).optional(),
            visibility: z.record(z.string(), SidebarVisibilitySchema).optional(),
            order: z.record(z.string(), z.array(z.string())).optional(),
         })
         .strict()
         .optional(),
      detailPanels: z
         .object({ openByKind: z.record(DetailPanelKindSchema, z.boolean()) })
         .strict()
         .optional(),
      inboxListWidth: z.number().nonnegative().optional(),
   })
   .strict();

export const SettingsSchema = z
   .object({
      theme: ThemeSchema.optional(),
      notifications: NotificationsSchema.optional(),
      preferences: PreferencesSchema.optional(),
      layout: LayoutSchema.optional(),
   })
   .strict();

/** Lê as settings do usuário (parse do JSON). Default `{}` se não existir ou for inválido. */
export async function getUserSettings(db: Db, userId: string): Promise<UserSettings> {
   const rows = await db
      .select({ data: userSettings.data })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
   if (rows.length === 0) return {};
   try {
      const parsed = JSON.parse(rows[0].data);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
         ? (parsed as UserSettings)
         : {};
   } catch {
      return {};
   }
}

/** Grava (upsert) as settings do usuário, serializando o objeto em JSON. */
export async function putUserSettings(
   db: Db,
   userId: string,
   data: UserSettings
): Promise<UserSettings> {
   const serialized = JSON.stringify(data ?? {});
   if (Buffer.byteLength(serialized, 'utf8') > MAX_SETTINGS_BYTES) {
      throw new ApiError(413, 'Settings excedem o tamanho máximo');
   }
   await db
      .insert(userSettings)
      .values({ userId, data: serialized, updatedAt: new Date() })
      .onConflictDoUpdate({
         target: userSettings.userId,
         set: { data: serialized, updatedAt: new Date() },
      });
   return data ?? {};
}
