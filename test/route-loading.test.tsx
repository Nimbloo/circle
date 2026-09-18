// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RootLoading from '@/app/loading';
import OrgLoading from '@/app/[orgId]/loading';
import OrgTemplate from '@/app/[orgId]/template';

describe('loading/entrada de rota', () => {
   it('root anuncia o carregamento com o CircleLoading', () => {
      render(<RootLoading />);
      expect(screen.getByRole('status').textContent).toContain('Carregando');
   });

   it('o fallback do workspace ocupa só o frame de conteúdo', () => {
      const { container } = render(<OrgLoading />);
      const main = container.querySelector('main');
      expect(main?.className).toContain('bg-container');
      expect(main?.className).toContain('h-full');
      expect(screen.getByRole('status')).toBeTruthy();
   });

   it('o template só envolve os filhos com a classe de entrada', () => {
      const { container } = render(
         <OrgTemplate>
            <p>page</p>
         </OrgTemplate>
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.className).toContain('route-enter');
      expect(wrapper.className).toContain('h-full');
      expect(wrapper.textContent).toBe('page');
   });
});
