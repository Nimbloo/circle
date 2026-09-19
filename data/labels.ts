export interface LabelInterface {
   id: string;
   name: string;
   color: string;
   /** Grupo mutuamente-exclusivo (paridade Linear). null/undefined = label livre. */
   groupId?: string | null;
}
