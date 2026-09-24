import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * ad#8: toda tela de settings usa o `SettingsCard` do `shared.tsx` em vez de recriar o
 * card na mão (`rounded-[10px] bg-card`), senão divisor, raio e fundo divergem aos poucos.
 * `integrations.tsx` fica de fora: é uma grade de cards por integração (como no Linear),
 * com borda e altura próprias — não uma lista de linhas.
 */
describe('settings sem card feito à mão', () => {
   it('nenhuma tela de settings recria o SettingsCard', () => {
      const files = execSync('git ls-files components/common/settings', { encoding: 'utf8' })
         .split('\n')
         .filter(
            (f) =>
               f.endsWith('.tsx') && !f.endsWith('/shared.tsx') && !f.endsWith('/integrations.tsx')
         );
      const offenders = files.filter((f) =>
         /rounded-\[10px\][^"]*bg-card|bg-card[^"]*rounded-\[10px\]/.test(readFileSync(f, 'utf8'))
      );
      expect(offenders).toEqual([]);
   });
});
