import type { GroupDropValue } from '@/components/common/issues/use-issue-drop-target';
import { create } from 'zustand';

interface CreateIssueState {
   isOpen: boolean;
   /**
    * Valor pré-preenchido pelo "+" de uma coluna do board (is#24): antes só status
    * funcionava — coluna de assignee/priority/project abria o form em branco.
    */
   defaultDrop: GroupDropValue | null;

   // Actions
   openModal: (drop?: GroupDropValue) => void;
   closeModal: () => void;
}

export const useCreateIssueStore = create<CreateIssueState>((set) => ({
   // Initial state
   isOpen: false,
   defaultDrop: null,

   // Actions
   openModal: (drop) => set({ isOpen: true, defaultDrop: drop || null }),
   closeModal: () => set({ isOpen: false }),
}));
