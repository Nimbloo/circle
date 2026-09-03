/**
 * Allow-list de anexos (#98) — módulo puro, compartilhado pelo servidor (validação do
 * upload) e pela UI (rejeita antes de enviar, ícone por tipo, tamanho legível).
 *
 * A regra é por EXTENSÃO + MIME: a extensão precisa estar na lista e o MIME informado
 * pelo navegador precisa bater com a extensão (ou vir vazio/`application/octet-stream`,
 * comum em `.md`/`.csv`/`.json` no Windows — aí vale o MIME canônico da extensão).
 * svg/html/js e executáveis não entram: fora da lista = recusado.
 */

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'archive' | 'video' | 'document';

interface AllowedType {
   ext: string;
   kind: AttachmentKind;
   /** MIME canônico (o que fica gravado e vai pro S3). */
   contentType: string;
   /** Outros MIMEs que navegadores mandam pra esta extensão. */
   aliases?: string[];
}

const ALLOWED: AllowedType[] = [
   { ext: 'png', kind: 'image', contentType: 'image/png' },
   { ext: 'jpg', kind: 'image', contentType: 'image/jpeg' },
   { ext: 'jpeg', kind: 'image', contentType: 'image/jpeg' },
   { ext: 'gif', kind: 'image', contentType: 'image/gif' },
   { ext: 'webp', kind: 'image', contentType: 'image/webp' },
   { ext: 'pdf', kind: 'pdf', contentType: 'application/pdf' },
   { ext: 'txt', kind: 'text', contentType: 'text/plain' },
   {
      ext: 'md',
      kind: 'text',
      contentType: 'text/markdown',
      aliases: ['text/plain', 'text/x-markdown'],
   },
   {
      ext: 'csv',
      kind: 'text',
      contentType: 'text/csv',
      aliases: ['text/plain', 'application/vnd.ms-excel', 'application/csv'],
   },
   { ext: 'json', kind: 'text', contentType: 'application/json', aliases: ['text/plain'] },
   {
      ext: 'zip',
      kind: 'archive',
      contentType: 'application/zip',
      aliases: ['application/x-zip-compressed', 'multipart/x-zip'],
   },
   { ext: 'mp4', kind: 'video', contentType: 'video/mp4' },
   { ext: 'webm', kind: 'video', contentType: 'video/webm' },
   {
      ext: 'docx',
      kind: 'document',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   },
   {
      ext: 'xlsx',
      kind: 'document',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   },
   {
      ext: 'pptx',
      kind: 'document',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
   },
];

const BY_EXT = new Map(ALLOWED.map((t) => [t.ext, t]));

/** MIMEs "genéricos" que não dizem nada sobre o arquivo — decide pela extensão. */
const GENERIC_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Extensões aceitas, pro `accept` do input de arquivo. */
export const ATTACHMENT_ACCEPT = ALLOWED.map((t) => `.${t.ext}`).join(',');

export interface ResolvedAttachmentType {
   ext: string;
   kind: AttachmentKind;
   contentType: string;
}

export function extensionOf(fileName: string): string {
   const m = /\.([a-z0-9]+)$/i.exec(fileName.trim());
   return m ? m[1].toLowerCase() : '';
}

/**
 * Resolve o tipo do anexo a partir do nome e do MIME informado. `null` = recusado
 * (extensão fora da lista ou MIME incompatível com a extensão).
 */
export function resolveAttachmentType(
   fileName: string,
   contentType: string | null | undefined
): ResolvedAttachmentType | null {
   const type = BY_EXT.get(extensionOf(fileName));
   if (!type) return null;
   const mime = (contentType ?? '').trim().toLowerCase().split(';')[0];
   if (GENERIC_MIMES.has(mime) || mime === type.contentType || type.aliases?.includes(mime)) {
      return { ext: type.ext, kind: type.kind, contentType: type.contentType };
   }
   return null;
}

/** Tipo de anexo pela URL/nome já gravado (ícone/miniatura na UI). */
export function attachmentKindOf(fileName: string, contentType: string): AttachmentKind {
   if (contentType.startsWith('image/')) return 'image';
   if (contentType.startsWith('video/')) return 'video';
   return BY_EXT.get(extensionOf(fileName))?.kind ?? 'document';
}

/** "1.2 MB", "340 KB", "12 B". */
export function formatBytes(size: number): string {
   if (size < 1024) return `${size} B`;
   if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
   const mb = size / (1024 * 1024);
   return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
