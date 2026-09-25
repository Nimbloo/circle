import { create } from 'zustand';

/** Resultado da busca de uma saved search (#99), por chave `view|termo|time`. */
export interface SavedSearchEntry {
   /** Ids ranqueados pelo servidor; `null` enquanto a 1ª busca não voltou. */
   rankedIds: string[] | null;
   /** A busca falhou sem resultado anterior para mostrar. */
   error: boolean;
}

interface SavedSearchState {
   byKey: Record<string, SavedSearchEntry>;
   setEntry: (key: string, entry: SavedSearchEntry) => void;
}

/**
 * Fonte única do ranking de uma saved search: o corpo da view busca e grava aqui, e o
 * header lê o mesmo resultado — antes o contador ignorava o termo e divergia da lista.
 */
export const useSavedSearchStore = create<SavedSearchState>((set) => ({
   byKey: {},
   setEntry: (key, entry) => set((s) => ({ byKey: { ...s.byKey, [key]: entry } })),
}));
