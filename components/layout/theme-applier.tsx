'use client';

import { applyStoredTheme } from '@/lib/theme-bootstrap';
import { useThemeStore } from '@/store/theme-store';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

/* ------------------------------ color helpers ----------------------------- */

const hexToRgb = (hex: string): [number, number, number] => {
   const value = hex.replace('#', '');
   const full =
      value.length === 3
         ? value
              .split('')
              .map((char) => char + char)
              .join('')
         : value.padEnd(6, '0');
   return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
   ];
};

export const isDarkColor = (hex: string): boolean => {
   const [r, g, b] = hexToRgb(hex);
   return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
};

/**
 * Mantém o DOM em dia com o theme-store DEPOIS da carga: o next-themes cuida da
 * classe light/dark/system e o `applyStoredTheme` cuida da variante
 * (`data-app-theme`) e das variáveis do tema custom.
 *
 * A aplicação em si NÃO vive aqui — vive em `lib/theme-bootstrap.ts`, chamada
 * também pelo script bloqueante do `<head>`. Uma implementação só: o que pinta
 * antes do primeiro paint é exatamente o que pinta depois, então não há flash na
 * carga nem divergência entre os dois caminhos. Ela lê o localStorage direto (o
 * `persist` do zustand grava de forma síncrona no `set`), o que também a torna
 * imune à ordem de re-hidratação do store.
 */
export function ThemeApplier() {
   const { mode, lightVariant, darkVariant, custom } = useThemeStore();
   const { resolvedTheme, setTheme } = useTheme();

   // Keep next-themes in sync with the selected mode.
   useEffect(() => {
      if (mode === 'system') setTheme('system');
      else if (mode === 'light') setTheme('light');
      else if (mode === 'dark') setTheme('dark');
      else setTheme(isDarkColor(custom.background) ? 'dark' : 'light');
   }, [mode, custom.background, setTheme]);

   // Reaplica quando a preferência muda (ou quando o SO alterna claro/escuro, que
   // chega aqui pelo `resolvedTheme` do next-themes).
   useEffect(() => {
      applyStoredTheme();
   }, [mode, lightVariant, darkVariant, custom, resolvedTheme]);

   return null;
}
