'use client';

import type { Status } from '@/data/status';
import type { User } from '@/data/users';
import Link from 'next/link';
import { AssigneeUser } from '../assignee-user';
import { StatusSelector } from '../status-selector';

export interface SubIssueRowProps {
   id: string;
   identifier: string;
   title: string;
   status: Status;
   assignee: User | null;
   orgId: string;
}

/**
 * Linha de sub-issue no detalhe da pai (padrão Linear): status e assignee são
 * seletores vivos FORA do link — antes ficavam dentro do `<Link>` e o clique
 * navegava em vez de abrir o menu.
 */
export function SubIssueRow({ id, identifier, title, status, assignee, orgId }: SubIssueRowProps) {
   return (
      <div className="flex h-10 min-w-0 items-center gap-1.5 border-b border-border/50 px-1 text-sm hover:bg-sidebar/50 focus-within:bg-sidebar/50">
         <StatusSelector status={status} issueId={id} />
         <Link
            href={`/${orgId}/issue/${identifier}`}
            className="flex min-w-0 flex-1 items-center gap-2.5"
         >
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{identifier}</span>
            <span className="truncate font-medium">{title}</span>
         </Link>
         <span className="ml-auto shrink-0">
            <AssigneeUser user={assignee} issueId={id} />
         </span>
      </div>
   );
}
