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
      if (next && !sameRange(next, b)) commit(next);
   };
   const flushRef = useRef(flush);
   flushRef.current = flush;

   // Desmontou com rascunho pendente (navegou): grava o que foi escolhido.
   useEffect(() => () => flushRef.current(), []);

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

   return { onKeyDown, onBlur: flush };
}
