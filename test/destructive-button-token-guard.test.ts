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

describe('bg-destructive usa o token de texto, não hex literal', () => {
   it('nenhum arquivo combina bg-destructive com text-white', () => {
      const files = [...walk(path.join(ROOT, 'components')), ...walk(path.join(ROOT, 'app'))];
      const offenders: string[] = [];
      for (const file of files) {
         const src = readFileSync(file, 'utf8');
         const lines = src.split('\n');
         lines.forEach((line, idx) => {
            if (/bg-destructive/.test(line) && /\btext-white\b/.test(line)) {
               offenders.push(`${path.relative(ROOT, file)}:${idx + 1}`);
            }
         });
      }
      expect(offenders).toEqual([]);
   });
});
