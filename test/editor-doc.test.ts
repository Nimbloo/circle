import { describe, it, expect } from 'vitest';
import { blocksToDoc, docHeadings, docToText, EMPTY_DOC } from '@/lib/editor-doc';
import { textToBlocks } from '@/lib/text-blocks';
import type { ContentBlock } from '@/data/issue-details';

describe('blocksToDoc #16', () => {
   it('lista vazia → doc com um parágrafo vazio', () => {
      expect(blocksToDoc([])).toEqual(EMPTY_DOC);
   });

   it('mapeia cada tipo de bloco para o nó do editor', () => {
      const blocks: ContentBlock[] = [
         { type: 'heading', text: 'T', level: 1 },
         { type: 'heading', text: 'S', level: 2 },
         { type: 'paragraph', text: 'a **b** `c`' },
         { type: 'bullet-list', items: ['x', 'y'] },
         { type: 'numbered-list', items: ['1'] },
         { type: 'checklist', items: [{ text: 'do', checked: false }] },
         { type: 'code', language: 'ts', code: 'let a;' },
         { type: 'quote', text: 'q', author: 'me' },
         { type: 'divider' },
      ];
      const doc = blocksToDoc(blocks);
      expect(doc.content?.map((n) => n.type)).toEqual([
         'heading',
         'heading',
         'paragraph',
         'bulletList',
         'orderedList',
         'taskList',
         'codeBlock',
         'blockquote',
         'horizontalRule',
      ]);
      expect(doc.content?.[0].attrs).toEqual({ level: 1 });
      expect(doc.content?.[1].attrs).toEqual({ level: 2 });
      expect(doc.content?.[2].content).toEqual([
         { type: 'text', text: 'a ' },
         { type: 'text', text: 'b', marks: [{ type: 'bold' }] },
         { type: 'text', text: ' ' },
         { type: 'text', text: 'c', marks: [{ type: 'code' }] },
      ]);
      expect(doc.content?.[5].content?.[0]).toMatchObject({
         type: 'taskItem',
         attrs: { checked: false },
      });
      expect(doc.content?.[6]).toEqual({
         type: 'codeBlock',
         attrs: { language: 'ts' },
         content: [{ type: 'text', text: 'let a;' }],
      });
   });

   it('blocos sem nó equivalente (image/video/issue-ref) degradam para parágrafo', () => {
      const doc = blocksToDoc([
         { type: 'image', alt: 'Mock', caption: 'cap' },
         { type: 'video', title: 'Demo' },
         { type: 'issue-ref', identifier: 'LNUI-1', note: 'n' },
      ]);
      expect(doc.content?.map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
      expect(doc.content?.[0].content?.[0].text).toBe('Mock — cap');
   });
});

describe('docToText #16', () => {
   it('gera markdown que `textToBlocks` lê de volta (round-trip)', () => {
      const md = [
         '# Title',
         '',
         'Hello **bold** and `code`',
         '',
         '- a',
         '- b',
         '',
         '1. one',
         '2. two',
         '',
         '- [ ] todo',
         '- [x] done',
         '',
         '```ts',
         'const x = 1;',
         '```',
         '',
         '> quote',
         '',
         '---',
         '',
         '## Sub',
      ].join('\n');
      const text = docToText(blocksToDoc(textToBlocks(md)));
      expect(text).toBe(md);
      expect(textToBlocks(text)).toEqual(textToBlocks(md));
   });

   it('doc vazio → texto vazio', () => {
      expect(docToText(EMPTY_DOC)).toBe('');
   });

   it('lança para nó fora do schema', () => {
      expect(() => docToText({ type: 'doc', content: [{ type: 'widget' }] })).toThrow();
   });

   it('imagem → ![alt](url)', () => {
      const doc = {
         type: 'doc',
         content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Veja:' }] },
            { type: 'image', attrs: { src: 'https://cdn.test/uploads/a.png', alt: 'Tela' } },
         ],
      };
      expect(docToText(doc)).toBe('Veja:\n\n![Tela](https://cdn.test/uploads/a.png)');
   });

   it('vídeo → URL', () => {
      const doc = {
         type: 'doc',
         content: [
            { type: 'video', attrs: { src: 'https://youtu.be/dQw4w9WgXcQ', provider: 'youtube' } },
            { type: 'paragraph', content: [{ type: 'text', text: 'fim' }] },
         ],
      };
      expect(docToText(doc)).toBe('https://youtu.be/dQw4w9WgXcQ\n\nfim');
   });

   it('referência a issue (inline) → identifier', () => {
      const doc = {
         type: 'doc',
         content: [
            {
               type: 'paragraph',
               content: [
                  { type: 'text', text: 'Depende de ' },
                  { type: 'issueRef', attrs: { identifier: 'ENG-12' } },
                  { type: 'text', text: ' e ' },
                  { type: 'issueRef', attrs: { identifier: 'ENG-13' } },
               ],
            },
         ],
      };
      expect(docToText(doc)).toBe('Depende de ENG-12 e ENG-13');
   });
});

describe('docHeadings #16', () => {
   it('lista os headings de topo com nível', () => {
      const doc = blocksToDoc([
         { type: 'heading', text: 'A' },
         { type: 'paragraph', text: 'p' },
         { type: 'heading', text: 'B', level: 2 },
      ]);
      expect(docHeadings(doc)).toEqual([
         { text: 'A', level: 1 },
         { text: 'B', level: 2 },
      ]);
      expect(docHeadings(null)).toEqual([]);
   });
});
