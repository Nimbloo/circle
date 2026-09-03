/**
 * Conjunto ÚNICO de extensões do editor de blocos (#16), compartilhado entre o
 * cliente (`BlockEditor`) e o servidor (`docToText` via `generateText`). Sem React:
 * qualquer extensão que dependa de DOM/React vive só no componente.
 *
 * Blocos: paragraph, heading H1–H3, bullet/ordered/task list, code block, quote,
 * divider, imagem (com upload), vídeo (YouTube/Vimeo/Loom/mp4); inline: referência a
 * issue (`#`). Marks: bold, italic, code, link (autolink + colar URL).
 * Os atalhos markdown (`# `, `- `, `1. `, `[ ] `, "```", `> `, `---`, `**x**`, `` `x` ``)
 * vêm do próprio StarterKit/list. Checklist: atalhos e conversão em sub-issue em
 * `editor-tasks.ts`; colar texto com listas em `editor-paste-lists.ts`.
 */
import type { AnyExtension, Extensions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { ImageNode, ImageUpload, type ImageUploadOptions } from './editor-image';
import { Video } from './editor-video';
import { IssueRef } from './editor-issue-ref';
import { PasteLists } from './editor-paste-lists';
import { TaskItemExt, TaskListExt } from './editor-tasks';

export const DEFAULT_PLACEHOLDER = 'Add a description…';

export interface EditorExtensionOptions extends ImageUploadOptions {
   placeholder?: string;
   /**
    * Nó de referência a issue já configurado pelo cliente (NodeView React + sugestões
    * do `#`). Default: o `IssueRef` estático — suficiente para o servidor.
    */
   issueRef?: AnyExtension;
   /**
    * Task item já configurado pelo cliente (NodeView React + `onCreateSubIssue`).
    * Default: o `TaskItemExt` sem NodeView — suficiente para o servidor.
    */
   taskItem?: AnyExtension;
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
      TaskListExt,
      options.taskItem ?? TaskItemExt,
      PasteLists,
      Placeholder.configure({ placeholder: options.placeholder ?? DEFAULT_PLACEHOLDER }),
      ImageNode,
      ImageUpload.configure({ upload: options.upload, onUploadError: options.onUploadError }),
      Video,
      options.issueRef ?? IssueRef,
   ];
}
