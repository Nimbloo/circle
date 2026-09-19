import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Entidades visitadas recentemente (client-side, localStorage). Alimenta o grupo
 * "Recently viewed" do ⌘K — atalho p/ voltar a issues/projects abertos há pouco.
 * Dedup por `${type}:${id}`, mais recente primeiro, cap em MAX.
 *
 * Por DONO (`${orgId}:${userId}`): o localStorage é do navegador, e sem a chave o
 * próximo usuário da máquina (ou outra org) via os recentes do anterior.
 */
export type RecentType = 'issue' | 'project';

export interface RecentEntry {
   type: RecentType;
   id: string;
   label: string;
   /** Só issue: identifier (ENG-42) usado no href e no rótulo. */
   identifier?: string;
}

const MAX = 8;
const EMPTY: RecentEntry[] = [];

interface RecentsState {
   byOwner: Record<string, RecentEntry[]>;
   push: (owner: string, entry: RecentEntry) => void;
   recentsOf: (owner: string) => RecentEntry[];
}

export const useRecentsStore = create<RecentsState>()(
   persist(
      (set, get) => ({
         byOwner: {},
         push: (owner, entry) =>
            set((s) => {
               const key = `${entry.type}:${entry.id}`;
               const current = s.byOwner[owner] ?? EMPTY;
               const next = [entry, ...current.filter((r) => `${r.type}:${r.id}` !== key)];
               return { byOwner: { ...s.byOwner, [owner]: next.slice(0, MAX) } };
            }),
         recentsOf: (owner) => get().byOwner[owner] ?? EMPTY,
      }),
      {
         name: 'circle-recents',
         version: 1,
         // v0 era uma lista única do navegador, sem dono: não dá para atribuir — descarta.
         migrate: () => ({ byOwner: {} }),
      }
   )
);

/**
 * Rótulo e identifier vêm da entidade VIVA (rename reflete; mover de time troca o
 * identifier). Entidade que não existe mais some — mas só depois que as issues
 * carregaram, senão o store vazio do boot apagaria todos os recentes da tela.
 */
export function resolveRecents(
   entries: RecentEntry[],
   issues: { id: string; title: string; identifier: string }[],
   projects: { id: string; name: string }[],
   loaded: boolean
): RecentEntry[] {
   if (!loaded) return entries;
   const issueById = new Map(issues.map((i) => [i.id, i]));
   const projectById = new Map(projects.map((p) => [p.id, p]));
   return entries.flatMap((r) => {
      if (r.type === 'issue') {
         const i = issueById.get(r.id);
         return i ? [{ ...r, label: i.title, identifier: i.identifier }] : [];
      }
      const p = projectById.get(r.id);
      return p ? [{ ...r, label: p.name }] : [];
   });
}
