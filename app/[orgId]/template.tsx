'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Último pathname montado: o template remonta a cada navegação, então vive fora dele. */
let lastPathname: string | null = null;

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'));

/**
 * Entrada de rota do workspace. Template (não layout) remonta a cada navegação — por
 * isso fica ABAIXO do `[orgId]/layout`: DataHydrator, SSE e sidebar não remontam. Não
 * há layouts aninhados sob `[orgId]`, então nenhum estado persistente mora aqui dentro.
 * Só CSS (`.route-enter` em globals.css): sem animação de saída.
 *
 * Anima só a troca de seção: entre abas irmãs (muda só o último segmento, ex.
 * `.../all` → `.../active`) ou na mesma rota não há fade (If#19).
 */
export default function OrgTemplate({ children }: { children: React.ReactNode }) {
   const pathname = usePathname();
   const [animate] = useState(
      () => lastPathname === null || parentOf(lastPathname) !== parentOf(pathname)
   );
   useEffect(() => {
      lastPathname = pathname;
   }, [pathname]);
   return <div className={animate ? 'route-enter h-full w-full' : 'h-full w-full'}>{children}</div>;
}
