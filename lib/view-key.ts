'use client';

import { usePathname } from 'next/navigation';

/**
 * Chave de view = `pathname` sem o prefixo do org:
 * `/<org>/team/ENG/all` → `team/ENG/all`, `/<org>/my-issues` → `my-issues`.
 * É a chave usada pelos stores que guardam estado por rota (display, layout, right-panel).
 */
export function viewKeyFromPathname(pathname: string): string {
   return pathname.replace(/^\/+/, '').split('/').slice(1).join('/');
}

/** Chave da view atual (ver `viewKeyFromPathname`). */
export function useViewKey(): string {
   return viewKeyFromPathname(usePathname() ?? '');
}
