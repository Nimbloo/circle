// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { SettingsRow } from '@/components/common/settings/shared';

/**
 * Transição suave loading → conteúdo: o que substitui o `CircleLoading` entra com o
 * fade `content-enter` (só opacity). Os estados vazio/erro e as linhas de settings são
 * componentes únicos, então o fade vive neles.
 */
describe('entrada suave de conteúdo', () => {
   it('vazio, erro e linha de settings entram com content-enter', () => {
      render(
         <>
            <EmptyState title="Nada aqui" />
            <ErrorState title="Falhou" description="Tente de novo." />
            <SettingsRow title="Linha" />
         </>
      );
      expect(screen.getByText('Nada aqui').closest('[data-variant]')!.className).toContain(
         'content-enter'
      );
      expect(screen.getByRole('alert').className).toContain('content-enter');
      expect(screen.getByText('Linha').closest('.content-enter')).not.toBeNull();
   });

   it('o fade só anima opacity e respeita prefers-reduced-motion', () => {
      const css = readFileSync('app/globals.css', 'utf8');
      const keyframes = css.match(/@keyframes content-enter\s*\{[\s\S]*?\}\s*\}/)![0];
      expect(keyframes).toContain('opacity');
      expect(keyframes).not.toContain('transform');
      const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
      expect(reduced).toContain('.content-enter');
      expect(reduced).toContain('.circle-loading-arc');
   });
});
