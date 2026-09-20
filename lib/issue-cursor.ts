/**
 * Cursor keyset da listagem de issues (#25), compartilhado entre cliente e servidor.
 *
 * Formato `rank~id`: a ordem é `(rank, id)`, então empates de rank não pulam issues
 * entre páginas. `~` não aparece em LexoRank nem em UUID. Um cursor SEM `~` é o formato
 * antigo (só o rank) e continua aceito pelo servidor.
 */
const SEP = '~';

export function issueCursor(issue: { rank: string; id: string }): string {
   return `${issue.rank}${SEP}${issue.id}`;
}

export function parseIssueCursor(cursor: string): { rank: string; id: string | null } {
   const at = cursor.lastIndexOf(SEP);
   if (at < 0) return { rank: cursor, id: null };
   return { rank: cursor.slice(0, at), id: cursor.slice(at + 1) || null };
}
