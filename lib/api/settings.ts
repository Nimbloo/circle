import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { userSettings } from '@/db/schema';
import { ApiError } from './errors';

/**
 * Settings por-usuário: um blob JSON (tema, preferências de notificação, etc.)
 * armazenado em `user_settings.data`. A fonte da verdade é o banco; o
 * localStorage do cliente é só cache/fallback.
 */
export type UserSettings = Record<string, unknown>;

/** Teto do blob serializado (~32KB). `user_settings.data` é `text` — sem cap, aceitaria MB. */
export const MAX_SETTINGS_BYTES = 32 * 1024;

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
      showUpdatesInSidebar: z.boolean().optional(),
      changelogNewsletter: z.boolean().optional(),
      marketing: z.boolean().optional(),
      inviteAccepted: z.boolean().optional(),
      privacyLegal: z.boolean().optional(),
   })
   .strict();

export const SettingsSchema = z
   .object({
      theme: ThemeSchema.optional(),
      notifications: NotificationsSchema.optional(),
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
