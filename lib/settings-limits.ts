/**
 * Teto do blob de settings serializado (~32KB). `user_settings.data` é `text` — sem
 * cap, aceitaria MB. Vive fora de lib/api para o cliente (user-settings-sync) poder
 * respeitar o mesmo limite sem puxar o drizzle pro bundle.
 */
export const MAX_SETTINGS_BYTES = 32 * 1024;
