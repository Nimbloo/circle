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

function bloco(tema: string): string {
   const m = css.match(new RegExp(`\\[data-app-theme='${tema}'\\]\\s*\\{([\\s\\S]*?)\\n\\}`));
   if (!m) throw new Error(`tema ${tema} não encontrado no globals.css`);
   return m[1];
}

function token(tema: string, nome: string): string | undefined {
   return bloco(tema)
      .match(new RegExp(`${nome}:\\s*([^;]+);`))?.[1]
      .trim();
}

function luminancia(hex: string): number {
   const v = hex.replace('#', '');
   const canais = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
   const linear = canais.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
   return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contraste(a: string, b: string): number {
   const [x, y] = [luminancia(a), luminancia(b)];
   return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const ehHex = (v?: string): v is string => !!v && /^#[0-9a-f]{6}$/i.test(v);

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
