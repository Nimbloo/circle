import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@/store/preferences-store';
import { DEFAULT_NOTIFICATION_PREFS } from '@/store/notification-prefs-store';

/**
 * Nenhum controle morto em Settings: toda chave de `DEFAULT_PREFERENCES` (e das
 * preferências de notificação) precisa ser LIDA em algum ponto do app além de onde ela é
 * declarada (store), validada (schema do servidor), sincronizada (user-settings-sync) ou
 * editada (telas de Settings). Preferência nova sem consumidor = remova a opção ou
 * implemente o efeito.
 */
const ROOTS = ['app', 'components', 'lib', 'store', 'hooks'];
const EXCLUDED = [
   join('store', 'preferences-store.ts'),
   join('store', 'notification-prefs-store.ts'),
   join('lib', 'api', 'settings.ts'),
   // Só leva o blob ao servidor e de volta: ler a chave ali não é efeito.
   join('lib', 'user-settings-sync.ts'),
   join('components', 'common', 'settings') + sep,
];

function sourceFiles(directory: string): string[] {
   return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(path) ? [path] : [];
   });
}

function unusedKeys(keys: string[]): string[] {
   const sources = ROOTS.flatMap((dir) => sourceFiles(join(process.cwd(), dir)))
      .filter((file) => {
         const rel = relative(process.cwd(), file);
         return !EXCLUDED.some((ex) => (ex.endsWith(sep) ? rel.startsWith(ex) : rel === ex));
      })
      .map((file) => readFileSync(file, 'utf8'));
   return keys.filter((key) => !sources.some((source) => new RegExp(`\\b${key}\\b`).test(source)));
}

describe('preferências consumidas', () => {
   it('toda chave de DEFAULT_PREFERENCES é lida fora do store/schema/telas de Settings', () => {
      expect(unusedKeys(Object.keys(DEFAULT_PREFERENCES))).toEqual([]);
   });

   it('toda chave de Settings → Notifications tem efeito real', () => {
      expect(unusedKeys(Object.keys(DEFAULT_NOTIFICATION_PREFS))).toEqual([]);
   });
});
