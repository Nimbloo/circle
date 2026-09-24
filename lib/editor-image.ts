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
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

export interface ImageUploadOptions {
   /** Sobe o arquivo e devolve a URL pública. Sem ele, arquivos são ignorados. */
   upload?: (file: File) => Promise<string>;
   onUploadError?: (error: unknown, file: File) => void;
   /**
    * Pré-validação ANTES do placeholder e da leitura do arquivo: devolve a mensagem de
    * recusa (vai para `onUploadError`) ou null. Ex.: `validateEditorImage`.
    */
   validate?: (file: File) => string | null;
   /**
    * Colar HTML: `<img>` cujo `src` a página não pode exibir (CSP `img-src`) é descartado
    * e `onImagesDropped` avisa quantas saíram. Sem ele, colar mantém tudo.
    */
   isEmbeddableSrc?: (src: string) => boolean;
   onImagesDropped?: (count: number) => void;
}

/**
 * `src` que o CSP da página deixa exibir (`img-src 'self' data: blob: <CDN>`): mesma
 * origem, `data:image/…` ou o CDN (`NEXT_PUBLIC_CIRCLE_CDN_URL`, injetado pelo
 * next.config). Imagem de terceiro colada ficaria quebrada para sempre: o fetch para
 * re-subir também é barrado (`connect-src 'self'`), então ela é descartada com aviso.
 */
