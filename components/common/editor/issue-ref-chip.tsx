'use client';

import { useIssuesStore } from '@/store/issues-store';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Chip "vivo" da referência a issue (#16): ícone de status e título vêm do
 * `issues-store` (se a issue sumiu, mostra só o identifier) e o clique abre a issue.
 */
export function IssueRefChip({ node }: NodeViewProps) {
   const identifier = String(node.attrs.identifier ?? '');
   const issue = useIssuesStore((s) => s.issues.find((i) => i.identifier === identifier));
   const params = useParams<{ orgId?: string }>();
   const orgId = params?.orgId ?? 'nimbloo';
   const StatusIcon = issue?.status.icon;

   return (
      <NodeViewWrapper as="span" className="issue-ref" data-identifier={identifier}>
         <Link
            href={`/${orgId}/issue/${identifier}`}
            className="inline-flex max-w-full items-center gap-1 align-baseline no-underline"
            contentEditable={false}
            draggable={false}
         >
            {StatusIcon ? (
               <span className="inline-flex size-3.5 shrink-0 items-center justify-center [&>svg]:size-3.5">
                  <StatusIcon />
               </span>
            ) : null}
            <span className="font-medium">{identifier}</span>
            {issue ? <span className="truncate text-muted-foreground">{issue.title}</span> : null}
         </Link>
      </NodeViewWrapper>
   );
}
