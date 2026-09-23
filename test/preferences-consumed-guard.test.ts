import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@/store/preferences-store';

/**
 * Nenhum controle morto em Settings: toda chave de `DEFAULT_PREFERENCES` precisa ser LIDA
 * em algum ponto do app além de onde ela é declarada (store), validada (schema do
 * servidor) ou editada (telas de Settings). Preferência nova sem consumidor = remova a
 * opção ou implemente o efeito.
 */
const ROOTS = ['app', 'components', 'lib', 'store', 'hooks'];
const EXCLUDED = [
   join('store', 'preferences-store.ts'),
   join('lib', 'api', 'settings.ts'),
   join('components', 'common', 'settings') + sep,
];

function sourceFiles(directory: string): string[] {
   return readdirSync(directory).flatMap((entry) => {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(path) ? [path] : [];
   });
}

describe('preferências consumidas', () => {
   it('toda chave de DEFAULT_PREFERENCES é lida fora do store/schema/telas de Settings', () => {
      const sources = ROOTS.flatMap((dir) => sourceFiles(join(process.cwd(), dir)))
         .filter((file) => {
            const rel = relative(process.cwd(), file);
            return !EXCLUDED.some((ex) => (ex.endsWith(sep) ? rel.startsWith(ex) : rel === ex));
         })
         .map((file) => readFileSync(file, 'utf8'));

      const unused = Object.keys(DEFAULT_PREFERENCES).filter(
         (key) => !sources.some((source) => new RegExp(`\\b${key}\\b`).test(source))
      );

      expect(unused).toEqual([]);
   });
});
