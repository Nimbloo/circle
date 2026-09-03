// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const nav = {
   orgId: 'acme' as string | undefined,
   pathname: '/acme/team/ENG/all' as string | null,
};

vi.mock('next/navigation', () => ({
   useParams: () => (nav.orgId ? { orgId: nav.orgId } : {}),
   usePathname: () => nav.pathname,
}));

const { viewKeyFromPathname, useViewKey } = await import('@/lib/view-key');

describe('viewKeyFromPathname', () => {
   it('remove o prefixo do org (primeiro segmento)', () => {
      expect(viewKeyFromPathname('/acme/team/ENG/all')).toBe('team/ENG/all');
      expect(viewKeyFromPathname('/acme/my-issues')).toBe('my-issues');
      expect(viewKeyFromPathname('/acme/project/p1/issues')).toBe('project/p1/issues');
   });

   it('ignora query string, hash e barra final; raiz do org vira vazio', () => {
      expect(viewKeyFromPathname('/acme/my-issues/?tab=x#y')).toBe('my-issues');
      expect(viewKeyFromPathname('/acme')).toBe('');
      expect(viewKeyFromPathname('/')).toBe('');
      expect(viewKeyFromPathname('')).toBe('');
   });
});

describe('useViewKey', () => {
   it('usa o orgId dos params para cortar o prefixo', () => {
      nav.orgId = 'acme';
      nav.pathname = '/acme/team/ENG/active';
      expect(renderHook(() => useViewKey()).result.current).toBe('team/ENG/active');
   });

   it('sem orgId (ou fora do router) corta o primeiro segmento do pathname', () => {
      nav.orgId = undefined;
      nav.pathname = '/other/inbox';
      expect(renderHook(() => useViewKey()).result.current).toBe('inbox');
      nav.pathname = null;
      expect(renderHook(() => useViewKey()).result.current).toBe('');
   });
});
