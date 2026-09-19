// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RootLoading from '@/app/loading';
import OrgTemplate from '@/app/[orgId]/template';

const root = join(__dirname, '..');

describe('loading/entrada de rota', () => {
   it('root anuncia o carregamento com o CircleLoading', () => {
      render(<RootLoading />);
      expect(screen.getByRole('status').textContent).toContain('Carregando');
   });

   // O fallback de [orgId] ficava acima do MainLayout per-página: em toda navegação o
   // header sumia. As telas têm o próprio loading (LoadingArea) dentro do frame.
   it('o workspace não tem fallback de rota próprio', () => {
      expect(existsSync(join(root, 'app/[orgId]/loading.tsx'))).toBe(false);
   });

   // A primeira montagem não anima (carga fria não cruza com nada): a classe de entrada é
   // da troca de seção, coberta em `org-template.test.tsx`.
   it('o template só envolve os filhos', () => {
      const { container } = render(
         <OrgTemplate>
            <p>page</p>
         </OrgTemplate>
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.className).toContain('h-full');
      expect(wrapper.textContent).toBe('page');
   });

   // `transform` no wrapper durante a animação vira containing block de `position: fixed`.
   it('a entrada de rota anima só opacity', () => {
      const css = readFileSync(join(root, 'app/globals.css'), 'utf8');
      const keyframes = css.match(/@keyframes route-enter\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(keyframes).toContain('opacity');
      expect(keyframes).not.toContain('transform');
   });
});
