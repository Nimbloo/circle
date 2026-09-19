'use client';

import { useEffect, useRef, type KeyboardEvent, type MutableRefObject } from 'react';
import {
   keyboardRescheduleDelta,
   rescheduleRange,
   sameRange,
   type DateRange,
} from '@/lib/timeline-reschedule';

/** Pausa sem tecla que fecha o rascunho num único PATCH. */
const IDLE_COMMIT_MS = 600;
/** Janela em que o foco perdido pela reordenação volta para a barra. */
const REFOCUS_WINDOW_MS = 3000;

/**
 * Depois do commit a lista pode reordenar (ordering por data) e o navegador tira o foco
 * de um nó movido no DOM. Enquanto a janela durar, se o foco cair no `body`, volta para
 * a barra. Para quando o usuário clica ou foca outra coisa, ou quando a barra desmonta.
 */
function keepFocusAfterReorder(element: HTMLElement): () => void {
   const deadline = Date.now() + REFOCUS_WINDOW_MS;
   let frame = 0;
   let stopped = false;
   const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('pointerdown', stop, true);
   };
   const tick = () => {
      if (stopped) return;
      if (Date.now() > deadline || !element.isConnected) return stop();
      const active = document.activeElement;
      if (!active || active === document.body) element.focus({ preventScroll: true });
      else if (active !== element) return stop();
      frame = requestAnimationFrame(tick);
   };
   window.addEventListener('pointerdown', stop, true);
   frame = requestAnimationFrame(tick);
   return stop;
}

/**
 * Reagendamento por teclado da barra da timeline/roadmap (#39): ←/→ (e Shift) só mexem
 * no RASCUNHO; o PATCH sai UMA vez — ao perder o foco ou após uma pausa sem tecla.
 * Antes era 1 PATCH (e 1 linha de activity) por tecla.
 */
export function useKeyboardReschedule({
   base,
   enabled,
   draftRef,
   setDraft,
   onCommit,
}: {
   base: DateRange;
   enabled: boolean;
   draftRef: MutableRefObject<DateRange | null>;
   setDraft: (next: DateRange | null) => void;
   onCommit: (next: DateRange) => void;
}) {
   const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
   const pending = useRef(false);
   const barRef = useRef<HTMLButtonElement | null>(null);
   const stopRefocus = useRef<(() => void) | null>(null);
   const latest = useRef({ base, setDraft, onCommit, draftRef });
   latest.current = { base, setDraft, onCommit, draftRef };

   const flush = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (!pending.current) return;
      pending.current = false;
      const { base: b, setDraft: set, onCommit: commit, draftRef: ref } = latest.current;
      const next = ref.current;
      set(null);
      if (next && !sameRange(next, b)) {
         // Commit pela pausa (barra ainda focada): segura o foco se a linha for movida.
         const bar = barRef.current;
         const focused = bar !== null && document.activeElement === bar;
         commit(next);
         if (focused) {
            stopRefocus.current?.();
            stopRefocus.current = keepFocusAfterReorder(bar);
         }
      }
   };
   const flushRef = useRef(flush);
   flushRef.current = flush;

   // Desmontou com rascunho pendente (navegou): grava o que foi escolhido.
   useEffect(
      () => () => {
         flushRef.current();
         stopRefocus.current?.();
      },
      []
   );

   const onKeyDown = (event: KeyboardEvent) => {
      if (!enabled) return;
      const delta = keyboardRescheduleDelta(event);
      if (delta === null) return;
      event.preventDefault();
      pending.current = true;
      setDraft(rescheduleRange(draftRef.current ?? base, 'move', delta));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flushRef.current(), IDLE_COMMIT_MS);
   };

   return { onKeyDown, onBlur: flush, ref: barRef };
}
