import { create } from 'zustand';
import type { Issue } from '@/data/issues';
import type { IssueDetail } from '@/data/issue-details';

interface CurrentIssueState {
   /** Issue aberta na página /issue/[id] e o detail carregado por ela (mesma fonte). */
   issue: Issue | null;
   detail: IssueDetail | null;
   setCurrent: (issue: Issue | null, detail: IssueDetail | null) => void;
   clear: () => void;
}

/**
 * Ponte página → header da issue (#95): o header (layout) precisa do pai e do
 * identifier/título da issue atual, e antes resolvia tudo pelo `issues-store` — que
 * não conhece uma issue aberta por deep-link nem o pai. A página publica aqui o que
 * ela mesma carregou; o header só lê.
 */
export const useCurrentIssueStore = create<CurrentIssueState>((set) => ({
   issue: null,
   detail: null,
   setCurrent: (issue, detail) => set({ issue, detail }),
   clear: () => set({ issue: null, detail: null }),
}));
