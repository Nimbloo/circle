'use client';

import type { CSSProperties } from 'react';
import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps } from 'sonner';

/**
 * Pele do popover no toast. O CSS do sonner é injetado sem layer e vence as utilities do
 * Tailwind (`group-[.toaster]:bg-popover` não pegava: o toast saía #000/#333); as cores e o
 * raio entram pelas variáveis que o próprio sonner lê. Sombra e tempos (200 ms na entrada,
 * 150 ms na saída) ficam em `app/globals.css`.
 */
const POPOVER_SKIN = {
   '--normal-bg': 'var(--popover)',
   '--normal-text': 'var(--popover-foreground)',
   '--normal-border': 'var(--popover-border)',
   '--border-radius': '8px',
} as CSSProperties;

const Toaster = ({ style, ...props }: ToasterProps) => {
   const { theme = 'system' } = useTheme();

   return (
      <Sonner
         theme={theme as ToasterProps['theme']}
         className="toaster group"
         style={{ ...POPOVER_SKIN, ...style }}
         {...props}
      />
   );
};

export { Toaster };
