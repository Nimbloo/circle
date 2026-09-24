import { docToText, type EditorDoc } from '@/lib/editor-doc';
import { sanitizeDoc } from '@/lib/doc-sanitize';
import { ApiError } from './errors';

/**
 * Deriva a projeção em texto de um documento do editor de blocos (#16).
 * - doc vazio (sem texto) → descrição limpa (`text` e `doc` nulos), para que "sem
 *   descrição" tenha uma única forma no banco.
 * - JSON que não é um doc válido do schema → 400 (o zod só valida a casca).
 * - Sanitizado antes de gravar (`sanitizeDoc`): nada de `javascript:` em vídeo/imagem/link.
 */
export function projectDescriptionDoc(doc: EditorDoc | null): {
   text: string | null;
   doc: EditorDoc | null;
} {
   if (doc === null) return { text: null, doc: null };
   let text: string;
   let clean: EditorDoc;
   try {
      clean = sanitizeDoc(doc);
      text = docToText(clean);
   } catch {
      throw new ApiError(400, 'descriptionDoc inválido');
   }
   return text ? { text, doc: clean } : { text: null, doc: null };
}
