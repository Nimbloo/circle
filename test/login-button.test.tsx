// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
const auth = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock('next-auth/react', () => auth);

const { default: LoginPage } = await import('@/app/login/page');

const botao = () => screen.getByRole('button', { name: /Entrar com o Google|Redirecionando/ });

beforeEach(() => vi.clearAllMocks());

describe('botão do login não fica preso (Ad#21–40)', () => {
   it('falha do signIn reabilita o botão', async () => {
      auth.signIn.mockRejectedValueOnce(new Error('rede'));
      render(<LoginPage />);
      act(() => botao().click());
      await waitFor(() => expect((botao() as HTMLButtonElement).disabled).toBe(false));
   });

   it('voltar pelo histórico (bfcache, pageshow persisted) reabilita o botão', async () => {
      auth.signIn.mockReturnValueOnce(new Promise(() => {}));
      render(<LoginPage />);
      act(() => botao().click());
      expect((botao() as HTMLButtonElement).disabled).toBe(true);
      act(() => {
         const ev = new Event('pageshow') as Event & { persisted: boolean };
         Object.defineProperty(ev, 'persisted', { value: true });
         window.dispatchEvent(ev);
      });
      expect((botao() as HTMLButtonElement).disabled).toBe(false);
   });
});
