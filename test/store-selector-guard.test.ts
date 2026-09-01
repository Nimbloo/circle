import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/**
 * GUARDA DE REATIVIDADE DO STORE.
 *
 * Assinar um GETTER DERIVADO do zustand (`useXStore((s) => s.getFoo)`) e chamá-lo fora
 * do seletor não re-renderiza: a referência da função é estável, então o componente
 * nunca acorda quando o dado muda. Foi o bug do detalhe de initiative — que, no vínculo
 * de projeto, chegou a DESVINCULAR o projeto anterior em silêncio.
 *
 * As duas formas corretas:
 *  - getter que devolve referência ESTÁVEL (`find`) → chamar DENTRO do seletor;
 *  - getter que devolve ARRAY/objeto NOVO (`filter`, `map`) → NÃO pode ir no seletor
 *    (referência nova a cada leitura = re-render infinito): assinar a fatia crua
 *    (`s.cycles`, `s.projects`) e derivar no componente.
 *
 * A lista de getters é DERIVADA dos próprios stores, não escrita à mão: a primeira
 * versão deste guarda só casava o prefixo `get`, e por isso deixou passar
 * `countCompletedProjects` — no mesmo componente que o commit dizia ter consertado.
 *
 * Ações (`hydrate`, `apply*`, `set*`) seguem livres: são chamadas em handler, não
 * durante o render, e não precisam disparar re-render.
 */

/** Declaração de membro que RETORNA valor, na interface do store: `nome: (args) => T;` */
const GETTER_DECL = /^\s{3}(\w+)\??:\s*\([^)]*\)\s*=>\s*(.+);\s*$/;
const IS_ACTION = /^(void|Promise<void>)$/;

function storeFiles(): string[] {
   return execSync('git ls-files store', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.ts'));
}

function sourceFiles(): string[] {
   return execSync('git ls-files components app lib', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

/** Nomes de getters derivados declarados nos stores (retornam algo além de void). */
function derivedGetters(): Set<string> {
   const names = new Set<string>();
   for (const file of storeFiles()) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
         const m = line.match(GETTER_DECL);
         if (m && !IS_ACTION.test(m[2].trim())) names.add(m[1]);
      }
   }
   return names;
}

describe('guarda de reatividade dos seletores de store', () => {
   it('a lista de getters sai dos stores e cobre os casos conhecidos', () => {
      const names = derivedGetters();
      // Sentinelas: se o parser quebrar, isto falha antes de dar falso "tudo certo".
      expect(names.has('getInitiativeById')).toBe(true);
      expect(names.has('countCompletedProjects')).toBe(true);
      expect(names.has('isSubscribed')).toBe(true);
      expect(names.size).toBeGreaterThan(8);
   });

   it('nenhum componente assina um getter derivado sem chamá-lo no seletor', () => {
      const names = derivedGetters();
      const offenders: string[] = [];

      for (const file of sourceFiles()) {
         const src = readFileSync(file, 'utf8');
         const re = /use[A-Za-z]+Store\(\s*\(\s*s\s*\)\s*=>\s*s\.(\w+)\s*\)/g;
         for (const m of src.matchAll(re)) {
            if (!names.has(m[1])) continue; // fatia de estado (s.projects) é o uso correto
            const line = src.slice(0, m.index).split('\n').length;
            offenders.push(`${file}:${line} — ${m[1]}`);
         }
      }

      expect(offenders).toEqual([]);
   });
});
