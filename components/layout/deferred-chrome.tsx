'use client';

import dynamic from 'next/dynamic';

/**
 * Chrome pesado carregado sob demanda (code-split). O `CommandPalette` (~645 linhas +
 * cmdk) e o `CreateIssueModalProvider` (stack do editor/form) saem do chunk inicial do
 * shell e carregam client-side APÓS a hidratação. Ambos são gated por interação
 * (⌘K / botão "new issue"), então o defer não muda a UX percebida — só deixa o first
 * load mais leve. `ssr:false` exige um client boundary (por isso este componente).
 */
const CommandPalette = dynamic(
   () => import('./command-palette').then((m) => ({ default: m.CommandPalette })),
   { ssr: false }
);
const CreateIssueModalProvider = dynamic(
   () =>
      import('@/components/common/issues/create-issue-modal-provider').then((m) => ({
         default: m.CreateIssueModalProvider,
      })),
   { ssr: false }
);

export function DeferredChrome() {
   return (
      <>
         <CommandPalette />
         <CreateIssueModalProvider />
      </>
   );
}
