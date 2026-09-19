import type { DiffLine } from '@/data/reviews';

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const EMPTY: DiffLine[] = [];
/** Teto de patches memoizados (FIFO): cobre alguns PRs grandes abertos na sessão. */
const CACHE_LIMIT = 500;
const cache = new Map<string, DiffLine[]>();

/**
 * Converte o `patch` unified que o GitHub devolve por arquivo (só hunks, sem cabeçalho
 * `---/+++`) nas linhas que o `DiffView` renderiza. Entre hunks entra uma linha `skip`
 * com a quantidade de linhas inalteradas puladas; `number` é a linha no arquivo NOVO.
 * Patch vazio ou inválido → `[]` (a UI mostra só o cabeçalho do arquivo).
 */
export function patchToLines(patch: string | null | undefined): DiffLine[] {
   if (!patch) return EMPTY;
   // Memo por conteúdo (#47): a recarga do review (evento de comentário/checks) traz os
   // MESMOS patches em objetos novos — sem o cache, todo arquivo era re-parseado e o
   // array novo furava o `memo` do DiffView.
   const cached = cache.get(patch);
   if (cached) return cached;
   const lines = parse(patch);
   if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
   cache.set(patch, lines);
   return lines;
}

function parse(patch: string): DiffLine[] {
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
