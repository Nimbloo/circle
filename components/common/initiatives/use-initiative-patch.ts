'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import type { Initiative } from '@/data/initiatives';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';

type UpdateBody = Parameters<typeof api.initiatives.update>[1];

/** Fila por initiative: um PATCH por vez, na ordem dos cliques (#46). */
const queues = new Map<string, { tail: Promise<unknown>; pending: number }>();

function setFields(id: string, fields: Partial<Initiative>) {
   useWorkspaceStore.setState((s) => ({
      initiatives: s.initiatives.map((i) => (i.id === id ? { ...i, ...fields } : i)),
   }));
}

export interface PatchMessages {
   success?: string;
   error?: string;
}

/**
 * PATCH otimista de initiative (#5, #46). Aplica `local` no store na hora, serializa as
 * requisições da mesma initiative e só aplica o DTO do servidor quando a fila esvazia —
 * uma resposta intermediária não apaga a seleção otimista de um clique posterior. Na
 * falha, reverte só os campos que ainda têm o valor otimista (não sobrescreve estado
 * remoto que chegou depois). Toast de sucesso só depois da confirmação da API.
 */
export async function patchInitiative(
   id: string,
   local: Partial<Initiative>,
   body: UpdateBody,
   messages: PatchMessages = {}
): Promise<boolean> {
   const before = useWorkspaceStore.getState().initiatives.find((i) => i.id === id);
   if (!before) return false;
   const keys = Object.keys(local) as (keyof Initiative)[];
   const previous = Object.fromEntries(keys.map((k) => [k, before[k]])) as Partial<Initiative>;
   setFields(id, local);

   const queue = queues.get(id) ?? { tail: Promise.resolve(), pending: 0 };
   // Fila vazia: sai na hora; senão espera o PATCH anterior responder.
   const run =
      queue.pending === 0
         ? api.initiatives.update(id, body)
         : queue.tail.then(() => api.initiatives.update(id, body));
   queue.pending += 1;
   queues.set(id, queue);
   queue.tail = run.catch(() => undefined);

   const settle = () => {
      queue.pending -= 1;
      if (queue.pending === 0 && queues.get(id) === queue) queues.delete(id);
      return queue.pending === 0;
   };

   try {
      const dto = await run;
      if (settle()) useWorkspaceStore.getState().applyInitiative(dto);
      if (messages.success) toast.success(messages.success);
      return true;
   } catch {
      settle();
      const now = useWorkspaceStore.getState().initiatives.find((i) => i.id === id);
      if (now) {
         const revert = Object.fromEntries(
            keys.filter((k) => Object.is(now[k], local[k])).map((k) => [k, previous[k]])
         ) as Partial<Initiative>;
         if (Object.keys(revert).length) setFields(id, revert);
      }
      toast.error(messages.error ?? 'Não foi possível atualizar a initiative');
      return false;
   }
}

export function useInitiativePatch(id: string) {
   return useCallback(
      (local: Partial<Initiative>, body: UpdateBody, messages?: PatchMessages) =>
         patchInitiative(id, local, body, messages),
      [id]
   );
}
