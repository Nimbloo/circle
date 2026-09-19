// @vitest-environment jsdom

import './setup-dom';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAsyncResource } from '@/hooks/use-async-resource';

function deferred<T>() {
   let resolve!: (v: T) => void;
   let reject!: (e: unknown) => void;
   const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
   });
   return { promise, resolve, reject };
}

describe('useAsyncResource (R4)', () => {
   it('resposta atrasada da chave antiga não sobrescreve a nova (#57)', async () => {
      const calls: Record<string, ReturnType<typeof deferred<string[]>>> = {
         A: deferred(),
         B: deferred(),
      };
      const { result, rerender } = renderHook(
         ({ k }) => useAsyncResource(k, (key) => calls[key].promise),
         { initialProps: { k: 'A' } }
      );
      expect(result.current.loading).toBe(true);
      rerender({ k: 'B' });
      await act(async () => calls.B.resolve(['b']));
      await act(async () => calls.A.resolve(['a']));
      expect(result.current.data).toEqual(['b']);
      expect(result.current.loading).toBe(false);
   });

   it('trocar de chave não mostra o dado da anterior enquanto carrega', async () => {
      const b = deferred<string[]>();
      const { result, rerender } = renderHook(
         ({ k }) =>
            useAsyncResource(k, (key) => (key === 'A' ? Promise.resolve(['a']) : b.promise)),
         { initialProps: { k: 'A' } }
      );
      await waitFor(() => expect(result.current.data).toEqual(['a']));
      rerender({ k: 'B' });
      expect(result.current.data).toBeUndefined();
      expect(result.current.loading).toBe(true);
   });

   it('falha na 1ª carga vira error, não dado vazio', async () => {
      const { result } = renderHook(() =>
         useAsyncResource('A', () => Promise.reject(new Error('x')))
      );
      await waitFor(() => expect(result.current.error).toBeTruthy());
      expect(result.current.data).toBeUndefined();
      expect(result.current.loading).toBe(false);
   });

   it('reload silencioso que falha mantém o dado exibido', async () => {
      let fail = false;
      const { result } = renderHook(() =>
         useAsyncResource('A', () => (fail ? Promise.reject(new Error('x')) : Promise.resolve([1])))
      );
      await waitFor(() => expect(result.current.data).toEqual([1]));
      fail = true;
      await act(async () => {
         await result.current.reload();
      });
      expect(result.current.data).toEqual([1]);
      expect(result.current.loading).toBe(false);
   });

   it('chave nula não busca', () => {
      const { result } = renderHook(() => useAsyncResource(null, () => Promise.resolve(1)));
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBeUndefined();
   });
});