export function isEmbeddableImageSrc(src: string): boolean {
   if (/^data:image\//i.test(src)) return true;
   if (src.startsWith('/') && !src.startsWith('//')) return true;
   let url: URL;
   try {
      url = new URL(src);
   } catch {
      return false;
   }
   const cdn = process.env.NEXT_PUBLIC_CIRCLE_CDN_URL;
   const allowed = [typeof window === 'undefined' ? null : window.location.origin];
   if (cdn) {
      try {
         allowed.push(new URL(cdn).origin);
      } catch {
         // CDN mal configurado: só a mesma origem
      }
   }
   return allowed.includes(url.origin);
}

/** Tira do conteúdo colado as imagens que não podem ser exibidas; conta as removidas. */
function stripImages(
   fragment: Fragment,
   keep: (src: string) => boolean,
   removed: { count: number }
): Fragment {
   const nodes: PMNode[] = [];
   fragment.forEach((node) => {
      if (node.type.name === 'image' && !keep(String(node.attrs.src ?? ''))) {
         removed.count++;
         return;
      }
      if (node.isLeaf || node.content.size === 0) {
         nodes.push(node);
         return;
      }
      const content = stripImages(node.content, keep, removed);
      // Contêiner que ficou vazio/inválido sem a imagem (ex.: item de lista) sai junto.
      if (content.size === 0 || !node.type.validContent(content)) return;
      nodes.push(node.copy(content));
   });
   return Fragment.fromArray(nodes);
}

/** Tipos que `POST /uploads` aceita (`lib/api/uploads.ts`: raster comum, sem SVG). */
export const EDITOR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
/** Limite de `POST /uploads` (`MAX_UPLOAD_BYTES` do servidor). */
export const EDITOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Recusa no cliente o que o servidor recusaria — sem ler o arquivo em base64 à toa. */
export function validateEditorImage(file: File): string | null {
   if (!EDITOR_IMAGE_TYPES.includes(file.type))
      return `${file.name}: formato não suportado — use PNG, JPEG, WebP ou GIF`;
   if (file.size > EDITOR_IMAGE_MAX_BYTES) return `${file.name}: a imagem passa de 5 MB`;
   return null;
}

declare module '@tiptap/core' {
   interface Storage {
      imageUpload: ImageUploadStorage;
   }
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

/** Uploads em curso do editor: placeholder `blob:` → URL final (ou null se falhou). */
export interface ImageUploadStorage {
   inflight: Map<string, Promise<string | null>>;
   /**
    * Uploads já concluídos: placeholder → URL final (null = falhou). Um undo depois do
    * upload devolve o placeholder ao doc; com isto ele é resolvido em vez de travar o save.
    */
   settled: Map<string, string | null>;
}

interface JsonNode {
   type?: string;
   attrs?: Record<string, unknown>;
   content?: JsonNode[];
}

/**
 * O doc tem imagem ainda subindo (placeholder `blob:`)? Não deve ser salvo assim.
 * Com `inflight`, só conta o placeholder cujo upload está de fato em curso: um órfão
 * (upload já encerrado, placeholder de volta por undo/colagem) não adia o save.
 */
export function docHasPendingUploads(
   doc: JsonNode,
   inflight?: Map<string, Promise<string | null>>
): boolean {
   if (doc.type === 'image' && (doc.attrs?.uploading || String(doc.attrs?.src).startsWith('blob:')))
      return !inflight || inflight.has(String(doc.attrs?.src));
   return (doc.content ?? []).some((node) => docHasPendingUploads(node, inflight));
}

/**
 * Troca, no JSON, cada placeholder pela URL final do upload (`null` = falhou: o nó sai).
 * Usado quando o editor já foi desmontado e o doc pendente precisa ser salvo completo.
 */
export function resolveUploadPlaceholders<T extends JsonNode>(
   doc: T,
   results: Map<string, string | null>
): T {
   const walk = (node: JsonNode): JsonNode | null => {
      if (node.type === 'image' && typeof node.attrs?.src === 'string') {
         const src = node.attrs.src;
         if (results.has(src)) {
            const url = results.get(src);
            return url ? { ...node, attrs: { ...node.attrs, src: url, uploading: false } } : null;
         }
         if (src.startsWith('blob:')) return null;
      }
      if (!node.content) return node;
      return {
         ...node,
         content: node.content.map(walk).filter((n): n is JsonNode => n !== null),
      };
   };
   return walk(doc) as T;
}

/** Espera os uploads em curso e devolve placeholder → URL final (null = falhou). */
export async function settleUploads(
   storage: ImageUploadStorage | undefined
): Promise<Map<string, string | null>> {
   const entries = [...(storage?.inflight ?? new Map()).entries()];
   const settled = await Promise.all(entries.map(([, p]) => p));
   return new Map(entries.map(([placeholder], i) => [placeholder, settled[i]]));
}

/** Substitui o placeholder pela URL final; em erro remove o nó e avisa. */
async function finishUpload(
   editor: Editor,
   pending: PendingUpload,
   options: ImageUploadOptions
): Promise<string | null> {
   const { file, placeholder } = pending;
   try {
      const url = await options.upload!(file);
      // Editor desmontado no meio do upload: quem salva é o flush do unmount (que espera
      // este upload e troca o placeholder no JSON).
      if (editor.isDestroyed) return url;
      const at = findBySrc(editor, placeholder);
      if (at !== null) {
         editor.commands.command(({ tr }) => {
            const current = tr.doc.nodeAt(at);
            if (!current) return false;
            tr.setNodeMarkup(at, undefined, { ...current.attrs, src: url, uploading: false });
            return true;
         });
      }
      return url;
   } catch (error) {
      const at = editor.isDestroyed ? null : findBySrc(editor, placeholder);
      if (at !== null) {
         editor.commands.command(({ tr }) => {
            const current = tr.doc.nodeAt(at);
            if (!current) return false;
            tr.delete(at, at + current.nodeSize);
            return true;
         });
      }
      options.onUploadError?.(error, file);
      return null;
   } finally {
      URL.revokeObjectURL(placeholder);
   }
}

export const ImageUpload = Extension.create<ImageUploadOptions, ImageUploadStorage>({
   name: 'imageUpload',

   addOptions() {
      return {
         upload: undefined,
         onUploadError: undefined,
         validate: undefined,
         isEmbeddableSrc: undefined,
         onImagesDropped: undefined,
      };
   },

   addStorage() {
      return { inflight: new Map(), settled: new Map() };
   },

   addCommands() {
      return {
         uploadImages:
            (files, pos) =>
            ({ editor, commands, dispatch }) => {
               const candidates = files.filter((f) => f.type.startsWith('image/'));
               if (candidates.length === 0 || !this.options.upload) return false;
               if (!dispatch) return true;
               const { validate, onUploadError } = this.options;
               const images = candidates.filter((file) => {
                  const problem = validate?.(file) ?? null;
                  if (problem) onUploadError?.(new Error(problem), file);
                  return !problem;
               });
               // Tudo recusado: consumido (o aviso já saiu), sem placeholder.
               if (images.length === 0) return true;
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
               const { inflight, settled } = this.storage;
               // Registrado JÁ (o upload começa no microtask seguinte): um unmount logo
               // depois ainda enxerga o upload e espera por ele antes de salvar.
               pending.forEach((p) => {
                  const done = Promise.resolve()
                     .then(() => finishUpload(editor, p, options))
                     .then((url) => {
                        settled.set(p.placeholder, url);
                        return url;
                     });
                  inflight.set(p.placeholder, done);
                  void done.finally(() => inflight.delete(p.placeholder));
               });
               return true;
            },
         pickImage:
            () =>
            ({ editor }) => {
               if (!this.options.upload || typeof document === 'undefined') return false;
               const input = document.createElement('input');
               input.type = 'file';
               input.accept = this.options.validate ? EDITOR_IMAGE_TYPES.join(',') : 'image/*';
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
               transformPasted: (slice) => {
                  const keep = this.options.isEmbeddableSrc;
                  if (!keep) return slice;
                  const removed = { count: 0 };
                  const content = stripImages(slice.content, keep, removed);
                  if (removed.count === 0) return slice;
                  this.options.onImagesDropped?.(removed.count);
                  return content.size === 0
                     ? Slice.empty
                     : new Slice(content, slice.openStart, slice.openEnd);
               },
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
