/**
 * Conversões do documento do editor de blocos (JSON do ProseMirror, #16):
 *
 * - `blocksToDoc`: ContentBlock[] (projeção legada / `textToBlocks(description)`) → doc,
 *   usado na abertura quando `description_doc` ainda é nulo.
 * - `docToText`: doc → texto markdown (projeção que o servidor grava em `description`
 *   para busca, API antiga e e-mails). É o inverso aproximado de `textToBlocks`.
 * - `docHeadings`: headings do doc, para o outline do project.
 *
 * Sem React — roda no servidor e no cliente.
 */
import { generateText, type JSONContent } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { ContentBlock } from '@/data/issue-details';
import { editorExtensions } from './editor-extensions';

export type EditorDoc = JSONContent;

export const EMPTY_DOC: EditorDoc = { type: 'doc', content: [{ type: 'paragraph' }] };

/* ----------------------------- ContentBlock[] → doc ----------------------------- */

/** Texto com `code` e **bold** inline (o mesmo mini-formato do `InlineText`) → nós de texto. */
function inlineContent(text: string): JSONContent[] {
   const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
   const nodes: JSONContent[] = [];
   for (const part of parts) {
      if (!part) continue;
      if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
         nodes.push({ type: 'text', text: part.slice(1, -1), marks: [{ type: 'code' }] });
      } else if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
         nodes.push({ type: 'text', text: part.slice(2, -2), marks: [{ type: 'bold' }] });
      } else {
         nodes.push({ type: 'text', text: part });
      }
   }
   return nodes;
}

function paragraph(text: string): JSONContent {
   const content = inlineContent(text);
   return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function blockToNode(block: ContentBlock): JSONContent {
   switch (block.type) {
      case 'heading':
         return {
            type: 'heading',
            attrs: { level: block.level === 2 ? 2 : 1 },
            content: inlineContent(block.text),
         };
      case 'paragraph':
         return paragraph(block.text);
      case 'bullet-list':
         return {
            type: 'bulletList',
            content: block.items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
         };
      case 'numbered-list':
         return {
            type: 'orderedList',
            attrs: { start: 1 },
            content: block.items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
         };
      case 'checklist':
         return {
            type: 'taskList',
            content: block.items.map((item) => ({
               type: 'taskItem',
               attrs: { checked: item.checked },
               content: [paragraph(item.text)],
            })),
         };
      case 'code':
         return {
            type: 'codeBlock',
            attrs: { language: block.language || null },
            ...(block.code ? { content: [{ type: 'text', text: block.code }] } : {}),
         };
      case 'quote':
         return {
            type: 'blockquote',
            content: [
               paragraph(block.text),
               ...(block.author ? [paragraph(`— ${block.author}`)] : []),
            ],
         };
      case 'divider':
         return { type: 'horizontalRule' };
      // Blocos sem nó equivalente no editor (só existiam em seed): degradam para texto.
      case 'image':
         return paragraph(block.caption ? `${block.alt} — ${block.caption}` : block.alt);
      case 'video':
         return paragraph(block.title);
      case 'issue-ref':
         return paragraph(block.note ? `${block.identifier} — ${block.note}` : block.identifier);
   }
}

export function blocksToDoc(blocks: ContentBlock[]): EditorDoc {
   if (blocks.length === 0) return EMPTY_DOC;
   return { type: 'doc', content: blocks.map(blockToNode) };
}

/* -------------------------------- doc → texto -------------------------------- */

/** Texto inline de um textblock, reaplicando `code`/**bold** para a projeção ser legível. */
function inlineText(node: PmNode): string {
   let out = '';
   node.forEach((child) => {
      if (child.type.name === 'hardBreak') {
         out += '\n';
         return;
      }
      if (!child.isText) {
         out += child.textContent;
         return;
      }
      let text = child.text ?? '';
      if (child.marks.some((m) => m.type.name === 'code')) text = `\`${text}\``;
      else if (child.marks.some((m) => m.type.name === 'bold')) text = `**${text}**`;
      out += text;
   });
   return out;
}

/** Linhas de um item de lista (parágrafos + sublistas com indentação). */
function listItemLines(item: PmNode, marker: string): string[] {
   const lines: string[] = [];
   let first = true;
   item.forEach((child) => {
      if (child.isTextblock) {
         lines.push(first ? `${marker}${inlineText(child)}` : `  ${inlineText(child)}`);
      } else if (child.type.name === 'bulletList' || child.type.name === 'orderedList') {
         lines.push(...listLines(child).map((line) => `  ${line}`));
      } else if (child.type.name === 'taskList') {
         lines.push(...taskListLines(child).map((line) => `  ${line}`));
      }
      first = false;
   });
   if (lines.length === 0) lines.push(marker.trimEnd());
   return lines;
}

function listLines(list: PmNode): string[] {
   const ordered = list.type.name === 'orderedList';
   const start = Number(list.attrs.start ?? 1) || 1;
   const lines: string[] = [];
   list.forEach((item, _offset, index) => {
      lines.push(...listItemLines(item, ordered ? `${start + index}. ` : '- '));
   });
   return lines;
}

function taskListLines(list: PmNode): string[] {
   const lines: string[] = [];
   list.forEach((item) => {
      lines.push(...listItemLines(item, item.attrs.checked ? '- [x] ' : '- [ ] '));
   });
   return lines;
}

type Serializer = (props: { node: PmNode }) => string;

const TEXT_SERIALIZERS: Record<string, Serializer> = {
   paragraph: ({ node }) => inlineText(node),
   heading: ({ node }) => `${'#'.repeat(Number(node.attrs.level) || 1)} ${inlineText(node)}`,
   bulletList: ({ node }) => listLines(node).join('\n'),
   orderedList: ({ node }) => listLines(node).join('\n'),
   taskList: ({ node }) => taskListLines(node).join('\n'),
   codeBlock: ({ node }) => `\`\`\`${node.attrs.language ?? ''}\n${node.textContent}\n\`\`\``,
   blockquote: ({ node }) => {
      const lines: string[] = [];
      node.forEach((child) =>
         lines.push(`> ${child.isTextblock ? inlineText(child) : child.textContent}`)
      );
      return lines.join('\n');
   },
   horizontalRule: () => '---',
};

/**
 * Doc → texto markdown (projeção). Lança se o JSON não for um doc válido do schema
 * (nó desconhecido, estrutura inválida) — o servidor converte isso em 400.
 */
export function docToText(doc: EditorDoc): string {
   return generateText(doc, editorExtensions(), {
      blockSeparator: '\n\n',
      textSerializers: TEXT_SERIALIZERS,
   }).trim();
}

/* --------------------------------- headings --------------------------------- */

export interface DocHeading {
   text: string;
   level: number;
}

/** Headings de topo do doc, na ordem — alimenta o outline do project. */
export function docHeadings(doc: EditorDoc | null | undefined): DocHeading[] {
   const out: DocHeading[] = [];
   for (const node of doc?.content ?? []) {
      if (node.type !== 'heading') continue;
      const text = (node.content ?? []).map((n) => n.text ?? '').join('');
      out.push({ text, level: Number(node.attrs?.level ?? 1) || 1 });
   }
   return out;
}
