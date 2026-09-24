import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O editor de blocos (Tiptap/ProseMirror, ~137 kB gzip) não entra no first load de rotas
 * que só o usam depois de uma ação: `/projects` (dialog "New project", pelo header) e
 * `/inbox` (preview da notificação). Nesses módulos ele vem por `next/dynamic`; import
 * ESTÁTICO de valor do editor (ou de `lib/editor-doc`, que puxa o Tiptap) puxaria o
 * chunk inteiro de volta. A medição real fica com `ANALYZE=true pnpm build`.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

/** `import { … } from '<mod>'` de valor (ignora `import type`). */
function valueImports(source: string, mod: string): string[] {
   const re = new RegExp(
      `^import\\s+(?!type\\b)[^;]*from\\s+'${mod.replace(/[/.]/g, '\\$&')}';`,
      'gm'
   );
   return source.match(re) ?? [];
}

describe('editor fora do first load de /projects e /inbox', () => {
   it('dialog de criar projeto: BlockEditor por next/dynamic, sem lib/editor-doc de valor', () => {
      const src = read('components/common/projects/create-project-dialog.tsx');
      expect(valueImports(src, '@/components/common/editor/block-editor')).toEqual([]);
      expect(valueImports(src, '@/lib/editor-doc')).toEqual([]);
      expect(src).toMatch(
         /dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/common\/editor\/block-editor'\)/
      );
   });

   it('preview do inbox: detalhe da issue (com o editor) por next/dynamic', () => {
      const src = read('components/common/inbox/issue-preview.tsx');
      expect(valueImports(src, '@/components/common/issues/details/issue-details')).toEqual([]);
      expect(src).toMatch(
         /dynamic\(\s*\(\)\s*=>\s*import\('@\/components\/common\/issues\/details\/issue-details'\)/
      );
   });
});
