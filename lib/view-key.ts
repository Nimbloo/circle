'use client';

import { useParams, usePathname } from 'next/navigation';

function segmentsOf(path: string): string[] {
   return path.split(/[?#]/)[0].split('/').filter(Boolean);
}

/**
 * Chave de view = pathname sem o prefixo do org (primeiro segmento):
 * `/<org>/team/ENG/all` → `team/ENG/all`, `/<org>/my-issues` → `my-issues`,
 * `/<org>/project/<id>/issues` → `project/<id>/issues`.
 *
 * É a chave dos estados "por view" (display settings, list/board, right panel):
 * cada rota lembra as próprias opções, como no Linear. Query string e barra final
 * são ignoradas; a raiz do org (`/<org>`) vira `''`.
 */
export function viewKeyFromPathname(pathname: string): string {
   return segmentsOf(pathname).slice(1).join('/');
}

/**
 * Chave da view atual. Sob `[orgId]` o prefixo removido é exatamente o org; fora
 * dele (ou sem router, como em testes) cai no corte do primeiro segmento.
 */
export function useViewKey(): string {
   const params = useParams<{ orgId?: string }>();
   const pathname = usePathname() ?? '';
   const orgId = params?.orgId;
   if (orgId) {
      const segments = segmentsOf(pathname);
      if (segments[0] === orgId) return segments.slice(1).join('/');
   }
   return viewKeyFromPathname(pathname);
}
