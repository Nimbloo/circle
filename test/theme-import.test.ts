import { describe, expect, it } from 'vitest';
import { parseImportedTheme } from '@/lib/theme-import';
import { SettingsSchema } from '@/lib/api/settings';
import { DEFAULT_CUSTOM } from '@/store/theme-store';

/**
 * Ad#5 — tema importado do clipboard ia direto para o store: um campo fora do schema
 * fechado do servidor fazia TODA gravação de settings voltar 400, em silêncio. Agora o
 * tema é validado antes de aplicar e o resultado sempre passa no schema do servidor.
 */
describe('parseImportedTheme (Ad#5)', () => {
   it('aceita um tema válido (parcial completa com o default)', () => {
      const theme = parseImportedTheme(JSON.stringify({ accent: '#112233', contrast: 30 }));
      expect(theme).toEqual({ ...DEFAULT_CUSTOM, accent: '#112233', contrast: 30 });
      expect(() => SettingsSchema.parse({ theme: { custom: theme } })).not.toThrow();
   });

   it('recusa cor inválida, número fora da faixa, chave desconhecida e não-objeto', () => {
      expect(parseImportedTheme('{"accent":"red"}')).toBeNull();
      expect(parseImportedTheme('{"contrast":500}')).toBeNull();
      expect(parseImportedTheme('{"accent":"#112233","evil":1}')).toBeNull();
      expect(parseImportedTheme('[1,2]')).toBeNull();
      expect(parseImportedTheme('não é json')).toBeNull();
   });
});
