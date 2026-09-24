import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Auditoria de toasts (itens 4 e 5), guarda estática: estas telas mostravam `e.message`
 * cru (500 "Internal Server Error", "Failed to fetch", "" do gateway) ou escondiam o
 * motivo do 4xx atrás de um texto genérico. O padrão é `errorReason(e, '<fallback>')`:
 * 4xx com o `detail` da API, 5xx/rede no fallback amigável.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

const FILES = [
   // item 4 — motivo do 4xx escondido
   'components/layout/sidebar/create-new-issue/index.tsx',
   'components/common/projects/create-project-dialog.tsx',
   'components/common/teams/add-team-member-button.tsx',
   'components/common/issues/details/parent-issue.tsx',
   // item 5 — e.message cru
   'components/common/cycles/cycle-actions.tsx',
   'components/common/cycles/create-cycle-dialog.tsx',
   'components/common/teams/delete-team-dialog.tsx',
   'components/common/views/view-actions.tsx',
   'components/common/issues/triage/triage-suggestion-card.tsx',
   'store/workspace-store.ts',
];

describe('toasts de erro passam por errorReason', () => {
   it.each(FILES)('%s não mostra e.message cru', (file) => {
      const src = read(file);
      expect(src).not.toMatch(/\?\s*(e|err|error)\.message\b/);
      expect(src).not.toMatch(/toast\.(error|warning)\([^;]*\b(e|err|error)\.message/);
   });

   it.each(FILES)('%s usa errorReason', (file) => {
      expect(read(file)).toMatch(/errorReason\(/);
   });
});
