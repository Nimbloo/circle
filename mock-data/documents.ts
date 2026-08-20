import { User } from './users';

export interface TeamDocument {
   id: string;
   name: string;
   icon: string;
   creator: User;
   createdAt: string; // ISO date
   updatedAt: string; // ISO date
   pinned?: boolean;
}

export interface DocumentFolder {
   id: string;
   name: string;
   icon: string;
   documents: TeamDocument[];
}

/**
 * Team documents grouped by folder (project or theme), Linear-style.
 * Zerado na migração para API-driven — os documentos reais vêm da API por time
 * (api.teams.documents). Os tipos acima seguem sendo a fonte de verdade da UI.
 */
export const documentFolders: DocumentFolder[] = [];

export function getAllDocuments(): TeamDocument[] {
   return documentFolders.flatMap((folder) => folder.documents);
}
