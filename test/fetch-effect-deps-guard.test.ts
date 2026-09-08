import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DE DEPENDÊNCIA DE EFEITO QUE BUSCA.
 *
 * Um `useEffect` que chama a API não pode depender do ARRAY de um store. A
 * identidade do array muda a cada re-hidratação e a cada update otimista, mesmo
 * quando o conteúdo é o mesmo — então a busca dispara em cascata, sem nada ter
 * mudado de fato.
 *
 * Aconteceu duas vezes, independentes, e só apareceu quando o log estruturado
 * começou a chegar no Loki: `/api/v1/roadmap` foi chamado quatro vezes em 4 s numa
 * única carga de página (toda outra rota, uma vez), e a aba "Assigned" de My issues
 * refazia a busca COMPLETA de `assignee=me` a cada mutação de qualquer pessoa.
 *
 * O caminho certo é depender de uma ASSINATURA do que muda a resposta (ver
 * `projectsSignature` e `assigneesSignature`), não do array.
 *
 * Limite conhecido: o casamento é textual, então cobre a forma
 * `useEffect(() => { ... }, [deps])`. Não é um parser — é uma rede para a forma que
 * já escorregou duas vezes.
 */
const ARRAYS_DE_STORE = [
   'projects',
   'issues',
   'teams',
   'labels',
   'users',
   'cycles',
   'initiatives',
   'members',
   'views',
   'statuses',
];

const LIGACAO = /const\s+(\w+)\s*=\s*use\w*Store\(\s*\(s\)\s*=>\s*s\.(\w+)\s*\)/g;
const EFEITO = /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([^\]]*)\]\s*\)/g;
const BUSCA = /(api\.|load\(|refetch)/;

function arquivosDeUi(): string[] {
   return execSync('git ls-files components app', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.tsx'));
}

describe('guarda de dependência de efeito que busca', () => {
   it('nenhum useEffect que chama a API depende do array de um store', () => {
      const infratores: string[] = [];

      for (const arquivo of arquivosDeUi()) {
         const src = readFileSync(arquivo, 'utf8');

         const ligados = new Set<string>();
         for (const m of src.matchAll(LIGACAO)) {
            if (ARRAYS_DE_STORE.includes(m[2])) ligados.add(m[1]);
         }
         if (ligados.size === 0) continue;

         for (const m of src.matchAll(EFEITO)) {
            const [, corpo, deps] = m;
            if (!BUSCA.test(corpo)) continue;
            const suspeitas = deps
               .split(',')
               .map((d) => d.trim())
               .filter((d) => ligados.has(d));
            if (suspeitas.length > 0) {
               const linha = src.slice(0, m.index).split('\n').length;
               infratores.push(`${arquivo}:${linha} — depende de ${suspeitas.join(', ')}`);
            }
         }
      }

      expect(infratores).toEqual([]);
   });
});
