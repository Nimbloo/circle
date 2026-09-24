'use client';

import { useRef } from 'react';
import { MOTION_MS } from '@/lib/motion';

/**
 * Acima disto a mudança é um LOTE (troca de filtro/ordenação, página nova, re-hidratação)
 * e a lista só troca, sem animar: 40 linhas deslizando ao mesmo tempo é ruído, não
 * informação. Abaixo, é o evento pontual do realtime (issue criada, status mudou, alguém
 * arrastou um card) — e aí o movimento conta o que aconteceu.
 */
export const LIST_MOTION_MAX_CHANGES = 5;

/** Quanto tempo depois da mudança as linhas seguem com a transição ligada. */
const WINDOW_MS = MOTION_MS.base + 120;

const NONE: ReadonlySet<string> = new Set();

export interface ListChanges {
   added: string[];
   removed: number;
   /** Mínimo de itens que trocaram de posição relativa (n − maior subsequência crescente). */
   moved: number;
}

/** Tamanho da maior subsequência estritamente crescente (O(n log n)). */
function lisLength(values: number[]): number {
   const tails: number[] = [];
   for (const v of values) {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
         const mid = (lo + hi) >> 1;
         if (tails[mid] < v) lo = mid + 1;
         else hi = mid;
      }
      tails[lo] = v;
   }
   return tails.length;
}

/** O que mudou de `prev` para `next` (chaves únicas por lista). */
export function diffListKeys(prev: readonly string[], next: readonly string[]): ListChanges {
   const prevIndex = new Map<string, number>();
   prev.forEach((key, i) => prevIndex.set(key, i));
   const added: string[] = [];
   const kept: number[] = [];
   for (const key of next) {
      const at = prevIndex.get(key);
      if (at === undefined) added.push(key);
      else kept.push(at);
   }
   return {
      added,
      removed: prev.length - kept.length,
      moved: kept.length - lisLength(kept),
   };
}

/** Mudança pequena o bastante para animar (e maior que zero). */
export function isAnimatableChange({ added, removed, moved }: ListChanges): boolean {
   const total = added.length + removed + moved;
   return total > 0 && total <= LIST_MOTION_MAX_CHANGES;
}

interface MotionState {
   keys: readonly string[];
   resetKey: string;
   until: number;
   entering: ReadonlySet<string>;
}

/**
 * Motion de lista viva: diz, no MESMO render em que a lista mudou, se as linhas devem
 * deslizar para a nova posição (`moving` → `.list-move`) e quais chaves acabaram de chegar
 * (`entering` → `.list-enter`/`.list-grow`). Tem que ser no render — num efeito, a posição
 * nova já teria sido pintada sem transição.
 *
 * Não anima: a primeira população (carga inicial, dado do cache ou lista vazia → dados), a
 * troca de contexto (`resetKey`: outra view, grupo recolhido) e lotes grandes. `keys` deve
 * ser memoizado — é por identidade que se sabe que a lista mudou.
 */
export function useListMotion(
   keys: readonly string[],
   resetKey = ''
): { moving: boolean; entering: ReadonlySet<string> } {
   const state = useRef<MotionState | null>(null);
   const prev = state.current;
   const now = performance.now();
   if (!prev || prev.keys !== keys || prev.resetKey !== resetKey) {
      let until = 0;
      let entering = NONE;
      if (prev && prev.resetKey === resetKey && prev.keys.length > 0) {
         const changes = diffListKeys(prev.keys, keys);
         const total = changes.added.length + changes.removed + changes.moved;
         if (isAnimatableChange(changes)) {
            until = now + WINDOW_MS;
            entering = changes.added.length > 0 ? new Set(changes.added) : NONE;
         } else if (total === 0) {
            // Mesmo conteúdo em outro array: mantém a janela que estiver correndo.
            until = prev.until;
            entering = prev.entering;
         }
      }
      state.current = { keys, resetKey, until, entering };
   }
   const current = state.current!;
   const moving = now < current.until;
   return { moving, entering: moving ? current.entering : NONE };
}
