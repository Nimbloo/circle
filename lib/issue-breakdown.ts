/**
 * Agrupa itens por chave para os breakdowns dos painéis (projeto, ciclo). A chave pode
 * ser única (assignee, prioridade) ou múltipla (labels): cada item entra no bucket de
 * cada chave distinta que tiver, como no Linear. `undefined` fica fora.
 */
export function bucketIssues<T, K>(
   items: readonly T[],
   keysOf: (item: T) => K | readonly K[] | undefined
): Map<K, T[]> {
   const buckets = new Map<K, T[]>();
   for (const item of items) {
      const raw = keysOf(item);
      if (raw === undefined) continue;
      const keys = Array.isArray(raw) ? new Set(raw as readonly K[]) : [raw as K];
      for (const key of keys) {
         const bucket = buckets.get(key);
         if (bucket) bucket.push(item);
         else buckets.set(key, [item]);
      }
   }
   return buckets;
}
