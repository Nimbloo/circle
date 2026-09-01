import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MainLayout from '../components/layout/main-layout';
import { HeaderTitle, LocationBar, ViewBar } from '../components/layout/header-primitives';

describe('layout primitives', () => {
   it('renderiza location e view bars com contratos geométricos distintos', () => {
      const html = renderToStaticMarkup(
         createElement(
            Fragment,
            null,
            createElement(LocationBar, null, createElement(HeaderTitle, null, 'Issues')),
            createElement(ViewBar, null, 'Views')
         )
      );

      expect(html).toContain('data-slot="location-bar"');
      expect(html).toContain('data-slot="view-bar"');
      expect(html).toContain('h-11');
      expect(html).toContain('h-[43px]');
   });

   it('deixa o conteúdo do MainLayout ocupar o espaço restante sem cálculo de viewport', () => {
      const html = renderToStaticMarkup(
         createElement(MainLayout, {
            header: createElement('div', null, 'Header'),
            children: 'Body',
         })
      );

      expect(html).toContain('min-h-0');
      expect(html).toContain('flex-1');
      expect(html).not.toContain('calc(100svh');
   });
});
