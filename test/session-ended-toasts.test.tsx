// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { __setSessionRedirectForTest } from '@/lib/session-redirect';
import { api } from '@/lib/client';

/**
 * Auditoria de toasts (15b): 401 encerra a sessão (redirect ao login) e o `ApiError` é
 * relançado — o chamador mostrava "Não foi possível…" na tela que já está indo embora.
 * Com a sessão encerrada, o Toaster sai de cena: nenhum toast antes do redirect.
 */

beforeEach(() => {
   window.matchMedia ??= ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
   })) as unknown as typeof window.matchMedia;
   __setSessionRedirectForTest(() => {});
});
afterEach(() => {
   vi.unstubAllGlobals();
   __setSessionRedirectForTest(null);
   act(() => void toast.dismiss());
});

describe('toasts depois do fim de sessão', () => {
   it('sessão ativa: toast de erro aparece normalmente', async () => {
      render(<Toaster />);
      await act(async () => {
         toast.error('Falha qualquer');
      });
      expect(await screen.findByText('Falha qualquer')).toBeTruthy();
   });

   it('401 → o toast de erro do chamador não aparece', async () => {
      vi.stubGlobal(
         'fetch',
         vi.fn(async () => new Response(JSON.stringify({ title: 'Unauthorized' }), { status: 401 }))
      );
      render(<Toaster />);
      await act(async () => {
         await api.audit().catch(() => toast.error('Não foi possível carregar'));
         await new Promise((r) => setTimeout(r, 25));
      });
      // Sessão encerrada: o Toaster nem está montado, então nenhum toast pode aparecer.
      expect(document.querySelector('[data-sonner-toaster]')).toBeNull();
      expect(screen.queryByText('Não foi possível carregar')).toBeNull();
   });
});
