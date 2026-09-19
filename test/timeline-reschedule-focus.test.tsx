// @vitest-environment jsdom

import './setup-dom';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardReschedule } from '@/components/common/projects/use-keyboard-reschedule';
import type { DateRange } from '@/lib/timeline-reschedule';

interface Row {
   id: string;
   range: DateRange;
}

function Bar({ row, onCommit }: { row: Row; onCommit: (id: string, next: DateRange) => void }) {
   const [draft, setDraftState] = useState<DateRange | null>(null);
   const draftRef = useRef<DateRange | null>(null);
   const setDraft = (next: DateRange | null) => {
      draftRef.current = next;
      setDraftState(next);
   };
   const keyboard = useKeyboardReschedule({
      base: row.range,
      enabled: true,
      draftRef,
      setDraft,
      onCommit: (next) => onCommit(row.id, next),
   });
   return (
      <button
         ref={keyboard.ref}
         type="button"
         onKeyDown={keyboard.onKeyDown}
         onBlur={keyboard.onBlur}
         data-start={(draft ?? row.range).startDate}
      >
         {row.id}
      </button>
   );
}

/** Lista ordenada por início, como a timeline com ordering `start-date`. */
function Harness() {
   const [rows, setRows] = useState<Row[]>([
      { id: 'a', range: { startDate: '2026-09-01', targetDate: '2026-09-10' } },
      { id: 'b', range: { startDate: '2026-09-02', targetDate: '2026-09-10' } },
   ]);
   const sorted = [...rows].sort((x, y) => x.range.startDate.localeCompare(y.range.startDate));
   // O navegador tira o foco de um nó movido no DOM (insertBefore = remover + inserir);
   // o jsdom não. Emula: quando a ordem muda, o elemento focado perde o foco.
   const order = sorted.map((r) => r.id).join();
   const lastOrder = useRef(order);
   useLayoutEffect(() => {
      if (lastOrder.current !== order) (document.activeElement as HTMLElement | null)?.blur();
      lastOrder.current = order;
   }, [order]);
   return (
      <div>
         {sorted.map((row) => (
            <Bar
               key={row.id}
               row={row}
               onCommit={(id, next) =>
                  setRows((all) => all.map((r) => (r.id === id ? { ...r, range: next } : r)))
               }
            />
         ))}
         <button type="button">outside</button>
      </div>
   );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('timeline por teclado: foco ao reordenar (Pl#22)', () => {
   it('a barra reordenada depois do commit continua com o foco', async () => {
      render(<Harness />);
      const barA = screen.getByRole('button', { name: 'a' });
      act(() => barA.focus());

      // Move "a" para depois de "b": no commit a linha troca de lugar no DOM.
      fireEvent.keyDown(barA, { key: 'ArrowRight', shiftKey: true });
      await act(async () => {
         vi.advanceTimersByTime(700); // pausa sem tecla → commit
      });
      await act(async () => {
         vi.advanceTimersByTime(100); // frames do observador de foco
      });

      const buttons = screen.getAllByRole('button').map((b) => b.textContent);
      expect(buttons).toEqual(['b', 'a', 'outside']);
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'a' }));
   });

   it('não rouba o foco se o usuário foi para outro lugar', async () => {
      render(<Harness />);
      const barA = screen.getByRole('button', { name: 'a' });
      act(() => barA.focus());
      fireEvent.keyDown(barA, { key: 'ArrowRight', shiftKey: true });
      await act(async () => {
         vi.advanceTimersByTime(700);
      });
      const outside = screen.getByRole('button', { name: 'outside' });
      act(() => outside.focus());
      await act(async () => {
         vi.advanceTimersByTime(200);
      });
      expect(document.activeElement).toBe(outside);
   });

   it('clique em outro lugar cancela a devolução do foco', async () => {
      render(<Harness />);
      const barA = screen.getByRole('button', { name: 'a' });
      act(() => barA.focus());
      fireEvent.keyDown(barA, { key: 'ArrowRight', shiftKey: true });
      await act(async () => {
         vi.advanceTimersByTime(650);
      });
      // O commit já reordenou e tirou o foco; o clique chega antes do próximo frame.
      fireEvent.pointerDown(document.body);
      await act(async () => {
         vi.advanceTimersByTime(200);
      });
      expect(document.activeElement).toBe(document.body);
   });
});
