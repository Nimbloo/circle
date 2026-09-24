/**
 * Abrir link no editor de blocos (como no Linear): o editor é sempre editável, então o
 * clique simples só posiciona o cursor (`openOnClick: false`); Ctrl/Cmd+clique e o
 * botão do meio abrem o link em nova aba, com `noopener`. Só client (usa `window`).
 */
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

const SAFE_HREF = /^(https?:|mailto:)/i;

function linkAt(view: EditorView, event: MouseEvent): string | null {
   const target = event.target as HTMLElement | null;
   const anchor = target?.closest?.('a[href]');
   if (!anchor || !view.dom.contains(anchor)) return null;
   const href = anchor.getAttribute('href') ?? '';
   return SAFE_HREF.test(href) ? href : null;
}

function openInNewTab(href: string) {
   window.open(href, '_blank', 'noopener,noreferrer');
}

export const LinkOpen = Extension.create({
   name: 'linkOpen',

   addProseMirrorPlugins() {
      return [
         new Plugin({
            key: new PluginKey('linkOpen'),
            props: {
               handleDOMEvents: {
                  click: (view, event) => {
                     if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return false;
                     const href = linkAt(view, event);
                     if (!href) return false;
                     event.preventDefault();
                     openInNewTab(href);
                     return true;
                  },
                  // Botão do meio: sem o preventDefault no mousedown, o Linux cola a
                  // seleção primária no editor.
                  mousedown: (view, event) => {
                     if (event.button !== 1 || !linkAt(view, event)) return false;
                     event.preventDefault();
                     return true;
                  },
                  auxclick: (view, event) => {
                     if (event.button !== 1) return false;
                     const href = linkAt(view, event);
                     if (!href) return false;
                     event.preventDefault();
                     openInNewTab(href);
                     return true;
                  },
               },
            },
         }),
      ];
   },
});
