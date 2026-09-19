'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncResource<T> {
   data: T | undefined;
   /** Carregando uma chave ainda sem dado (1ª carga ou troca de chave). */
   loading: boolean;
   /** Erro da carga sem dado a mostrar; reload silencioso que falha não o preenche. */
   error: unknown;
   /** Recarrega a chave atual; com dado exibido é silencioso (mantém o dado). */
   reload: () => Promise<void>;
}

/**
 * Recurso assíncrono por chave (R4): data/loading/error/reload com número de sequência —
 * só a resposta mais recente é aplicada, então trocar de chave (ex.: de time) nunca mostra
 * a resposta atrasada da anterior (#57). Falha sem dado vira `error`, não lista vazia.
 * `key` nula = nada a buscar.
 */
export function useAsyncResource<T>(
   key: string | null,
   fetcher: (key: string) => Promise<T>
): AsyncResource<T> {
   const [state, setState] = useState<{
      key: string | null;
      data: T | undefined;
      loading: boolean;
      error: unknown;
   }>({ key, data: undefined, loading: key !== null, error: undefined });
   const seq = useRef(0);
   const fetcherRef = useRef(fetcher);
   useEffect(() => {
      fetcherRef.current = fetcher;
   });

   // Troca de chave: descarta o dado da anterior já no render (sem piscar dado errado).
   if (state.key !== key)
      setState({ key, data: undefined, loading: key !== null, error: undefined });

   // Com dado na tela o reload é silencioso; sem dado (1ª carga, retry) mostra loading.
   const run = useCallback(async () => {
      if (key === null) return;
      const mine = ++seq.current;
      setState((s) => ({ ...s, loading: s.data === undefined, error: undefined }));
      try {
         const data = await fetcherRef.current(key);
         if (mine !== seq.current) return;
         setState({ key, data, loading: false, error: undefined });
      } catch (error) {
         if (mine !== seq.current) return;
         setState((s) =>
            s.data === undefined
               ? { key, data: undefined, loading: false, error }
               : { ...s, loading: false }
         );
      }
   }, [key]);

   useEffect(() => {
      void run();
   }, [run]);

   const reload = run;

   const current =
      state.key === key ? state : { data: undefined, loading: key !== null, error: undefined };
   return { data: current.data, loading: current.loading, error: current.error, reload };
}
