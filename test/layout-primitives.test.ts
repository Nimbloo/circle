import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      expect(html).toContain('text-[13px]');
      expect(html).toContain('leading-[normal]');
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

   it('aplica a família Inter carregada no corpo da aplicação', () => {
      const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
      const styles = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

      expect(layout).toContain('font-sans antialiased');
      expect(styles).toMatch(/@theme inline \{\s+--font-sans: var\(--font-inter\)/);
   });
});
