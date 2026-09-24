/**
 * Âncoras dos headings do editor de blocos (outline do projeto): cada heading de 1º
 * nível do doc ganha `id="doc-h-N"` por DECORATION — o ProseMirror aplica e mantém o
 * atributo no nó que ele mesmo renderiza. Gravar `el.id` no DOM por fora faz o
 * DOMObserver reler/recriar os headings a cada tecla e os ids se perdem.
 *
 * A numeração segue `docHeadings` (`lib/editor-doc.ts`): só headings de 1º nível, em
 * ordem — o outline e as âncoras apontam para o mesmo N.
 */
import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const headingAnchorId = (index: number) => `doc-h-${index}`;

const key = new PluginKey<DecorationSet>('headingAnchors');

function anchors(doc: PMNode): DecorationSet {
   const decorations: Decoration[] = [];
   let index = 0;
   doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return;
      decorations.push(
         Decoration.node(offset, offset + node.nodeSize, { id: headingAnchorId(index++) })
      );
   });
   return DecorationSet.create(doc, decorations);
}

export const HeadingAnchors = Extension.create({
   name: 'headingAnchors',

   addProseMirrorPlugins() {
      return [
         new Plugin<DecorationSet>({
            key,
            state: {
               init: (_, state) => anchors(state.doc),
               apply: (tr, current) => (tr.docChanged ? anchors(tr.doc) : current),
            },
            props: {
               decorations: (state) => key.getState(state),
            },
         }),
      ];
   },
});
