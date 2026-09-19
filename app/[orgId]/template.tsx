'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MOTION_MS } from '@/lib/motion';

/** Último pathname montado: o template remonta a cada navegação, então vive fora dele. */
let lastPathname: string | null = null;

/**
 * Seção do workspace: inbox, my-issues, projects, settings, o time X… Tudo abaixo dela
 * (aba, item aberto, j/k) é troca entre irmãos e não anima. O time entra na chave porque
 * trocar de time É trocar de seção — antes a regra era "tirar o último segmento", e aí
 * inbox → views não animava enquanto team/ENG → projects animava (vi#14).
 */
const sectionOf = (path: string) => {
   const [org = '', section = '', sub = ''] = path.split('/').filter(Boolean);
   return section === 'team' ? `/${org}/team/${sub}` : `/${org}/${section}`;
};

/**
 * Entrada de rota do workspace. Template (não layout) remonta a cada navegação — por
 * isso fica ABAIXO do `[orgId]/layout`: DataHydrator, SSE e sidebar não remontam. Não
 * há layouts aninhados sob `[orgId]`, então nenhum estado persistente mora aqui dentro.
 * Só CSS (`.route-enter` em globals.css): sem animação de saída.
 *
 * Anima só a troca de SEÇÃO. A primeira montagem (carga fria) não anima: não há de onde
 * cruzar e o fade duplicava com o do conteúdo. Enquanto o fade da rota corre, o
 * `content-enter` de dentro entra junto (regra `.route-enter .content-enter`); no fim a
 * classe sai, para o conteúdo que chegar depois ter o seu próprio fade — os dois nunca
 * somam (vi#14).
 */
export default function OrgTemplate({ children }: { children: React.ReactNode }) {
   const pathname = usePathname();
   const [animate, setAnimate] = useState(
      () => lastPathname !== null && sectionOf(lastPathname) !== sectionOf(pathname)
   );
   useEffect(() => {
      lastPathname = pathname;
   }, [pathname]);
   // Tira a classe quando o fade acaba (por tempo: `animationend` do React depende de
   // prefixo de vendor e não é confiável aqui).
   useEffect(() => {
      if (!animate) return;
      const timer = setTimeout(() => setAnimate(false), MOTION_MS.content + 50);
      return () => clearTimeout(timer);
   }, [animate]);
   return <div className={animate ? 'route-enter h-full w-full' : 'h-full w-full'}>{children}</div>;
}
