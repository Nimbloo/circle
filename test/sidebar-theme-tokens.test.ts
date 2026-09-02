import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const selectors = [
   ':root',
   '.dark',
   "[data-app-theme='pure-light']",
   "[data-app-theme='magic-blue']",
   "[data-app-theme='classic-dark']",
];

function declaration(selector: string, name: string): string | undefined {
   const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
   const block = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`))?.[1];
   return block?.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
}

describe('tokens da sidebar', () => {
   it.each(selectors)('%s separa hover de item selecionado', (selector) => {
      const hover = declaration(selector, '--sidebar-hover');
      const selected = declaration(selector, '--sidebar-accent');

      expect(hover).toBeTruthy();
      expect(hover).not.toBe(selected);
   });

   it('mantém o hover dark medido no Linear', () => {
      expect(declaration('.dark', '--sidebar-hover')).toBe('lch(8.445 1.3 272)');
   });
});
