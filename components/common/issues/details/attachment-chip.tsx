'use client';

import { cn } from '@/lib/utils';
import { attachmentKindOf, formatBytes, type AttachmentKind } from '@/lib/attachment-types';
import {
   File as FileIcon,
   FileArchive,
   FileImage,
   FileSpreadsheet,
   FileText,
   FileVideo,
   Loader2,
   X,
} from 'lucide-react';
import { useState } from 'react';

/** Item exibido como chip: anexo salvo (`url`) ou arquivo ainda subindo/pendente (sem `url`). */
export interface AttachmentChipItem {
   id: string;
   fileName: string;
   contentType: string;
   size: number;
   url?: string;
   /** true enquanto o upload está em curso (spinner no lugar do ícone). */
   uploading?: boolean;
}

const ICONS: Record<AttachmentKind, typeof FileIcon> = {
   image: FileImage,
   pdf: FileText,
   text: FileText,
   archive: FileArchive,
   video: FileVideo,
   document: FileSpreadsheet,
};

export function AttachmentIcon({
   item,
   className,
}: {
   item: AttachmentChipItem;
   className?: string;
}) {
   const Icon = ICONS[attachmentKindOf(item.fileName, item.contentType)] ?? FileIcon;
   return <Icon className={cn('size-4 shrink-0 text-muted-foreground', className)} />;
}

/**
 * Chip de anexo (padrão Linear): ícone por tipo (miniatura pra imagem), nome e tamanho;
 * abre em nova aba. Remoção com confirmação inline (sem modal) quando `onRemove` existe.
 */
export function AttachmentChip({
   item,
   onRemove,
   confirmRemove = true,
}: {
   item: AttachmentChipItem;
   /** Presente = quem vê pode remover (uploader/admin, ou o próprio arquivo pendente). */
   onRemove?: () => void | Promise<void>;
   /** false = remove direto (arquivo pendente no composer). */
   confirmRemove?: boolean;
}) {
   const [confirming, setConfirming] = useState(false);
   const [busy, setBusy] = useState(false);
   const isImage = item.contentType.startsWith('image/');

   const remove = async () => {
      if (busy) return;
      setBusy(true);
      try {
         await onRemove?.();
      } finally {
         setBusy(false);
         setConfirming(false);
      }
   };

   const body = (
      <>
         {isImage && item.url && !item.uploading ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
               src={item.url}
               alt=""
               className="size-8 shrink-0 rounded object-cover bg-accent"
               loading="lazy"
            />
         ) : item.uploading ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
         ) : (
            <AttachmentIcon item={item} />
         )}
         <span className="min-w-0 flex flex-col leading-tight">
            <span className="truncate text-sm">{item.fileName}</span>
            <span className="text-[11px] text-muted-foreground">
               {item.uploading ? 'Uploading…' : formatBytes(item.size)}
            </span>
         </span>
      </>
   );

   return (
      <div
         data-testid="attachment-chip"
         className={cn(
            'group/chip relative inline-flex max-w-full items-center gap-2 rounded-md border border-border/60 bg-container py-1.5 pl-2 text-left',
            onRemove ? 'pr-7' : 'pr-2.5',
            item.uploading && 'opacity-70'
         )}
      >
         {confirming ? (
            <span className="flex items-center gap-2 text-xs">
               <span className="text-muted-foreground">Remove {item.fileName}?</span>
               <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  className="font-medium text-destructive hover:underline disabled:opacity-50"
               >
                  Remove
               </button>
               <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="text-muted-foreground hover:text-foreground"
               >
                  Cancel
               </button>
            </span>
         ) : item.url && !item.uploading ? (
            <a
               href={item.url}
               target="_blank"
               rel="noopener noreferrer"
               className="flex min-w-0 items-center gap-2 hover:underline"
               title={item.fileName}
            >
               {body}
            </a>
         ) : (
            <span className="flex min-w-0 items-center gap-2" title={item.fileName}>
               {body}
            </span>
         )}
         {onRemove && !confirming && !item.uploading && (
            <button
               type="button"
               aria-label={`Remove ${item.fileName}`}
               onClick={() => (confirmRemove ? setConfirming(true) : void remove())}
               className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/chip:opacity-100"
            >
               <X className="size-3.5" />
            </button>
         )}
      </div>
   );
}
