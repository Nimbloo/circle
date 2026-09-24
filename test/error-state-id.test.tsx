// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorState } from '@/components/common/error-state';

/**
 * Auditoria (item 13): o título usava o id fixo `error-state-title` — dois ErrorState na
 * mesma página duplicavam o id e o segundo alerta era rotulado pelo título do primeiro.
 */
describe('ErrorState — id do título', () => {
   it('dois ErrorState na página têm ids únicos e cada alerta é rotulado pelo próprio título', () => {
      render(
         <>
            <ErrorState title="Falha A" description="a" />
            <ErrorState title="Falha B" description="b" />
         </>
      );
      expect(screen.getByRole('alert', { name: 'Falha A' })).toBeTruthy();
      expect(screen.getByRole('alert', { name: 'Falha B' })).toBeTruthy();
      const ids = screen.getAllByRole('heading').map((h) => h.id);
      expect(new Set(ids).size).toBe(2);
   });
});
