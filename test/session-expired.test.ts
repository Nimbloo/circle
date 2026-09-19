// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
   __setSessionRedirectForTest,
   isSessionEnded,
   loginRedirectUrl,
} from '@/lib/session-redirect';
import { api, ApiError } from '@/lib/client';

/**
 * #12 — sessão expirada: o cliente não tratava 401 (a tela quebrava em silêncio e o SSE
 * reconectava para sempre) e o middleware perdia o deep-link. Agora 401 leva a
 * `/login?callbackUrl=<onde estava>`; conta desativada (403) vai para a tela própria.
 */

describe('loginRedirectUrl', () => {
   it('anexa o deep-link como callbackUrl', () => {
      expect(loginRedirectUrl('/nimbloo/issue/ENG-1', '?tab=activity')).toBe(
         '/login?callbackUrl=%2Fnimbloo%2Fissue%2FENG-1%3Ftab%3Dactivity'
      );
   });
   it('raiz não precisa de callbackUrl', () => {
      expect(loginRedirectUrl('/', '')).toBe('/login');
   });
});

describe('cliente trata sessão expirada (#12)', () => {
   const redirects: string[] = [];
   beforeEach(() => {
      redirects.length = 0;
      __setSessionRedirectForTest((url) => redirects.push(url));
      window.history.replaceState(null, '', '/nimbloo/issues?x=1');
   });
   afterEach(() => {
      vi.unstubAllGlobals();
      __setSessionRedirectForTest(null);
   });

   const respond = (status: number, body: unknown) =>
      vi.stubGlobal(
         'fetch',
         vi.fn(async () => new Response(JSON.stringify(body), { status }))
      );

   it('401 redireciona para o login com o deep-link, uma vez só', async () => {
      respond(401, { title: 'Unauthorized', status: 401 });
      await expect(api.me()).rejects.toBeInstanceOf(ApiError);
      await expect(api.me()).rejects.toBeInstanceOf(ApiError);
      expect(redirects).toEqual(['/login?callbackUrl=%2Fnimbloo%2Fissues%3Fx%3D1']);
      expect(isSessionEnded()).toBe(true);
   });

   it('403 de conta desativada vai para a tela própria', async () => {
      respond(403, { title: 'Forbidden', status: 403, detail: 'Conta desativada' });
      await expect(api.me()).rejects.toMatchObject({ status: 403 });
      expect(redirects).toEqual(['/login?error=deactivated']);
   });

   it('outro 403 não redireciona', async () => {
      respond(403, { title: 'Forbidden', status: 403, detail: 'Apenas admin' });
      await expect(api.audit()).rejects.toMatchObject({ status: 403 });
      expect(redirects).toEqual([]);
   });
});
