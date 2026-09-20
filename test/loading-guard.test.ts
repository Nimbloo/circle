import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DO LOADING PADRÃO.
 *
 * Todo estado de carregamento do app é o `CircleLoading` (arco girando sobre a marca do
 * Circle). Skeleton cinza, spinner do lucide (`Loader2`) ou ícone girando com
 * `animate-spin` numa tela nova quebram a consistência — esta guarda aponta o arquivo.
 *
 * `components/ui/**` fica de fora: primitivos shadcn são vendored (ex.: o
 * `SidebarMenuSkeleton` do `sidebar.tsx`).
 */
const PROIBIDOS: { nome: string; re: RegExp }[] = [
   { nome: 'Skeleton', re: /\bSkeleton\b|ListSkeleton|IssueDetailSkeleton/ },
   { nome: 'Loader2', re: /\bLoader2\b/ },
   { nome: 'animate-spin', re: /animate-spin/ },
];

function arquivosDeUi(): string[] {
   return execSync('git ls-files components app', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.tsx') && !f.startsWith('components/ui/'));
}

describe('guarda do loading padrão', () => {
   it('nenhuma tela usa skeleton, Loader2 ou animate-spin fora do CircleLoading', () => {
      const infratores: string[] = [];
      for (const arquivo of arquivosDeUi()) {
         const src = readFileSync(arquivo, 'utf8');
         for (const { nome, re } of PROIBIDOS)
            if (re.test(src)) infratores.push(`${arquivo} — ${nome}`);
      }
      expect(infratores).toEqual([]);
   });
});
