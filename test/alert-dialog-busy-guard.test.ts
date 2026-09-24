import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda estática (auditoria de toasts/diálogos, 23/09): um `AlertDialogAction` que chama
 * `preventDefault` mantém o diálogo aberto durante a mutação — sem `disabled`, o segundo
 * clique manda outro DELETE (404 → toast de erro depois do "excluído").
 */

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
   for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.tsx')) out.push(full);
   }
   return out;
}

/** Tag de abertura do `AlertDialogAction` (props com chaves balanceadas). */
function openingTags(src: string): { tag: string; line: number }[] {
   const tags: { tag: string; line: number }[] = [];
   let i = 0;
   while ((i = src.indexOf('<AlertDialogAction', i)) !== -1) {
      let j = i + '<AlertDialogAction'.length;
      let depth = 0;
      for (; j < src.length; j++) {
         const c = src[j];
         if (c === '{') depth++;
         else if (c === '}') depth--;
         else if (c === '>' && depth === 0) break;
      }
      tags.push({ tag: src.slice(i, j), line: src.slice(0, i).split('\n').length });
      i = j;
   }
   return tags;
}

describe('AlertDialogAction com preventDefault tem guarda de busy', () => {
   it('todo AlertDialogAction que mantém o diálogo aberto declara disabled', () => {
      const files = [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))];
      const offenders: string[] = [];
      for (const file of files) {
         const src = readFileSync(file, 'utf8');
         for (const { tag, line } of openingTags(src)) {
            if (/preventDefault/.test(tag) && !/\bdisabled=/.test(tag)) {
               offenders.push(`${path.relative(ROOT, file)}:${line}`);
            }
         }
      }
      expect(offenders).toEqual([]);
   });
});
