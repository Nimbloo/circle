import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda estática: `bg-destructive` sempre pareado com `text-destructive-foreground`, nunca
 * `text-white`. O token varia por tema (`--destructive-foreground` é escuro no Dracula), e o
 * hex literal ignora essa escolha — no Dracula, `text-white` sobre `--destructive` (#ff5555)
 * cai para 3,1:1 de contraste (abaixo do mínimo WCAG de 4,5:1 para texto), enquanto o token
 * correto dá 4,5:1. Achado real em componentes/ui/button.tsx e em seis `AlertDialogAction` de
 * confirmação de exclusão que replicavam a classe manualmente.
 *
 * A checagem é por EXPRESSÃO de classe (cada literal de string), não por linha: o fundo e o
 * texto precisam estar no mesmo literal, e qualquer outra cor de texto ali é recusada.
 */

const ROOT = path.resolve(__dirname, '..');

function walk(dir: string, out: string[] = []): string[] {
   for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.name.endsWith('.tsx')) out.push(full);
   }
   return out;
}

/** Literais de string ('…', "…", `…`) do código-fonte, com a linha em que começam. */
function stringLiterals(src: string): { text: string; line: number }[] {
   const out: { text: string; line: number }[] = [];
   const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
   for (const m of src.matchAll(re)) {
      out.push({ text: m[2], line: src.slice(0, m.index).split('\n').length });
   }
   return out;
}

/** Classe sem variantes (`hover:`, `dark:`…); `bg-destructive/90` não é o fundo sólido. */
const base = (token: string) => token.slice(token.lastIndexOf(':') + 1);

/** Problemas de um arquivo: literal com fundo destrutivo sem o par de texto correto. */
function destructiveOffenders(src: string): number[] {
   const lines: number[] = [];
   for (const { text, line } of stringLiterals(src)) {
      const tokens = text.split(/\s+/).filter(Boolean);
      if (!tokens.some((t) => base(t) === 'bg-destructive')) continue;
      const textColors = tokens.filter((t) =>
         /^text-(?!xs|sm|base|lg|\d?xl|left|right|center|justify)/.test(base(t))
      );
      const ok =
         textColors.some((t) => base(t) === 'text-destructive-foreground') &&
         textColors.every((t) => base(t) === 'text-destructive-foreground');
      if (!ok) lines.push(line);
   }
   return lines;
}

describe('bg-destructive usa o token de texto, não hex literal', () => {
   it('o detector pega texto errado, texto ausente e classes espalhadas em linhas', () => {
      expect(
         destructiveOffenders('<b className="bg-destructive text-muted-foreground" />')
      ).toEqual([1]);
      expect(destructiveOffenders("cn(\n  'bg-destructive',\n  'text-white'\n)")).toEqual([2]);
      expect(destructiveOffenders('<b className="bg-destructive text-white" />')).toEqual([1]);
      expect(
         destructiveOffenders(
            '<b className="bg-destructive text-destructive-foreground hover:bg-destructive/90" />'
         )
      ).toEqual([]);
      // Só a variante translúcida (hover) não é o fundo sólido.
      expect(destructiveOffenders('<b className="hover:bg-destructive/10 text-white" />')).toEqual(
         []
      );
   });

   it('nenhuma expressão de classe com bg-destructive usa outro texto que não o token', () => {
      const files = [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))];
      const offenders: string[] = [];
      for (const file of files) {
         for (const line of destructiveOffenders(readFileSync(file, 'utf8'))) {
            offenders.push(`${path.relative(ROOT, file)}:${line}`);
         }
      }
      expect(offenders).toEqual([]);
   });
});
