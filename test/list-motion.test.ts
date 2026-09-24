// @vitest-environment jsdom

import './setup-dom';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   diffListKeys,
   isAnimatableChange,
   LIST_MOTION_MAX_CHANGES,
   useListMotion,
} from '@/lib/list-motion';

describe('diffListKeys', () => {
   it('conta chegadas, saídas e o mínimo de itens que trocaram de lugar', () => {
      expect(diffListKeys(['a', 'b', 'c'], ['x', 'a', 'b', 'c'])).toEqual({
         added: ['x'],
         removed: 0,
         moved: 0,
      });
      expect(diffListKeys(['a', 'b', 'c'], ['a', 'c'])).toEqual({
         added: [],
         removed: 1,
         moved: 0,
      });
      // Uma issue sobe para o topo: 1 movimento, não "todas mudaram de índice".
      expect(diffListKeys(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']).moved).toBe(1);
      // Ordem invertida (troca de ordenação): quase todas se movem.
      expect(diffListKeys(['a', 'b', 'c', 'd'], ['d', 'c', 'b', 'a']).moved).toBe(3);
   });

   it('lote grande não é animável; mudança nula também não', () => {
      const none = diffListKeys(['a'], ['a']);
      expect(isAnimatableChange(none)).toBe(false);
      const many = Array.from({ length: LIST_MOTION_MAX_CHANGES + 1 }, (_, i) => `n${i}`);
      expect(isAnimatableChange(diffListKeys(['a'], ['a', ...many]))).toBe(false);
      expect(isAnimatableChange(diffListKeys(['a'], ['n', 'a']))).toBe(true);
   });
});

describe('useListMotion', () => {
   let now = 1000;
   beforeEach(() => {
      now = 1000;
      vi.spyOn(performance, 'now').mockImplementation(() => now);
   });
   afterEach(() => vi.restoreAllMocks());

   const setup = (keys: string[], resetKey = 'v') =>
      renderHook(({ keys, resetKey }) => useListMotion(keys, resetKey), {
         initialProps: { keys, resetKey },
      });

   it('não anima a carga inicial nem a chegada dos dados numa lista vazia', () => {
      const { result, rerender } = setup([]);
      expect(result.current.moving).toBe(false);
      rerender({ keys: ['a', 'b'], resetKey: 'v' });
      expect(result.current.moving).toBe(false);
      expect(result.current.entering.size).toBe(0);
   });

   it('anima a chegada pontual do realtime e marca só quem chegou', () => {
      const { result, rerender } = setup(['a', 'b']);
      expect(result.current.moving).toBe(false);
      rerender({ keys: ['x', 'a', 'b'], resetKey: 'v' });
      expect(result.current.moving).toBe(true);
      expect([...result.current.entering]).toEqual(['x']);
   });

   it('reordenação pontual desliza sem marcar ninguém como novo', () => {
      const { result, rerender } = setup(['a', 'b', 'c']);
      rerender({ keys: ['c', 'a', 'b'], resetKey: 'v' });
      expect(result.current.moving).toBe(true);
      expect(result.current.entering.size).toBe(0);
   });

   it('lote grande não anima (e corta uma janela que estivesse correndo)', () => {
      const { result, rerender } = setup(['a']);
      rerender({ keys: ['b', 'a'], resetKey: 'v' });
      expect(result.current.moving).toBe(true);
      const batch = ['a', ...Array.from({ length: 20 }, (_, i) => `n${i}`)];
      rerender({ keys: batch, resetKey: 'v' });
      expect(result.current.moving).toBe(false);
      expect(result.current.entering.size).toBe(0);
   });

   it('troca de contexto (resetKey) não anima', () => {
      const { result, rerender } = setup(['a', 'b']);
      rerender({ keys: ['a'], resetKey: 'outra-view' });
      expect(result.current.moving).toBe(false);
   });

   it('a janela acaba: renders depois dela não religam a transição', () => {
      const { result, rerender } = setup(['a']);
      const keys = ['b', 'a'];
      rerender({ keys, resetKey: 'v' });
      expect(result.current.moving).toBe(true);
      now += 1000;
      rerender({ keys, resetKey: 'v' });
      expect(result.current.moving).toBe(false);
      expect(result.current.entering.size).toBe(0);
   });

   it('mesmo conteúdo num array novo mantém a janela em curso', () => {
      const { result, rerender } = setup(['a']);
      rerender({ keys: ['b', 'a'], resetKey: 'v' });
      rerender({ keys: ['b', 'a'], resetKey: 'v' });
      expect(result.current.moving).toBe(true);
      expect([...result.current.entering]).toEqual(['b']);
   });
});
