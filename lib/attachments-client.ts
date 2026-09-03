/**
 * Anexos no cliente (#98): validação local (mesma allow-list do servidor, pra recusar
 * antes de subir) e upload sequencial via `api.attachments.upload`.
 */
import { api } from '@/lib/client';
import type { AttachmentDto } from '@/lib/api/attachments';
import { MAX_ATTACHMENT_BYTES, formatBytes, resolveAttachmentType } from '@/lib/attachment-types';

/** Motivo da recusa (pt-BR, pro toast) ou null se o arquivo pode subir. */
export function attachmentRejection(file: File): string | null {
   if (!resolveAttachmentType(file.name, file.type))
      return `${file.name}: tipo de arquivo não permitido`;
   if (file.size === 0) return `${file.name}: arquivo vazio`;
   if (file.size > MAX_ATTACHMENT_BYTES)
      return `${file.name}: excede ${formatBytes(MAX_ATTACHMENT_BYTES)}`;
   return null;
}

export function isImageFile(file: File): boolean {
   return file.type.startsWith('image/');
}

/** Arquivos de um paste/drop (FileList ou DataTransfer), já como array. */
export function filesOf(list: FileList | File[] | null | undefined): File[] {
   return Array.from(list ?? []);
}

export interface UploadOutcome {
   uploaded: AttachmentDto[];
   failed: { file: File; error: string }[];
}

/** Sobe os arquivos um a um (mantém a ordem; um erro não derruba os outros). */
export async function uploadAttachmentFiles(
   issueId: string,
   files: File[],
   commentId?: string | null,
   onEach?: (file: File, ok: boolean) => void
): Promise<UploadOutcome> {
   const out: UploadOutcome = { uploaded: [], failed: [] };
   for (const file of files) {
      try {
         out.uploaded.push(await api.attachments.upload(issueId, file, commentId));
         onEach?.(file, true);
      } catch (e) {
         out.failed.push({ file, error: e instanceof Error ? e.message : 'Falha no upload' });
         onEach?.(file, false);
      }
   }
   return out;
}
