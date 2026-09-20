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
