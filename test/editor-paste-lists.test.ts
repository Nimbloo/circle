import { describe, expect, it } from 'vitest';
import { parseListText } from '@/lib/editor-paste-lists';

describe('parseListText (colar texto com listas)', () => {
   it('texto sem lista devolve null (segue o colar normal)', () => {
      expect(parseListText('só um parágrafo\ne outro')).toBeNull();
      expect(parseListText('')).toBeNull();
   });

   it('markdown: `- [ ]`/`- [x]`/`* [ ]` viram task list com o check certo', () => {
      const blocks = parseListText('- [ ] comprar\n- [x] pagar\n* [X] enviar')!;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe('taskList');
      expect(blocks[0].content!.map((item) => item.attrs!.checked)).toEqual([false, true, true]);
      expect(blocks[0].content![0].content![0]).toEqual({
         type: 'paragraph',
         content: [{ type: 'text', text: 'comprar' }],
      });
   });

   it('Google Docs: `☐`/`☑` viram task list', () => {
      const blocks = parseListText('☐ revisar spec\n☑ abrir PR')!;
      expect(blocks[0].type).toBe('taskList');
      expect(blocks[0].content!.map((item) => item.attrs!.checked)).toEqual([false, true]);
      expect(blocks[0].content![1].content![0].content![0].text).toBe('abrir PR');
   });

   it('`- ` vira bullet, `1. ` vira numerada e parágrafos ficam entre as listas', () => {
      const blocks = parseListText('Plano\n- a\n* b\n\n1. um\n2) dois\nfim')!;
      expect(blocks.map((block) => block.type)).toEqual([
         'paragraph',
         'bulletList',
         'orderedList',
         'paragraph',
      ]);
      expect(blocks[1].content).toHaveLength(2);
      expect(blocks[1].content![0].type).toBe('listItem');
      expect(blocks[2].content).toHaveLength(2);
   });

   it('indentação (2 espaços ou tab) aninha a sublista dentro do item anterior', () => {
      const blocks = parseListText('- [ ] pai\n  - [x] filho\n\t\t- neto\n- [ ] irmão')!;
      expect(blocks).toHaveLength(1);
      const [pai, irmao] = blocks[0].content!;
      expect(irmao.content![0].content![0].text).toBe('irmão');
      expect(pai.content!.map((n) => n.type)).toEqual(['paragraph', 'taskList']);
      const filho = pai.content![1].content![0];
      expect(filho.attrs!.checked).toBe(true);
      expect(filho.content!.map((n) => n.type)).toEqual(['paragraph', 'bulletList']);
   });

   it('tipo diferente no mesmo nível abre outra lista', () => {
      const blocks = parseListText('- [ ] tarefa\n- bullet')!;
      expect(blocks.map((block) => block.type)).toEqual(['taskList', 'bulletList']);
   });
});
