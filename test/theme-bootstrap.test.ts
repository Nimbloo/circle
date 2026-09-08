// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyStoredTheme } from '@/lib/theme-bootstrap';

/**
 * Tema aplicado ANTES do primeiro paint.
 *
 * O flash relatado tinha uma causa só: o next-themes resolve claro/escuro com um
 * script bloqueante, mas a camada de VARIANTE do Circle (`data-app-theme`) e o
 * tema custom vinham de um `useEffect` sobre um store `persist` do zustand — só
 * depois da hidratação. O primeiro paint saía com o tema padrão.
 *
 * Estes testes rodam o **script serializado** (`toString()` dentro de um
 * `new Function`), não a função importada. A diferença importa: é assim que ele
 * roda de verdade no `<head>`, e é a única forma de provar que a função se basta.
 * Se ela passar a referenciar um import ou uma constante de módulo, o
 * `ReferenceError` seria engolido pelo `catch` interno — nada de erro, só o flash
 * de volta. Aqui isso vira um teste vermelho, porque o efeito no DOM não acontece.
 */

/** Roda a função do jeito que o `<head>` roda: fora do escopo do módulo. */
function rodaComoNoHead(): void {
   new Function(`(${applyStoredTheme.toString()})();`)();
}

function preferirEscuro(escuro: boolean): void {
   Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
         matches: escuro,
         media: query,
         addEventListener: () => {},
         removeEventListener: () => {},
      }),
   });
}

function salvar(state: Record<string, unknown>): void {
   localStorage.setItem('theme-settings', JSON.stringify({ state, version: 0 }));
}

const raiz = () => document.documentElement;

beforeEach(() => {
   localStorage.clear();
   delete raiz().dataset.appTheme;
   raiz().removeAttribute('style');
   preferirEscuro(true);
});
afterEach(() => localStorage.clear());

describe('tema aplicado antes do primeiro paint', () => {
   it('sem nada salvo, usa os mesmos padrões do store', () => {
      preferirEscuro(false);
      rodaComoNoHead();
      // O padrão claro do store é `pure-light`, não `light` — quem nunca escolheu
      // tema também não pode ver flash.
      expect(raiz().dataset.appTheme).toBe('pure-light');
   });

   it('sem nada salvo e SO escuro, não marca variante (o `dark` é o base)', () => {
      preferirEscuro(true);
      rodaComoNoHead();
      expect(raiz().dataset.appTheme).toBeUndefined();
   });

   it('aplica a variante escura salva', () => {
      salvar({ mode: 'dark', darkVariant: 'dracula' });
      rodaComoNoHead();
      expect(raiz().dataset.appTheme).toBe('dracula');
   });

   it('respeita o modo salvo em vez da preferência do SO', () => {
      preferirEscuro(true); // SO escuro, mas o usuário escolheu claro
      salvar({ mode: 'light', lightVariant: 'pure-light', darkVariant: 'dracula' });
      rodaComoNoHead();
      expect(raiz().dataset.appTheme).toBe('pure-light');
   });

   it('no modo system, segue a preferência do SO', () => {
      salvar({ mode: 'system', lightVariant: 'pure-light', darkVariant: 'magic-blue' });
      preferirEscuro(true);
      rodaComoNoHead();
      expect(raiz().dataset.appTheme).toBe('magic-blue');

      preferirEscuro(false);
      rodaComoNoHead();
      expect(raiz().dataset.appTheme).toBe('pure-light');
   });

   it('tema custom já sai com as variáveis inline', () => {
      salvar({
         mode: 'custom',
         custom: {
            accent: '#605e92',
            background: '#1c1a2b',
            contrast: 45,
            sidebar: false,
            sidebarAccent: '#575ac6',
            sidebarBackground: '#2a2a2a',
            sidebarContrast: 19,
         },
      });
      rodaComoNoHead();
      expect(raiz().dataset.appTheme).toBe('custom');
      expect(raiz().style.getPropertyValue('--background')).toBe('#1c1a2b');
      expect(raiz().style.getPropertyValue('--primary')).toBe('#605e92');
      // O sidebar desligado ainda recebe seu próprio fundo, derivado do custom.
      expect(raiz().style.getPropertyValue('--sidebar')).not.toBe('');
   });

   it('sair do custom limpa as variáveis que ele deixou inline', () => {
      salvar({
         mode: 'custom',
         custom: { background: '#1c1a2b', accent: '#605e92', contrast: 45 },
      });
      rodaComoNoHead();
      expect(raiz().style.getPropertyValue('--background')).toBe('#1c1a2b');

      salvar({ mode: 'dark', darkVariant: 'dracula' });
      rodaComoNoHead();
      expect(raiz().style.getPropertyValue('--background')).toBe('');
      expect(raiz().dataset.appTheme).toBe('dracula');
   });

   it('estado salvo corrompido não derruba a página', () => {
      localStorage.setItem('theme-settings', 'isso não é json');
      expect(() => rodaComoNoHead()).not.toThrow();
   });
});
