/**
 * Adapters API -> tipos ricos dos documentos de time. O backend guarda icon como
 * nullable e creator como UserRef | null; a UI usa DocumentFolder/TeamDocument com
 * icon string e creator User. Aplicamos fallbacks de ícone e resolvemos o UserRef.
 */
import { adaptUser } from '@/lib/adapters';
import type { User } from '@/data/users';
import type { DocumentFolder, TeamDocument } from '@/data/documents';
import type { FolderDto, DocumentDto } from '@/lib/api/documents';

const FALLBACK_FOLDER_ICON = '📁';
const FALLBACK_DOC_ICON = '📄';

/** Usuário sintético para documentos sem creator conhecido. */
const UNKNOWN_USER: User = {
   id: 'unknown',
   name: 'Unknown',
   email: '',
   avatarUrl: '',
   status: 'offline',
   role: 'Member',
   joinedDate: '2026-01-01',
   teamIds: [],
   timezone: 'UTC',
};

function adaptDocument(dto: DocumentDto): TeamDocument {
   return {
      id: dto.id,
      name: dto.name,
      icon: dto.icon ?? FALLBACK_DOC_ICON,
      creator: dto.creator ? adaptUser(dto.creator) : UNKNOWN_USER,
      createdAt: dto.createdAt,
      updatedAt: dto.updatedAt,
      pinned: dto.pinned,
   };
}

export function adaptFolders(dtos: FolderDto[]): DocumentFolder[] {
   return dtos.map((f) => ({
      id: f.id,
      name: f.name,
      icon: f.icon ?? FALLBACK_FOLDER_ICON,
      documents: f.documents.map(adaptDocument),
   }));
}
