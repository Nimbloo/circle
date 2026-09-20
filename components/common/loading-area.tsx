'use client';

import { CircleLoading } from '@/components/common/circle-loading';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

/** Altura de uma linha de lista (h-11): `rows` reserva o espaço do conteúdo que vem. */
const ROW_PX = 44;

/**
 * Área carregando: o `CircleLoading` centralizado num bloco com a altura aproximada do
 * conteúdo (`rows` linhas de lista), para a troca loading → conteúdo não pular a tela.
 */
export function LoadingArea({
   rows = 6,
   size = 'md',
   label,
   className,
}: {
   rows?: number;
   /** Nome acessível (e texto visível) do loading; sem ele, "Carregando". */
   label?: string;
   size?: 'sm' | 'md' | 'lg';
   className?: string;
}) {
   return (
      <div
         className={cn('flex w-full items-center justify-center', className)}
         style={{ minHeight: rows * ROW_PX }}
      >
         <CircleLoading size={size} label={label} />
      </div>
   );
}

/** Quantos containers de cada escopo estão montados agora (ver `useEnterFade`). */
const mountedByScope = new Map<string, number>();

/**
 * Diz se o container deve entrar com o fade `content-enter`. Ele vale para a troca
 * loading → conteúdo; trocar de IRMÃO (aba, próxima issue com j/k, outro layout da mesma
 * lista) não é chegada de conteúdo e não deve piscar. O irmão que sai ainda está montado
 * quando o novo renderiza, então basta contar quem está de pé no `scope` — um nome curto e
 * estável por área (`issue-detail`, `project-tab`, …).
 */
export function useEnterFade(scope: string): boolean {
   const [fade] = useState(() => (mountedByScope.get(scope) ?? 0) === 0);

   useEffect(() => {
      mountedByScope.set(scope, (mountedByScope.get(scope) ?? 0) + 1);
      return () => {
         const left = (mountedByScope.get(scope) ?? 1) - 1;
         if (left > 0) mountedByScope.set(scope, left);
         else mountedByScope.delete(scope);
      };
   }, [scope]);

   return fade;
}
