'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useSearchStore } from '@/store/search-store';

/**
 * Atalhos de teclado globais (paridade Linear). Sequências `g` + tecla para navegar,
 * teclas únicas para ações. Ignora quando o foco está em input/textarea/contenteditable
 * ou quando há modificador (⌘/Ctrl/Alt) — pra não colidir com atalhos do SO/⌘K.
 * Monta uma vez no layout do workspace; não renderiza nada.
 */
export function KeyboardShortcuts() {
   const router = useRouter();
   const { orgId } = useParams<{ orgId?: string }>();
   const openCreate = useCreateIssueStore((s) => s.openModal);
   const openSearch = useSearchStore((s) => s.openSearch);
   // `g` pendente por até 1.2s para formar a sequência.
   const pendingG = useRef<number | null>(null);

   useEffect(() => {
      const org = orgId ?? 'nimbloo';
      const go = (path: string) => router.push(`/${org}${path}`);
      const NAV: Record<string, string> = {
         i: '/my-issues',
         n: '/inbox',
         p: '/projects',
         v: '/views',
         m: '/members',
         r: '/reviews',
         t: '/teams',
      };

      const isTyping = (el: EventTarget | null): boolean => {
         const n = el as HTMLElement | null;
         if (!n) return false;
         const tag = n.tagName;
         return (
            tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            n.isContentEditable === true
         );
      };

      const onKey = (e: KeyboardEvent) => {
         if (e.metaKey || e.ctrlKey || e.altKey) return;
         if (isTyping(e.target)) return;
         const key = e.key.toLowerCase();

         // Sequência `g` + destino.
         if (pendingG.current && Date.now() - pendingG.current < 1200) {
            pendingG.current = null;
            if (NAV[key]) {
               e.preventDefault();
               go(NAV[key]);
               return;
            }
         }
         if (key === 'g') {
            pendingG.current = Date.now();
            return;
         }
         pendingG.current = null;

         // Teclas únicas.
         if (key === 'c') {
            e.preventDefault();
            openCreate();
         } else if (key === '/') {
            e.preventDefault();
            openSearch();
         }
      };

      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [router, orgId, openCreate, openSearch]);

   return null;
}
