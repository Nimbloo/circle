/**
 * Colar TEXTO PURO com listas no editor de blocos: linhas `- [ ]`/`- [x]`/`* [ ]` (ou
 * `☐`/`☑` do Google Docs) viram task list, `- `/`* ` viram bullet list e `1. ` vira
 * lista numerada; a indentação (2 espaços ou tab) aninha. Só entra quando o clipboard é
 * texto sem HTML de editor (`data-pm-slice`) — colar de dentro do próprio editor segue o
 * caminho normal do ProseMirror. Só afeta input: o servidor não precisa registrá-la.
 */
import { Extension, type JSONContent } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

type ListKind = 'task' | 'bullet' | 'ordered';

interface ListLine {
   kind: ListKind;
   level: number;
   text: string;
   checked: boolean;
}

type Line = ListLine | { kind: 'text'; text: string };

const TASK_RE = /^(?:[-*+]\s+)?\[( |x|X)\]\s+(.*)$/;
const GDOCS_TASK_RE = /^([☐☑☒])\s*(.*)$/;
const BULLET_RE = /^[-*+•]\s+(.*)$/;
const ORDERED_RE = /^\d{1,4}[.)]\s+(.*)$/;

function indentLevel(raw: string): number {
   const leading = raw.match(/^[ \t]*/)?.[0] ?? '';
   const tabs = (leading.match(/\t/g) ?? []).length;
   const spaces = leading.length - tabs;
   return tabs + Math.floor(spaces / 2);
}

function classify(raw: string): Line | null {
   const trimmed = raw.trim();
   if (!trimmed) return null;
   const level = indentLevel(raw);
   let m = trimmed.match(TASK_RE);
   if (m) return { kind: 'task', level, text: m[2].trim(), checked: m[1].toLowerCase() === 'x' };
   m = trimmed.match(GDOCS_TASK_RE);
   if (m) return { kind: 'task', level, text: m[2].trim(), checked: m[1] !== '☐' };
   m = trimmed.match(BULLET_RE);
   if (m) return { kind: 'bullet', level, text: m[1].trim(), checked: false };
   m = trimmed.match(ORDERED_RE);
   if (m) return { kind: 'ordered', level, text: m[1].trim(), checked: false };
   return { kind: 'text', text: trimmed };
}

function paragraph(text: string): JSONContent {
   return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };
}

/**
 * Monta uma lista a partir de `items[start…]` no nível `level`, aninhando os itens mais
 * indentados dentro do item anterior. Para ao encontrar um item de nível menor ou de
 * outro tipo no mesmo nível (o chamador abre a lista seguinte).
 */
function buildList(items: ListLine[], start: number, level: number): [JSONContent, number] {
   const kind = items[start].kind;
   const list: JSONContent = {
      type: kind === 'task' ? 'taskList' : kind === 'bullet' ? 'bulletList' : 'orderedList',
      content: [],
   };
   let i = start;
   while (i < items.length) {
      const line = items[i];
      if (line.level < level || (line.level === level && line.kind !== kind)) break;
      if (line.level > level) {
         // Indentação sem item pai no nível atual: trata como irmão.
         line.level = level;
      }
      const item: JSONContent =
         kind === 'task'
            ? {
                 type: 'taskItem',
                 attrs: { checked: line.checked },
                 content: [paragraph(line.text)],
              }
            : { type: 'listItem', content: [paragraph(line.text)] };
      i += 1;
      while (i < items.length && items[i].level > level) {
         const [nested, next] = buildList(items, i, items[i].level);
         item.content!.push(nested);
         i = next;
      }
      list.content!.push(item);
   }
   return [list, i];
}

/**
 * Texto puro → blocos do editor. `null` quando o texto não tem nenhuma linha de lista
 * (o colar segue o caminho normal). Linhas comuns viram parágrafos.
 */
export function parseListText(text: string): JSONContent[] | null {
   const lines = text
      .split(/\r?\n/)
      .map(classify)
      .filter((line): line is Line => line !== null);
   if (!lines.some((line) => line.kind !== 'text')) return null;

   const blocks: JSONContent[] = [];
   let i = 0;
   while (i < lines.length) {
      const line = lines[i];
      if (line.kind === 'text') {
         blocks.push(paragraph(line.text));
         i += 1;
         continue;
      }
      const run: ListLine[] = [];
      while (i < lines.length && lines[i].kind !== 'text') {
         run.push(lines[i] as ListLine);
         i += 1;
      }
      let j = 0;
      while (j < run.length) {
         const [list, next] = buildList(run, j, run[j].level);
         blocks.push(list);
         j = next;
      }
   }
   return blocks;
}

export const PasteLists = Extension.create({
   name: 'pasteLists',
   // Antes do handler de lista numerada do próprio Tiptap (que só cobre listas puras).
   priority: 1000,

   addProseMirrorPlugins() {
      return [
         new Plugin({
            key: new PluginKey('pasteLists'),
            props: {
               handlePaste: (view, event) => {
                  const data = event.clipboardData;
                  const text = data?.getData('text/plain');
                  if (!text) return false;
                  const html = data?.getData('text/html') ?? '';
                  if (html.includes('data-pm-slice')) return false;
                  if (view.state.selection.$from.parent.type.spec.code) return false;

                  const blocks = parseListText(text);
                  if (!blocks) return false;
                  // HTML rico (Google Docs, web) sem checklist: o parser de HTML do
                  // ProseMirror já produz as listas com a formatação inline preservada.
                  if (html.trim() && !blocks.some((block) => block.type === 'taskList')) {
                     return false;
                  }
                  return this.editor.commands.insertContent(blocks);
               },
            },
         }),
      ];
   },
});
