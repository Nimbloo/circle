'use client';

import { useMemo } from 'react';
import { useIssuesStore } from '@/store/issues-store';

export interface LiveCycleAggregates {
   scope: number;
   started: number;
   completed: number;
   successRate: number;
   /** false enquanto o store de issues ainda não hidratou — o chamador usa o DTO do servidor. */
   ready: boolean;
}

/**
 * Agregados de um ciclo derivados AO VIVO das issues do store. O DTO do servidor fica
 * stale assim que uma issue entra/sai do ciclo ou muda de status (só reconcilia num
 * refetch). O store carrega TODAS as issues (paginação keyset) e o DataHydrator o
 * popula globalmente, então a contagem por ciclo é exata. Enquanto o store está vazio
 * (antes do 1º load) `ready=false` e o chamador cai no valor do servidor pra não piscar zero.
 */
export function useCycleAggregates(cycleId: string): LiveCycleAggregates {
   const issues = useIssuesStore((s) => s.issues);
   return useMemo(() => {
      let scope = 0;
      let started = 0;
      let completed = 0;
      for (const i of issues) {
         if (i.cycleId !== cycleId) continue;
         scope += 1;
         if (i.status.category === 'started') started += 1;
         else if (i.status.category === 'completed') completed += 1;
      }
      const successRate = scope > 0 ? Math.round((completed / scope) * 100) : 0;
      return { scope, started, completed, successRate, ready: issues.length > 0 };
   }, [issues, cycleId]);
}
