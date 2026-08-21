'use client';

import { usePreferencesStore } from '@/store/preferences-store';
import { useEffect } from 'react';

/**
 * Honra no app inteiro as preferências visuais de Preferences → Interface:
 * `Font size`, `Use pointer cursors` e `Underline links`. Escreve atributos
 * `data-*` no <html>; as regras vivem em globals.css (seção "user preferences").
 * As demais preferências só persistem (subsistemas ainda não construídos).
 * Montado uma vez no `DataHydrator`.
 */
const FONT_SIZE_ATTR: Record<string, string> = {
   Default: 'default',
   Small: 'small',
   Large: 'large',
};

export function PreferencesApplier() {
   const fontSize = usePreferencesStore((s) => s.fontSize);
   const pointerCursors = usePreferencesStore((s) => s.pointerCursors);
   const underlineLinks = usePreferencesStore((s) => s.underlineLinks);

   useEffect(() => {
      const root = document.documentElement;
      root.dataset.fontSize = FONT_SIZE_ATTR[fontSize] ?? 'default';
      root.dataset.pointerCursors = pointerCursors ? 'true' : 'false';
      root.dataset.underlineLinks = underlineLinks ? 'true' : 'false';
   }, [fontSize, pointerCursors, underlineLinks]);

   return null;
}
