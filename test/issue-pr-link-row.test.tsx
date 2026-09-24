// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PrLinkRow } from '@/components/common/issues/details/pr-link-row';

/**
 * Seção "Diffs" do painel da issue: mostrava o id interno do vínculo (hash md5 de 32
 * caracteres) no lugar do número do PR.
 */
describe('linha de PR vinculado', () => {
   it('mostra #número e leva à review do PR no Circle', () => {
      render(
         <PrLinkRow
            orgId="nimbloo"
            pr={{
               id: '0123456789abcdef0123456789abcdef',
               title: 'ENG-1 fix the thing',
               status: 'open',
               reviewId: 'nimbloo/circle#42',
               repo: 'nimbloo/circle',
               number: 42,
               url: 'https://github.com/nimbloo/circle/pull/42',
            }}
         />
      );
      const link = screen.getByRole('link', { name: /#42/ });
      expect(link.getAttribute('href')).toBe('/nimbloo/review/nimbloo%2Fcircle%2342');
      expect(screen.getByText('ENG-1 fix the thing')).toBeTruthy();
      expect(screen.queryByText('0123456789abcdef0123456789abcdef')).toBeNull();
   });

   it('vínculo antigo (sem review) mostra só o título, sem o hash', () => {
      render(
         <PrLinkRow
            orgId="nimbloo"
            pr={{
               id: 'ffffffffffffffffffffffffffffffff',
               title: 'PR antigo',
               status: 'merged',
               reviewId: null,
               repo: null,
               number: null,
               url: null,
            }}
         />
      );
      expect(screen.getByText('PR antigo')).toBeTruthy();
      expect(screen.queryByText('ffffffffffffffffffffffffffffffff')).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
   });
});
