export interface User {
   id: string;
   name: string;
   avatarUrl: string;
   email: string;
   /** Slug do backend (prefixo do e-mail, único). Usado em @menções. */
   slug?: string;
   status: 'online' | 'offline' | 'away';
   role: 'Member' | 'Admin' | 'Guest' | 'Application';
   joinedDate: string;
   teamIds: string[];
   /** IANA timezone, used to display the member's local time. */
   timezone: string;
}

const avatarUrl = (seed: string) => `https://api.dicebear.com/9.x/glass/svg?seed=${seed}`;

export const statusUserColors = {
   online: '#00cc66',
   offline: '#969696',
   away: '#ffcc00',
};

export const users: User[] = [];
