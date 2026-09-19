import { z } from 'zod';
import { DEFAULT_CUSTOM, type CustomTheme } from '@/store/theme-store';

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const Percent = z.number().min(0).max(100);

/** Tema custom importável: mesmas chaves do `CustomTheme`, com cores e faixas válidas. */
const ImportedThemeSchema = z
   .object({
      accent: Hex.optional(),
      background: Hex.optional(),
      contrast: Percent.optional(),
      sidebar: z.boolean().optional(),
      sidebarAccent: Hex.optional(),
      sidebarBackground: Hex.optional(),
      sidebarContrast: Percent.optional(),
   })
   .strict();

/**
 * Valida o tema colado do clipboard ANTES de aplicar (Ad#5) e completa com o default.
 * `null` = inválido: a tela avisa e não toca no store (senão o blob inválido fazia toda
 * gravação de settings voltar 400).
 */
export function parseImportedTheme(text: string): CustomTheme | null {
   try {
      const parsed = ImportedThemeSchema.safeParse(JSON.parse(text));
      return parsed.success ? { ...DEFAULT_CUSTOM, ...parsed.data } : null;
   } catch {
      return null;
   }
}
