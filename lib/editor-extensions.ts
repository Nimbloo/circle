/**
 * Conjunto ÚNICO de extensões do editor de blocos (#16), compartilhado entre o
 * cliente (`BlockEditor`) e o servidor (`docToText` via `generateText`). Sem React:
 * qualquer extensão que dependa de DOM/React vive só no componente.
 *
 * Blocos: paragraph, heading H1–H3, bullet/ordered/task list, code block, quote,
 * divider, imagem (com upload), vídeo (YouTube/Vimeo/Loom/mp4). Marks: bold, italic, code, link (autolink + colar URL).
 * Os atalhos markdown (`# `, `- `, `1. `, `[ ] `, "```", `> `, `---`, `**x**`, `` `x` ``)
 * vêm do próprio StarterKit/list.
 */
import type { Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { ImageNode, ImageUpload, type ImageUploadOptions } from './editor-image';
import { Video } from './editor-video';

export const DEFAULT_PLACEHOLDER = 'Add a description…';

export interface EditorExtensionOptions extends ImageUploadOptions {
   placeholder?: string;
}

export function editorExtensions(options: EditorExtensionOptions = {}): Extensions {
   return [
      StarterKit.configure({
         heading: { levels: [1, 2, 3] },
         // Clique NÃO navega no modo de edição (padrão de editores); no modo leitura o
         // <a> nativo funciona, porque o contenteditable está desligado.
         link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            defaultProtocol: 'https',
         },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: options.placeholder ?? DEFAULT_PLACEHOLDER }),
      ImageNode,
      ImageUpload.configure({ upload: options.upload, onUploadError: options.onUploadError }),
      Video,
   ];
}
