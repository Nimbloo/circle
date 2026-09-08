import type { CustomTheme, DarkVariant, LightVariant, ThemeMode } from '@/store/theme-store';

/**
 * Aplica o tema salvo ANTES do primeiro paint.
 *
 * O `next-themes` já resolve claro/escuro sem flash, porque injeta um script
 * bloqueante que põe a classe no `<html>`. A camada de VARIANTE do Circle
 * (`data-app-theme`: pure-light, magic-blue, classic-dark, dracula) e o tema
 * custom não tinham equivalente: vinham de um `useEffect` sobre um store
 * `persist` do zustand, que só roda depois da hidratação. Resultado: o primeiro
 * paint saía com o tema padrão e a variante entrava por cima — o flash relatado.
 *
 * Esta função é serializada com `toString()` e injetada como script bloqueante
 * no `<head>` (mesma técnica do next-themes). Por isso ela precisa ser
 * AUTOSSUFICIENTE: nada de import de valor, nada de constante de módulo, nada de
 * closure — o que estiver fora dela não existe no script, e a referência
 * quebrada seria engolida pelo `catch`, voltando ao flash em silêncio.
 * `test/theme-bootstrap.test.ts` executa o script serializado num escopo isolado
 * justamente para provar que ele se basta. (Tipos podem vir de fora: `import
 * type` é apagado na compilação.)
 *
 * O `ThemeApplier` chama ESTA MESMA função em runtime, então existe uma
 * implementação só: o que pinta antes do paint é exatamente o que pinta depois.
 */
export function applyStoredTheme(): void {
   try {
      const root = document.documentElement;

      // Os defaults precisam espelhar os do `useThemeStore` — quem nunca escolheu
      // tema também não pode ver flash (o padrão claro é `pure-light`, não `light`).
      let mode: ThemeMode = 'system';
      let lightVariant: LightVariant = 'pure-light';
      let darkVariant: DarkVariant = 'dark';
      let custom: CustomTheme = {
         accent: '#605e92',
         background: '#1c1a2b',
         contrast: 45,
         sidebar: false,
         sidebarAccent: '#575ac6',
         sidebarBackground: '#2a2a2a',
         sidebarContrast: 19,
      };

      const raw = localStorage.getItem('theme-settings');
      if (raw) {
         const state = (JSON.parse(raw) || {}).state || {};
         if (state.mode) mode = state.mode;
         if (state.lightVariant) lightVariant = state.lightVariant;
         if (state.darkVariant) darkVariant = state.darkVariant;
         if (state.custom) custom = Object.assign({}, custom, state.custom);
      }

      const toRgb = (hex: string): number[] => {
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

      const toHex = (rgb: number[]): string =>
         '#' +
         rgb
            .map((channel) =>
               Math.round(Math.min(255, Math.max(0, channel)))
                  .toString(16)
                  .padStart(2, '0')
            )
            .join('');

      const mix = (a: string, b: string, t: number): string => {
         const ca = toRgb(a);
         const cb = toRgb(b);
         return toHex([
            ca[0] + (cb[0] - ca[0]) * t,
            ca[1] + (cb[1] - ca[1]) * t,
            ca[2] + (cb[2] - ca[2]) * t,
         ]);
      };

      const isDark = (hex: string): boolean => {
         const c = toRgb(hex);
         return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 < 0.5;
      };

      const surfaceVars = (
         surface: { background: string; accent: string; contrast: number },
         prefix: '' | 'sidebar'
      ): Record<string, string> => {
         const background = surface.background;
         const accent = surface.accent;
         const dark = isDark(background);
         const fg = dark ? '#f7f8f8' : '#17171c';
         const k = surface.contrast / 100;
         const border = mix(background, fg, 0.08 + 0.14 * k);
         const subtle = mix(background, fg, 0.05 + 0.09 * k);

         if (prefix === 'sidebar') {
            return {
               '--sidebar': background,
               '--sidebar-foreground': fg,
               '--sidebar-border': border,
               '--sidebar-accent': subtle,
               '--sidebar-accent-foreground': fg,
               '--sidebar-primary': accent,
               '--sidebar-primary-foreground': isDark(accent) ? '#ffffff' : '#17171c',
               '--sidebar-ring': mix(accent, background, 0.35),
            };
         }

         return {
            '--background': background,
            '--foreground': fg,
            '--container': mix(background, dark ? '#ffffff' : '#000000', 0.03),
            '--card': mix(background, dark ? '#ffffff' : '#000000', 0.03),
            '--card-foreground': fg,
            '--popover': mix(background, dark ? '#ffffff' : '#000000', 0.05),
            '--popover-foreground': fg,
            '--secondary': subtle,
            '--secondary-foreground': fg,
            '--muted': subtle,
            '--muted-foreground': mix(fg, background, 0.35),
            '--accent': subtle,
            '--accent-foreground': fg,
            '--border': border,
            '--input': border,
            '--ring': mix(accent, background, 0.3),
            '--primary': accent,
            '--primary-foreground': isDark(accent) ? '#ffffff' : '#17171c',
         };
      };

      // Limpa o que um tema custom anterior tenha deixado inline no `<html>`.
      const todas = Object.keys(surfaceVars(custom, '')).concat(
         Object.keys(surfaceVars(custom, 'sidebar'))
      );
      for (const nome of todas) root.style.removeProperty(nome);

      if (mode === 'custom') {
         root.dataset.appTheme = 'custom';
         const base = surfaceVars(custom, '');
         const sidebar = custom.sidebar
            ? surfaceVars(
                 {
                    background: custom.sidebarBackground,
                    accent: custom.sidebarAccent,
                    contrast: custom.sidebarContrast,
                 },
                 'sidebar'
              )
            : {
                 '--sidebar': mix(
                    custom.background,
                    isDark(custom.background) ? '#ffffff' : '#000000',
                    0.02
                 ),
                 '--sidebar-foreground': base['--foreground'],
                 '--sidebar-border': base['--border'],
                 '--sidebar-accent': base['--accent'],
              };
         const vars = Object.assign({}, base, sidebar);
         for (const nome of Object.keys(vars)) root.style.setProperty(nome, vars[nome]);
         return;
      }

      const dark =
         mode === 'dark'
            ? true
            : mode === 'light'
              ? false
              : window.matchMedia('(prefers-color-scheme: dark)').matches;

      const variant = dark ? darkVariant : lightVariant;
      if (variant === 'light' || variant === 'dark') delete root.dataset.appTheme;
      else root.dataset.appTheme = variant;
   } catch {
      // Tema é cosmético: nunca derrubar o carregamento da página por causa dele.
   }
}
