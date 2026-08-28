import { describe, it, expect } from 'vitest';
import { textToBlocks } from '@/lib/adapters-issue-detail';

describe('textToBlocks (markdown → ContentBlock[]) #16', () => {
   it('parseia headings, listas, checklist, code, quote, divider', () => {
      const md = [
         '# Título',
         '',
         'Um parágrafo normal.',
         '',
         '- item a',
         '- item b',
         '',
         '1. primeiro',
         '2. segundo',
         '',
         '- [x] feito',
         '- [ ] pendente',
         '',
         '> uma citação',
         '',
         '```ts',
         'const x = 1;',
         '```',
         '',
         '---',
      ].join('\n');
      const blocks = textToBlocks(md);
      expect(blocks.map((b) => b.type)).toEqual([
         'heading',
         'paragraph',
         'bullet-list',
         'numbered-list',
         'checklist',
         'quote',
         'code',
         'divider',
      ]);
      expect(blocks[0]).toMatchObject({ type: 'heading', text: 'Título', level: 1 });
      expect(blocks[2]).toMatchObject({ type: 'bullet-list', items: ['item a', 'item b'] });
      expect(blocks[3]).toMatchObject({ type: 'numbered-list', items: ['primeiro', 'segundo'] });
      expect(blocks[4]).toMatchObject({
         type: 'checklist',
         items: [
            { text: 'feito', checked: true },
            { text: 'pendente', checked: false },
         ],
      });
      expect(blocks[6]).toMatchObject({ type: 'code', language: 'ts', code: 'const x = 1;' });
   });

   it('texto simples continua virando parágrafos', () => {
      expect(textToBlocks('linha 1\n\nlinha 2').map((b) => b.type)).toEqual([
         'paragraph',
         'paragraph',
      ]);
   });

   it('vazio → []', () => {
      expect(textToBlocks('')).toEqual([]);
      expect(textToBlocks(null)).toEqual([]);
   });
});
