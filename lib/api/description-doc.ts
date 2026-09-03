import { docToText, type EditorDoc } from '@/lib/editor-doc';
import { ApiError } from './errors';

/**
 * Deriva a projeção em texto de um documento do editor de blocos (#16).
 * - doc vazio (sem texto) → descrição limpa (`text` e `doc` nulos), para que "sem
 *   descrição" tenha uma única forma no banco.
 * - JSON que não é um doc válido do schema → 400 (o zod só valida a casca).
 */
export function projectDescriptionDoc(doc: EditorDoc | null): {
   text: string | null;
   doc: EditorDoc | null;
} {
   if (doc === null) return { text: null, doc: null };
   let text: string;
   try {
      text = docToText(doc);
   } catch {
      throw new ApiError(400, 'descriptionDoc inválido');
   }
   return text ? { text, doc } : { text: null, doc: null };
}
