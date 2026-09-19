'use client';

import { useEffect, useRef } from 'react';

/**
 * Semeia o formulário de um diálogo SÓ na transição fechado → aberto (#38). Depender do
 * objeto-fonte no efeito re-semeava a cada evento de tempo real e apagava o texto digitado;
 * a semente mais recente é lida na abertura, então reabrir mostra o valor atual.
 */
export function useSeedOnOpen(open: boolean, seed: () => void): void {
   const seedRef = useRef(seed);
   useEffect(() => {
      seedRef.current = seed;
   });
   useEffect(() => {
      if (open) seedRef.current();
   }, [open]);
}
