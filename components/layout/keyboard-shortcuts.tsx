'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { useSearchStore } from '@/store/search-store';
import { useIssuesStore } from '@/store/issues-store';
import { useWorkspaceStore } from '@/store/workspace-store';
import { hasOpenOverlay, isTypingTarget } from '@/lib/keyboard-guard';
import {
   createSequenceTracker,
   dispatchIssueShortcut,
   findShortcut,
   getShortcut,
   openCommandMenu,
   OPEN_SHORTCUTS_EVENT,
   supportsIssueSearch,
   type IssueShortcutAction,
} from '@/lib/shortcuts';
import {
   getContextIssue,
   issueBranchName,
   issueUrl,
   startIssueOnBranchCopy,
} from './context-issue';
import { ShortcutsHelp } from './shortcuts-help';

/** Sub-página do ⌘K equivalente a cada tecla da issue (fallback sem painel aberto). */
const PALETTE_PAGE: Partial<Record<IssueShortcutAction, string>> = {
   status: 'status',
   priority: 'priority',
   assignee: 'assign',
   labels: 'labels',
   project: 'project',
   cycle: 'cycle',
   dueDate: 'due-date',
};

async function copy(label: string, text: string) {
   try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
   } catch {
      toast.error('Could not access the clipboard');
   }
}

/**
 * Atalhos de teclado globais (paridade Linear), lidos da tabela única `lib/shortcuts.ts`.
 * Ignora digitação e overlays abertos (dialog/menu/popover) — o atalho é do overlay.
 * Monta uma vez no layout do workspace e hospeda o painel `?`.
 */
export function KeyboardShortcuts() {
   const router = useRouter();
   const pathname = usePathname();
   const { orgId } = useParams<{ orgId?: string }>();
   const openCreate = useCreateIssueStore((s) => s.openModal);
   const openSearch = useSearchStore((s) => s.openSearch);
   const [helpOpen, setHelpOpen] = useState(false);
   const tracker = useRef(createSequenceTracker());
   const pathRef = useRef(pathname);
   pathRef.current = pathname;

   useEffect(() => {
      const onOpenHelp = () => setHelpOpen(true);
      window.addEventListener(OPEN_SHORTCUTS_EVENT, onOpenHelp);
      return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, onOpenHelp);
   }, []);

   useEffect(() => {
      const org = orgId ?? 'nimbloo';

      const runIssue = (id: string, e: KeyboardEvent) => {
         const issue = getContextIssue(pathRef.current ?? '');
         if (!issue) return;
         const shortcut = getShortcut(id)!;
         e.preventDefault();
         if (shortcut.issueAction) {
            const handled = dispatchIssueShortcut(shortcut.issueAction);
            const page = PALETTE_PAGE[shortcut.issueAction];
            if (!handled && page) openCommandMenu(page);
            return;
         }
         const { me, users } = useWorkspaceStore.getState();
         if (id === 'issue.assign-me') {
            const self = users.find((u) => u.id === me?.id);
            if (!self) return;
            const mine = issue.assignee?.id === self.id;
            void useIssuesStore
               .getState()
               .updateIssueAssignee(issue.id, mine ? null : self)
               .then(() => toast.success(mine ? 'Un-assigned' : 'Assigned to you'))
               .catch(() => {});
         } else if (id === 'copy.id') void copy('Issue ID', issue.identifier);
         else if (id === 'copy.url') void copy('Issue URL', issueUrl(org, issue.identifier));
         else if (id === 'copy.branch') {
            void copy('Branch name', issueBranchName(issue, me));
            startIssueOnBranchCopy(issue);
         }
      };

      const onKey = (e: KeyboardEvent) => {
         if (e.defaultPrevented) return;
         // Digitando, ou com dialog/menu/popover aberto: o atalho é do overlay, não da página.
         if (isTypingTarget(e.target) || hasOpenOverlay()) return;

         // Sequência G + tecla primeiro: o `i` de "G I" não pode virar "Assign to me".
         const step = tracker.current.feed(e);
         if (step.pending) return;
         if (step.id) {
            const path = getShortcut(step.id)?.path;
            if (path) {
               e.preventDefault();
               router.push(`/${org}${path}`);
            }
            return;
         }

         // Teclas da issue (inclui as de copiar, com modificador).
         const issueShortcut = findShortcut('issue', e);
         if (issueShortcut) {
            runIssue(issueShortcut.id, e);
            return;
         }
         if (e.metaKey || e.ctrlKey || e.altKey) return;

         const shortcut = findShortcut('global', e);
         if (!shortcut) return;
         if (shortcut.id === 'issue.create') {
            e.preventDefault();
            openCreate();
         } else if (shortcut.id === 'search.issues') {
            // Só onde a busca existe (co#15): fora dela ligava a busca "em segredo".
            if (!supportsIssueSearch(pathRef.current ?? '')) return;
            e.preventDefault();
            openSearch();
         } else if (shortcut.id === 'help.shortcuts') {
            e.preventDefault();
            setHelpOpen(true);
         }
      };

      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
   }, [router, orgId, openCreate, openSearch]);

   return <ShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} />;
}
