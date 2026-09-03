import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';

/**
 * Menu "/" mínimo do editor de blocos (#16): lista os blocos disponíveis e troca o
 * parágrafo atual pelo bloco escolhido. Sem React aqui — a renderização do menu é
 * injetada pelo `BlockEditor` via `suggestion.render`.
 */
export interface SlashItem {
   id: string;
   title: string;
   keywords: string[];
   run: (editor: Editor, range: Range) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
   {
      id: 'paragraph',
      title: 'Text',
      keywords: ['text', 'paragraph', 'plain'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
   },
   {
      id: 'heading1',
      title: 'Heading 1',
      keywords: ['h1', 'title', 'heading'],
      run: (editor, range) =>
         editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
   },
   {
      id: 'heading2',
      title: 'Heading 2',
      keywords: ['h2', 'subtitle', 'heading'],
      run: (editor, range) =>
         editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
   },
   {
      id: 'heading3',
      title: 'Heading 3',
      keywords: ['h3', 'heading'],
      run: (editor, range) =>
         editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
   },
   {
      id: 'bulletList',
      title: 'Bullet list',
      keywords: ['list', 'bullet', 'unordered', 'ul'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
   },
   {
      id: 'orderedList',
      title: 'Numbered list',
      keywords: ['list', 'numbered', 'ordered', 'ol'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
   },
   {
      id: 'taskList',
      title: 'Task list',
      keywords: ['todo', 'task', 'checklist', 'checkbox'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
   },
   {
      id: 'codeBlock',
      title: 'Code block',
      keywords: ['code', 'snippet', 'pre'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setCodeBlock().run(),
   },
   {
      id: 'blockquote',
      title: 'Quote',
      keywords: ['quote', 'blockquote', 'citation'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setBlockquote().run(),
   },
   {
      id: 'divider',
      title: 'Divider',
      keywords: ['divider', 'rule', 'hr', 'separator', 'line'],
      run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
   },
];

export function filterSlashItems(query: string): SlashItem[] {
   const q = query.trim().toLowerCase();
   if (!q) return SLASH_ITEMS;
   return SLASH_ITEMS.filter(
      (item) => item.title.toLowerCase().includes(q) || item.keywords.some((k) => k.startsWith(q))
   );
}

export interface SlashCommandOptions {
   suggestion: Partial<SuggestionOptions<SlashItem, SlashItem>>;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
   name: 'slashCommand',

   addOptions() {
      return { suggestion: {} };
   },

   addProseMirrorPlugins() {
      return [
         Suggestion<SlashItem, SlashItem>({
            editor: this.editor,
            pluginKey: new PluginKey('slashCommand'),
            char: '/',
            allowSpaces: false,
            startOfLine: false,
            items: ({ query }) => filterSlashItems(query),
            command: ({ editor, range, props }) => props.run(editor, range),
            // Não abre dentro de code block (o "/" ali é código).
            allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
            ...this.options.suggestion,
         }),
      ];
   },
});
