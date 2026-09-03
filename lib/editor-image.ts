/**
 * Imagem no editor de blocos (#16): `@tiptap/extension-image` (bloco) com upload.
 *
 * Fluxo: o arquivo entra por arraste, colar ou pelo item "Image" do menu "/"; o nó nasce
 * com um `blob:` local e `uploading=true` (placeholder com opacidade reduzida), a
 * função `upload` sobe o arquivo e o nó recebe a URL final; em erro, o nó é removido e
 * `onUploadError` avisa (toast no cliente). Sem React e sem tocar em `window` fora dos
 * handlers — o mesmo módulo entra no schema do servidor (`docToText`).
 */
import { Extension, type Editor } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export interface ImageUploadOptions {
   /** Sobe o arquivo e devolve a URL pública. Sem ele, arquivos são ignorados. */
   upload?: (file: File) => Promise<string>;
   onUploadError?: (error: unknown, file: File) => void;
}

declare module '@tiptap/core' {
   interface Commands<ReturnType> {
      imageUpload: {
         /** Insere placeholders e sobe os arquivos de imagem (os demais são ignorados). */
         uploadImages: (files: File[], pos?: number) => ReturnType;
         /** Abre o seletor de arquivos do navegador e sobe a imagem escolhida. */
         pickImage: () => ReturnType;
      };
   }
}

export const ImageNode = Image.extend({
   addAttributes() {
      return {
         ...this.parent?.(),
         // Transitório: true enquanto o upload não terminou (placeholder).
         uploading: {
            default: false,
            parseHTML: () => false,
            renderHTML: (attrs) => (attrs.uploading ? { 'data-uploading': 'true' } : {}),
         },
      };
   },
});

function imageFiles(list: FileList | null | undefined): File[] {
   return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

/** Posição do nó `image` cujo `src` é o placeholder — ou null se o usuário o apagou. */
function findBySrc(editor: Editor, src: string): number | null {
   let found: number | null = null;
   editor.state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.name === 'image' && node.attrs.src === src) found = pos;
      return found === null;
   });
   return found;
}

interface PendingUpload {
   file: File;
   placeholder: string;
}

/** Substitui o placeholder pela URL final; em erro remove o nó e avisa. */
async function finishUpload(editor: Editor, pending: PendingUpload, options: ImageUploadOptions) {
   const { file, placeholder } = pending;
   try {
      const url = await options.upload!(file);
      const at = findBySrc(editor, placeholder);
      if (at !== null) {
         editor.commands.command(({ tr }) => {
            const current = tr.doc.nodeAt(at);
            if (!current) return false;
            tr.setNodeMarkup(at, undefined, { ...current.attrs, src: url, uploading: false });
            return true;
         });
      }
   } catch (error) {
      const at = findBySrc(editor, placeholder);
      if (at !== null) {
         editor.commands.command(({ tr }) => {
            const current = tr.doc.nodeAt(at);
            if (!current) return false;
            tr.delete(at, at + current.nodeSize);
            return true;
         });
      }
      options.onUploadError?.(error, file);
   } finally {
      URL.revokeObjectURL(placeholder);
   }
}

export const ImageUpload = Extension.create<ImageUploadOptions>({
   name: 'imageUpload',

   addOptions() {
      return { upload: undefined, onUploadError: undefined };
   },

   addCommands() {
      return {
         uploadImages:
            (files, pos) =>
            ({ editor, commands, dispatch }) => {
               const images = files.filter((f) => f.type.startsWith('image/'));
               if (images.length === 0 || !this.options.upload) return false;
               if (!dispatch) return true;
               // Placeholders entram na MESMA transação do comando; cada upload corre em
               // paralelo e resolve o próprio nó (pelo `src` do placeholder) ao terminar.
               const pending: PendingUpload[] = images.map((file) => ({
                  file,
                  placeholder: URL.createObjectURL(file),
               }));
               const nodes = pending.map(({ file, placeholder }) => ({
                  type: 'image',
                  attrs: { src: placeholder, alt: file.name, uploading: true },
               }));
               const inserted =
                  pos === undefined
                     ? commands.insertContent(nodes)
                     : commands.insertContentAt(pos, nodes);
               if (!inserted) return false;
               const options = this.options;
               queueMicrotask(() => pending.forEach((p) => void finishUpload(editor, p, options)));
               return true;
            },
         pickImage:
            () =>
            ({ editor }) => {
               if (!this.options.upload || typeof document === 'undefined') return false;
               const input = document.createElement('input');
               input.type = 'file';
               input.accept = 'image/*';
               input.multiple = true;
               input.onchange = () => {
                  const files = imageFiles(input.files);
                  if (files.length) editor.commands.uploadImages(files);
               };
               input.click();
               return true;
            },
      };
   },

   addProseMirrorPlugins() {
      const upload = (view: EditorView, files: File[], pos?: number) => {
         if (files.length === 0 || !this.options.upload) return false;
         this.editor.commands.uploadImages(files, pos);
         return true;
      };
      return [
         new Plugin({
            key: new PluginKey('imageUpload'),
            props: {
               handlePaste: (view, event) => upload(view, imageFiles(event.clipboardData?.files)),
               handleDrop: (view, event) => {
                  const files = imageFiles(event.dataTransfer?.files);
                  if (files.length === 0) return false;
                  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
                  return upload(view, files, coords?.pos);
               },
            },
         }),
      ];
   },
});
