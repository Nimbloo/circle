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
   removed: string[];
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
   const nextKeys = new Set(next);
   return {
      added,
      removed: prev.filter((key) => !nextKeys.has(key)),
      moved: kept.length - lisLength(kept),
   };
}

/** Mudança pequena o bastante para animar (e maior que zero). */
export function isAnimatableChange({ added, removed, moved }: ListChanges): boolean {
   const total = added.length + removed.length + moved;
   return total > 0 && total <= LIST_MOTION_MAX_CHANGES;
}

interface MotionState {
   keys: readonly string[];
   resetKey: string;
   until: number;
   entering: ReadonlySet<string>;
   leaving: ReadonlySet<string>;
   version: number;
}

export interface ListMotion {
   /** Janela de transição aberta: as linhas levam `.list-move`. */
   moving: boolean;
   /** Chaves que acabaram de chegar. */
   entering: ReadonlySet<string>;
   /** Chaves que acabaram de sair (a lista virtual desenha um fantasma com `.list-exit`). */
   leaving: ReadonlySet<string>;
   /** Muda a cada mudança animável — é o "começo" de uma janela. */
   version: number;
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
export function useListMotion(keys: readonly string[], resetKey = ''): ListMotion {
   const state = useRef<MotionState | null>(null);
   const prev = state.current;
   const now = performance.now();
   if (!prev || prev.keys !== keys || prev.resetKey !== resetKey) {
      let until = 0;
      let entering = NONE;
      let leaving = NONE;
      let version = prev?.version ?? 0;
      if (prev && prev.resetKey === resetKey && prev.keys.length > 0) {
         const changes = diffListKeys(prev.keys, keys);
         const total = changes.added.length + changes.removed.length + changes.moved;
         if (isAnimatableChange(changes)) {
            until = now + WINDOW_MS;
            entering = changes.added.length > 0 ? new Set(changes.added) : NONE;
            leaving = changes.removed.length > 0 ? new Set(changes.removed) : NONE;
            version += 1;
         } else if (total === 0) {
            // Mesmo conteúdo em outro array: mantém a janela que estiver correndo.
            until = prev.until;
            entering = prev.entering;
            leaving = prev.leaving;
         }
      }
      state.current = { keys, resetKey, until, entering, leaving, version };
   }
   const current = state.current!;
   const moving = now < current.until;
   return {
      moving,
      entering: moving ? current.entering : NONE,
      leaving: moving ? current.leaving : NONE,
      version: current.version,
   };
}

/**
 * Separa o deslocamento que conta uma história (reordenação, chegada, saída) do que é só
 * RE-MEDIÇÃO (card do board que mudou de altura: imagem, fonte, label nova). Na coluna do
 * board a posição vem da altura medida dos cards de cima; se ela muda depois da mudança de
 * dados, a linha não deve deslizar de novo — vai direto para o lugar.
 *
 * Regra: numa janela (`version`), a primeira posição vista de cada chave é o alvo. Até o
 * próximo quadro (`settle`), ajustes ainda contam como o mesmo movimento — é a medição
 * síncrona do card que acabou de montar, feita antes da pintura, e a transição só é
 * redirecionada. Depois disso, posição diferente do alvo = re-medição: sem transição.
 */
export class MoveGate {
   private targets = new Map<string, number>();
   private version = -1;
   private settling = false;

   constructor(
      // No servidor (SSR) não há quadro: nada a assentar.
      private readonly settle: (done: () => void) => void = (done) =>
         typeof requestAnimationFrame === 'function' ? void requestAnimationFrame(done) : done()
   ) {}

   /** Chamar a cada render com a `version` do `useListMotion`. */
   sync(version: number) {
      if (version === this.version) return;
      this.version = version;
      this.targets = new Map();
      this.settling = true;
      this.settle(() => {
         if (this.version === version) this.settling = false;
      });
   }

   /** Esta linha, nesta posição, pode deslizar? (fora da janela: nunca). */
   allow(key: string, start: number, moving: boolean): boolean {
      if (!moving) return false;
      const target = this.targets.get(key);
      this.targets.set(key, start);
      return target === undefined || target === start || this.settling;
   }
}

/**
 * Fantasmas de saída da lista virtual: a linha removida já não está no virtualizer, então
 * a lista guarda o que desenhou no render anterior (`remember`) e, quando uma mudança
 * animável tira chaves que estavam na tela, devolve o último desenho delas para um
 * `.list-exit` por cima do lugar antigo. Calculado uma vez por `version` (o render duplo
 * do StrictMode não perde o anterior).
 */
export class LeavingGhosts<T> {
   private seen = new Map<string, T>();
   private next = new Map<string, T>();
   private cache: { version: number; items: { key: string; value: T }[] } = {
      version: 0,
      items: [],
   };

   /** Começo do render: fecha o que foi desenhado no anterior e devolve os fantasmas. */
   begin(motion: ListMotion): { key: string; value: T }[] {
      if (this.next.size > 0) this.seen = this.next;
      this.next = new Map();
      if (motion.version !== this.cache.version) {
         const items: { key: string; value: T }[] = [];
         for (const key of motion.leaving) {
            const value = this.seen.get(key);
            if (value !== undefined) items.push({ key, value });
         }
         this.cache = { version: motion.version, items };
      }
      return motion.moving ? this.cache.items : [];
   }

   /** Linha desenhada neste render. */
   remember(key: string, value: T) {
      this.next.set(key, value);
   }
}

/** `MoveGate` preso ao componente. */
export function useMoveGate(version: number): MoveGate {
   const gate = useRef<MoveGate | null>(null);
   gate.current ??= new MoveGate();
   gate.current.sync(version);
   return gate.current;
}
