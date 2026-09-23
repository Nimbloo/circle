// @vitest-environment jsdom

import './setup-dom';
import React, { useState } from 'react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatchedTarget } from '@/components/ui/alert-dialog';

/**
 * Alvo travado (ad#4): o diálogo de confirmação lê o alvo, que vira `null` no mesmo
 * instante em que ele começa a fechar — o título esvaziava durante a saída
 * (`Delete label “”?`). O `useLatchedTarget` segura o último alvo até a próxima abertura.
 */
describe('useLatchedTarget', () => {
   function Host() {
      const [target, setTarget] = useState<{ name: string } | null>(null);
      const latched = useLatchedTarget(target);
      return (
         <>
            <button onClick={() => setTarget({ name: 'Bug' })}>abrir bug</button>
            <button onClick={() => setTarget({ name: 'Chore' })}>abrir chore</button>
            <button onClick={() => setTarget(null)}>fechar</button>
            <p>Excluir “{latched?.name ?? ''}”?</p>
         </>
      );
   }

   it('mantém o nome do alvo enquanto o diálogo fecha e troca na abertura seguinte', () => {
      render(<Host />);
      expect(screen.getByText(/Excluir/).textContent).toBe('Excluir “”?');

      act(() => screen.getByText('abrir bug').click());
      expect(screen.getByText(/Excluir/).textContent).toBe('Excluir “Bug”?');

      // Fechou: o alvo some, mas o texto continua até a animação de saída terminar.
      act(() => screen.getByText('fechar').click());
      expect(screen.getByText(/Excluir/).textContent).toBe('Excluir “Bug”?');

      act(() => screen.getByText('abrir chore').click());
      expect(screen.getByText(/Excluir/).textContent).toBe('Excluir “Chore”?');
   });

   it('os diálogos de exclusão com nome no título usam o alvo travado', () => {
      const files = [
         'components/common/settings/issue-labels-settings.tsx',
         'components/common/settings/issue-templates-settings.tsx',
         'components/common/settings/project-statuses-settings.tsx',
         'components/common/settings/project-templates-settings.tsx',
         'components/common/teams/team-documents.tsx',
      ];
      for (const file of files) {
         const src = readFileSync(file, 'utf8');
         expect(src, file).toContain('useLatchedTarget(');
         // O título não pode mais ler o estado cru do alvo.
         const title = src.match(/<AlertDialogTitle>[\s\S]*?<\/AlertDialogTitle>/)![0];
         expect(title, file).not.toMatch(/\{(toDelete|deleting)\?/);
      }
   });

   it('nenhum título ou descrição de AlertDialog lê o estado cru do alvo', () => {
      const tracked = execSync('git ls-files components', { encoding: 'utf8' })
         .split('\n')
         // `components/ui` é o primitivo (o exemplo do docblock do hook mora lá).
         .filter((f) => f.endsWith('.tsx') && !f.startsWith('components/ui/'));
      const offenders = tracked.filter((file) =>
         [
            ...readFileSync(file, 'utf8').matchAll(
               /<AlertDialog(Title|Description)>[\s\S]*?<\/AlertDialog\1>/g
            ),
         ].some((match) =>
            // `{alvo?.nome}` ou `{alvo ? ... : ...}` — os dois esvaziam durante a saída.
            /\{(toDelete|deleting|target|removing)\s*\?/.test(match[0])
         )
      );
      expect(offenders).toEqual([]);
   });
});
