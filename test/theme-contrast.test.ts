import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contraste mínimo dos temas de cor sólida.
 *
 * Existe porque a paleta oficial do Dracula não passa como está: o `comment` (#6272a4),
 * que é a cor canônica de texto secundário, dá 3,0:1 sobre o fundo — e neste app o
 * `--muted-foreground` carrega metadado de issue na tela inteira. Fidelidade à paleta
 * não vale um app ilegível; o tema clareia essa cor o mínimo necessário.
 *
 * Só valem os temas declarados em hex. `.dark` e `:root` usam `lch()`, e o `custom` é
 * gerado em runtime pelo ThemeApplier — ficam fora daqui de propósito.
 */
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

const TEMAS = ['pure-light', 'magic-blue', 'classic-dark', 'dracula'] as const;

/** Texto normal precisa de 4,5:1 (o mínimo da WCAG para corpo de texto). */
const MINIMO_TEXTO = 4.5;

/** Elemento não-textual (borda/limite de componente) — WCAG 1.4.11. */
const MINIMO_NAO_TEXTO = 3;

function bloco(tema: string): string {
   const m = css.match(new RegExp(`\\[data-app-theme='${tema}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
   if (!m) throw new Error(`tema ${tema} não encontrado no globals.css`);
   return m[1];
}

/** `:root` (light default) e `.dark` (dark default) — os dois blocos-base, sem `data-app-theme`. */
function blocoBase(tema: 'light' | 'dark'): string {
   const seletor = tema === 'light' ? ':root' : '\\.dark';
   const m = css.match(new RegExp(`${seletor}\\s*\\{([\\s\\S]*?)\\n\\}`));
   if (!m) throw new Error(`bloco base ${tema} não encontrado no globals.css`);
   return m[1];
}

function token(tema: string, nome: string): string | undefined {
   const texto = tema === 'light' || tema === 'dark' ? blocoBase(tema) : bloco(tema);
   return texto.match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1].trim();
}

/** Luminância relativa de `lch(L C H)` (CSS Color 4 — Lab D50 → XYZ → D65 → sRGB linear). */
function luminanciaLch(cor: string): number {
   const m = cor.match(/lch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
   if (!m) throw new Error(`lch inválido: ${cor}`);
   const [L, C, H] = [Number(m[1]), Number(m[2]), Number(m[3])];
   const a = C * Math.cos((H * Math.PI) / 180);
   const b = C * Math.sin((H * Math.PI) / 180);

   const k = 24389 / 27;
   const e = 216 / 24389;
   const f1 = (L + 16) / 116;
   const f0 = a / 500 + f1;
   const f2 = f1 - b / 200;
   const white = [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585]; // D50
   const xyz50 = [
      (f0 ** 3 > e ? f0 ** 3 : (116 * f0 - 16) / k) * white[0],
      (L > k * e ? ((L + 16) / 116) ** 3 : L / k) * white[1],
      (f2 ** 3 > e ? f2 ** 3 : (116 * f2 - 16) / k) * white[2],
   ];
   // Bradford D50 → D65
   const mAdapt = [
      [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
      [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
      [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
   ];
   const xyz65 = mAdapt.map(([x, y, z]) => x * xyz50[0] + y * xyz50[1] + z * xyz50[2]);
   // XYZ (D65) → linear sRGB — a mesma matriz usada para a fórmula de luminância WCAG.
   const mSrgb = [
      [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
      [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
      [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
   ];
   const [r, g, bChan] = mSrgb.map(([x, y, z]) =>
      Math.max(0, Math.min(1, x * xyz65[0] + y * xyz65[1] + z * xyz65[2]))
   );
   return 0.2126 * r + 0.7152 * g + 0.0722 * bChan;
}

function luminancia(cor: string): number {
   if (cor.startsWith('lch(')) return luminanciaLch(cor);
   const v = cor.replace('#', '');
   const canais = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
   const linear = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
   return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contraste(a: string, b: string): number {
   const [x, y] = [luminancia(a), luminancia(b)];
   return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const ehHex = (v?: string): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);
const ehCor = (v?: string): v is string =>
   !!v && (/^#[0-9a-f]{6}$/i.test(v) || v.startsWith('lch('));

describe('contraste dos temas', () => {
   it.each(TEMAS)('%s: texto principal e secundário são legíveis sobre fundo e card', (tema) => {
      const fundo = token(tema, '--background');
      const card = token(tema, '--card');
      const texto = token(tema, '--foreground');
      const secundario = token(tema, '--muted-foreground');

      // Um tema pode herdar parte dos tokens de `.dark`; só checamos o que ele declara.
      for (const [superficie, cor] of [
         ['fundo', fundo],
         ['card', card],
      ] as const) {
         if (!ehHex(cor)) continue;
         if (ehHex(texto)) {
            expect(
               contraste(texto, cor),
               `${tema}: texto sobre ${superficie}`
            ).toBeGreaterThanOrEqual(MINIMO_TEXTO);
         }
         if (ehHex(secundario)) {
            expect(
               contraste(secundario, cor),
               `${tema}: texto secundário sobre ${superficie}`
            ).toBeGreaterThanOrEqual(MINIMO_TEXTO);
         }
      }
   });

   it('dracula mantém a identidade da paleta oficial', () => {
      expect(token('dracula', '--background')).toBe('#282a36');
      expect(token('dracula', '--foreground')).toBe('#f8f8f2');
      expect(token('dracula', '--primary')).toBe('#bd93f9'); // roxo
      expect(token('dracula', '--destructive')).toBe('#ff5555'); // vermelho
      expect(token('dracula', '--sidebar')).toBe('#21222c'); // bg darker oficial
   });
});

/**
 * Botões `secondary`/`outline` (components/ui/button.tsx) — WCAG 1.4.11 (não-texto).
 *
 * O limite visual do botão (a borda, via `--button-border`) precisa de ≥3:1 contra as
 * superfícies onde ele aparece: a página (`--background`) e cards/paineis (`--card`).
 * Cobre os 6 temas de cor sólida do app, inclusive `light`/`dark` (que usam `lch()`,
 * por isso ficam de fora do describe acima — aqui a luminância sabe converter lch()).
 */
describe('contraste da borda dos botões secondary/outline', () => {
   const TODOS_OS_TEMAS = ['light', 'dark', 'pure-light', 'magic-blue', 'classic-dark', 'dracula'];

   it.each(TODOS_OS_TEMAS)('%s: --button-border tem ≥3:1 contra fundo e card', (tema) => {
      const borda = token(tema, '--button-border');
      const fundo = token(tema, '--background');
      const card = token(tema, '--card');

      expect(ehCor(borda), `${tema}: --button-border ausente ou em formato não suportado`).toBe(
         true
      );

      for (const [superficie, cor] of [
         ['fundo', fundo],
         ['card', card],
      ] as const) {
         if (!ehCor(cor)) continue;
         expect(
            contraste(borda as string, cor),
            `${tema}: borda do botão sobre ${superficie}`
         ).toBeGreaterThanOrEqual(MINIMO_NAO_TEXTO);
      }
   });
});
