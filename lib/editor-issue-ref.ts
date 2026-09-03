/**
 * Referência a issue no editor de blocos (#16): nó inline atômico `issueRef { identifier }`
 * sobre `@tiptap/extension-mention`, com gatilho `#` (sugestões vêm do cliente, via
 * `suggestion`) e reconhecimento de `ENG-12` ao colar.
 *
 * Aqui só o schema e a renderização estática (chip com o identifier); o chip "vivo"
 * (ícone de status, título, link) é um NodeView React que o `BlockEditor` acopla com
 * `IssueRef.extend({ addNodeView })`. Sem React — o módulo entra no schema do servidor.
 */
import { mergeAttributes, nodePasteRule } from '@tiptap/core';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';

export interface IssueRefAttrs {
   identifier: string;
}

export interface IssueRefOptions extends MentionOptions<unknown, IssueRefAttrs> {
   /**
    * Ao colar texto, só `IDENT-123` reconhecido aqui vira referência (evita transformar
    * "UTF-8" ou "ISO-8601" em chip). Sem a função, nada é convertido ao colar.
    */
   isKnownIdentifier?: (identifier: string) => boolean;
}

/** `TEAM-123`: chave do time em maiúsculas (até 16) + número. */
export const ISSUE_IDENTIFIER_RE = /\b([A-Z][A-Z0-9]{0,15}-\d{1,9})\b/g;

export const IssueRef = Mention.extend<IssueRefOptions>({
   name: 'issueRef',

   addOptions() {
      return {
         ...this.parent?.(),
         isKnownIdentifier: undefined,
         // Backspace apaga o chip inteiro (o Mention padrão devolveria o gatilho, que
         // não guardamos como atributo).
         deleteTriggerWithBackspace: true,
         suggestion: { char: '#' },
      } as IssueRefOptions;
   },

   addAttributes() {
      return {
         identifier: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-identifier'),
            renderHTML: (attrs) => ({ 'data-identifier': attrs.identifier }),
         },
      };
   },

   parseHTML() {
      return [{ tag: 'span[data-type="issueRef"]' }];
   },

   renderHTML({ node, HTMLAttributes }) {
      return [
         'span',
         mergeAttributes(
            { 'data-type': this.name, 'class': 'issue-ref' },
            this.options.HTMLAttributes,
            HTMLAttributes
         ),
         String(node.attrs.identifier ?? ''),
      ];
   },

   renderText({ node }) {
      return String(node.attrs.identifier ?? '');
   },

   addPasteRules() {
      return [
         nodePasteRule({
            // Só os identifiers conhecidos entram como match: um handler que devolve null
            // (match "recusado") faria o Tiptap descartar TODAS as conversões do colar.
            find: (text) => {
               const known = this.options.isKnownIdentifier;
               if (!known) return null;
               return [...text.matchAll(ISSUE_IDENTIFIER_RE)]
                  .filter((m) => m.index !== undefined && known(m[1]))
                  .map((m) => ({ index: m.index!, text: m[0], data: { identifier: m[1] } }));
            },
            type: this.type,
            getAttributes: (match) => ({ identifier: String(match.data?.identifier ?? '') }),
         }),
      ];
   },
});
