import { describe, it, expect } from 'vitest';
import { patchToLines } from '@/lib/diff-patch';

describe('patchToLines', () => {
   it('numera pelo arquivo novo: add e context avançam, del não', () => {
      const lines = patchToLines('@@ -1,2 +1,3 @@\n line1\n+added\n-line2\n line3');
      expect(lines).toEqual([
         { type: 'context', number: 1, text: 'line1' },
         { type: 'add', number: 2, text: 'added' },
         { type: 'del', text: 'line2' },
         { type: 'context', number: 3, text: 'line3' },
      ]);
   });

   it('insere skip antes do primeiro hunk e entre hunks', () => {
      const lines = patchToLines('@@ -10,1 +10,1 @@\n a\n@@ -20,1 +20,2 @@\n b\n+c');
      expect(lines).toEqual([
         { type: 'skip', count: 9 },
         { type: 'context', number: 10, text: 'a' },
         { type: 'skip', count: 9 },
         { type: 'context', number: 20, text: 'b' },
         { type: 'add', number: 21, text: 'c' },
      ]);
   });

   it('ignora "No newline at end of file" e devolve [] sem patch', () => {
      expect(patchToLines('@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file')).toEqual([
         { type: 'del', text: 'a' },
         { type: 'add', number: 1, text: 'b' },
      ]);
      expect(patchToLines(null)).toEqual([]);
      expect(patchToLines('')).toEqual([]);
   });
});
