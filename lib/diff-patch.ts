import type { DiffLine } from '@/data/reviews';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Converte o `patch` unified que o GitHub devolve por arquivo (só hunks, sem cabeçalho
 * `---/+++`) nas linhas que o `DiffView` renderiza. Entre hunks entra uma linha `skip`
 * com a quantidade de linhas inalteradas puladas; `number` é a linha no arquivo NOVO.
 * Patch vazio ou inválido → `[]` (a UI mostra só o cabeçalho do arquivo).
 */
export function patchToLines(patch: string | null | undefined): DiffLine[] {
   if (!patch) return [];
   const out: DiffLine[] = [];
   let newLine = 0;
   let lastNewEnd = 0; // última linha nova coberta pelo hunk anterior
   let inHunk = false;
   for (const raw of patch.split('\n')) {
      const header = raw.match(HUNK_HEADER);
      if (header) {
         const start = Number(header[3]);
         if (inHunk && start > lastNewEnd + 1) {
            out.push({ type: 'skip', count: start - lastNewEnd - 1 });
         } else if (!inHunk && start > 1) {
            out.push({ type: 'skip', count: start - 1 });
         }
         newLine = start;
         inHunk = true;
         continue;
      }
      if (!inHunk) continue;
      if (raw.startsWith('\\')) continue; // "\ No newline at end of file"
      const marker = raw[0];
      const text = raw.slice(1);
      if (marker === '+') {
         out.push({ type: 'add', number: newLine, text });
         newLine += 1;
      } else if (marker === '-') {
         out.push({ type: 'del', text });
      } else {
         out.push({ type: 'context', number: newLine, text });
         newLine += 1;
      }
      lastNewEnd = newLine - 1;
   }
   return out;
}
