'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { attachmentRejection, uploadAttachmentFiles } from '@/lib/attachments-client';
import type { AttachmentChipItem } from './attachment-chip';

/**
 * Upload de anexos da issue com estado de "pendente" (chips com spinner enquanto sobe).
 * Compartilhado pela seção Attachments (botão, drag-and-drop) e pelo colar/soltar de
 * arquivo não-imagem na descrição. Recusa localmente o que o servidor recusaria (toast),
 * sobe um a um e chama `onChanged` (refetch do detalhe) ao terminar.
 */
export function useAttachmentUploader(issueId: string, onChanged: () => void) {
   const [pending, setPending] = useState<AttachmentChipItem[]>([]);
   const seq = useRef(0);

   const addFiles = useCallback(
      async (files: File[]) => {
         const accepted: File[] = [];
         for (const file of files) {
            const reason = attachmentRejection(file);
            if (reason) toast.error(reason);
            else accepted.push(file);
         }
         if (accepted.length === 0) return;
         const items = accepted.map((file) => ({
            id: `pending-${++seq.current}`,
            file,
            chip: {
               id: `pending-${seq.current}`,
               fileName: file.name,
               contentType: file.type,
               size: file.size,
               uploading: true,
            } satisfies AttachmentChipItem,
         }));
         setPending((p) => [...p, ...items.map((i) => i.chip)]);
         const { failed } = await uploadAttachmentFiles(issueId, accepted, null, (file) => {
            const done = items.find((i) => i.file === file);
            if (done) setPending((p) => p.filter((c) => c.id !== done.id));
         });
         for (const f of failed) toast.error(`${f.file.name}: ${f.error}`);
         if (failed.length < accepted.length) onChanged();
      },
      [issueId, onChanged]
   );

   return { pending, addFiles };
}
