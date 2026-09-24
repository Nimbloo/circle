import type { JSONContent } from '@tiptap/core';
import type { EditorDoc } from './editor-doc';
import { parseVideoUrl } from './editor-video';

/**
 * Sanitiza o JSON do editor de blocos antes de gravar (servidor) — defesa contra XSS
 * armazenado: o schema do editor valida só a forma, e um PATCH direto na API (ou HTML
 * colado) podia gravar `javascript:` em atributos que viram `href`/`src`.
 *
 * - `video`: só se o `src` for uma URL de vídeo reconhecida (`parseVideoUrl`, http/https);
 *   o `provider` vem da URL, nunca do JSON recebido. Senão o nó sai.
 * - `image`: só `http(s):` ou `data:image/…`. `blob:` (placeholder de upload) também sai —
 *   no banco ele seria uma imagem quebrada para sempre.
 * - marca `link`: só `http(s):`, `mailto:` ou caminho relativo; senão a marca sai (o texto fica).
 */
export function sanitizeDoc(doc: EditorDoc): EditorDoc {
   return (sanitizeNode(doc) ?? { type: 'doc', content: [] }) as EditorDoc;
}

const SAFE_IMAGE = /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);)/i;
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

function sanitizeNode(node: JSONContent): JSONContent | null {
   if (node.type === 'video') {
      const video = parseVideoUrl(String(node.attrs?.src ?? ''));
      return video ? { ...node, attrs: { ...node.attrs, ...video } } : null;
   }
   if (node.type === 'image') {
      const src = String(node.attrs?.src ?? '');
      return SAFE_IMAGE.test(src) ? node : null;
   }
   const out: JSONContent = { ...node };
   if (node.marks) {
      const marks = node.marks.filter(
         (mark) => mark.type !== 'link' || SAFE_HREF.test(String(mark.attrs?.href ?? '').trim())
      );
      if (marks.length) out.marks = marks;
      else delete out.marks;
   }
   if (node.content) {
      out.content = node.content
         .map(sanitizeNode)
         .filter((child): child is JSONContent => child !== null);
   }
   return out;
}
