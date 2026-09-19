/**
 * Tabela ÚNICA de atalhos de teclado (co#5/#6). Alimenta:
 *  - o listener global (`components/layout/keyboard-shortcuts.tsx`);
 *  - as dicas de tecla do ⌘K (`command-palette.tsx`);
 *  - o painel de ajuda `?` (`shortcuts-help.tsx`);
 *  - o listener do inbox (`components/common/inbox/inbox.tsx`).
 * Antes cada um tinha a sua lista e a paleta anunciava teclas que não faziam nada.
 *
 * Notação das teclas (`keys`): cada item é uma ALTERNATIVA; dentro dela, espaço separa
 * os passos de uma sequência (`'g i'` = G e depois I) e `+` junta modificadores ao passo
 * (`'mod+shift+comma'`). `mod` é ⌘ no Mac e Ctrl fora dele. Pontuação é casada pelo
 * `code` físico (o `key` muda com o Shift e o layout).
 */

/** Ação de propriedade da issue — contrato `circle:issue-shortcut` com o painel da issue. */
export type IssueShortcutAction =
   | 'status'
   | 'priority'
   | 'assignee'
   | 'labels'
   | 'project'
   | 'cycle'
   | 'estimate'
   | 'dueDate';

export type ShortcutGroup = 'General' | 'Navigation' | 'Issue' | 'Copy' | 'Lists' | 'Inbox';

/**
 * Onde a tecla é tratada:
 *  - `global`: listener global (qualquer tela do workspace);
 *  - `issue`: listener global, só com uma issue em contexto (detalhe ou preview do inbox);
 *  - `inbox`: listener do inbox;
 *  - `external`: outro componente trata (⌘K, ⌘B, listas, detalhe) — aqui só documenta.
 */
export type ShortcutScope = 'global' | 'issue' | 'inbox' | 'external';

export interface Shortcut {
   id: string;
   label: string;
   group: ShortcutGroup;
   scope: ShortcutScope;
   keys: string[];
   /** Navegação: destino relativo ao workspace. */
   path?: string;
   /** Tecla de propriedade da issue: vira o evento `circle:issue-shortcut`. */
   issueAction?: IssueShortcutAction;
}

export const SHORTCUTS: readonly Shortcut[] = [
   // General
   {
      id: 'command.open',
      label: 'Open command menu',
      group: 'General',
      scope: 'external',
      keys: ['mod+k'],
   },
   {
      id: 'help.shortcuts',
      label: 'Keyboard shortcuts',
      group: 'General',
      scope: 'global',
      keys: ['?'],
   },
   { id: 'issue.create', label: 'Create issue', group: 'General', scope: 'global', keys: ['c'] },
   {
      id: 'search.issues',
      label: 'Search in the list',
      group: 'General',
      scope: 'global',
      keys: ['/'],
   },
   {
      id: 'sidebar.toggle',
      label: 'Toggle sidebar',
      group: 'General',
      scope: 'external',
      keys: ['mod+b'],
   },
   {
      id: 'agent.ask',
      label: 'Ask the Agent (in the command menu)',
      group: 'General',
      scope: 'external',
      keys: ['tab'],
   },

   // Navigation
   {
      id: 'nav.inbox',
      label: 'Go to Inbox',
      group: 'Navigation',
      scope: 'global',
      keys: ['g i'],
      path: '/inbox',
   },
   {
      id: 'nav.my-issues',
      label: 'Go to My issues',
      group: 'Navigation',
      scope: 'global',
      keys: ['g m'],
      path: '/my-issues',
   },
   {
      id: 'nav.projects',
      label: 'Go to Projects',
      group: 'Navigation',
      scope: 'global',
      keys: ['g p'],
      path: '/projects',
   },
   {
      id: 'nav.views',
      label: 'Go to Views',
      group: 'Navigation',
      scope: 'global',
      keys: ['g v'],
      path: '/views',
   },
   {
      id: 'nav.reviews',
      label: 'Go to Reviews',
      group: 'Navigation',
      scope: 'global',
      keys: ['g r'],
      path: '/reviews',
   },
   {
      id: 'nav.teams',
      label: 'Go to Teams',
      group: 'Navigation',
      scope: 'global',
      keys: ['g t'],
      path: '/teams',
   },
   {
      id: 'nav.settings',
      label: 'Go to Settings',
      group: 'Navigation',
      scope: 'global',
      keys: ['g s'],
      path: '/settings',
   },

   // Issue (issue em contexto)
   {
      id: 'issue.status',
      label: 'Change status',
      group: 'Issue',
      scope: 'issue',
      keys: ['s'],
      issueAction: 'status',
   },
   {
      id: 'issue.priority',
      label: 'Set priority',
      group: 'Issue',
      scope: 'issue',
      keys: ['p'],
      issueAction: 'priority',
   },
   {
      id: 'issue.assignee',
      label: 'Assign to…',
      group: 'Issue',
      scope: 'issue',
      keys: ['a'],
      issueAction: 'assignee',
   },
   { id: 'issue.assign-me', label: 'Assign to me', group: 'Issue', scope: 'issue', keys: ['i'] },
   {
      id: 'issue.labels',
      label: 'Change labels',
      group: 'Issue',
      scope: 'issue',
      keys: ['l'],
      issueAction: 'labels',
   },
   {
      id: 'issue.project',
      label: 'Move to project',
      group: 'Issue',
      scope: 'issue',
      keys: ['shift+p'],
      issueAction: 'project',
   },
   {
      id: 'issue.cycle',
      label: 'Move to cycle',
      group: 'Issue',
      scope: 'issue',
      keys: ['shift+c'],
      issueAction: 'cycle',
   },
   {
      id: 'issue.estimate',
      label: 'Set estimate',
      group: 'Issue',
      scope: 'issue',
      keys: ['shift+e'],
      issueAction: 'estimate',
   },
   {
      id: 'issue.due-date',
      label: 'Set due date',
      group: 'Issue',
      scope: 'issue',
      keys: ['shift+d'],
      issueAction: 'dueDate',
   },
   {
      id: 'issue.delete',
      label: 'Delete issue',
      group: 'Issue',
      scope: 'external',
      keys: ['mod+backspace'],
   },

   // Copy (issue em contexto)
   { id: 'copy.id', label: 'Copy issue ID', group: 'Copy', scope: 'issue', keys: ['mod+period'] },
   {
      id: 'copy.url',
      label: 'Copy issue URL',
      group: 'Copy',
      scope: 'issue',
      keys: ['mod+shift+comma'],
   },
   {
      id: 'copy.branch',
      label: 'Copy git branch name',
      group: 'Copy',
      scope: 'issue',
      keys: ['mod+shift+period'],
   },

   // Lists (tratados pelas listas e pelo detalhe)
   { id: 'list.next', label: 'Next item', group: 'Lists', scope: 'external', keys: ['j', 'down'] },
   {
      id: 'list.prev',
      label: 'Previous item',
      group: 'Lists',
      scope: 'external',
      keys: ['k', 'up'],
   },
   { id: 'list.open', label: 'Open item', group: 'Lists', scope: 'external', keys: ['enter'] },

   // Inbox
   {
      id: 'inbox.next',
      label: 'Next notification',
      group: 'Inbox',
      scope: 'inbox',
      keys: ['j', 'down'],
   },
   {
      id: 'inbox.prev',
      label: 'Previous notification',
      group: 'Inbox',
      scope: 'inbox',
      keys: ['k', 'up'],
   },
   {
      id: 'inbox.toggle-read',
      label: 'Mark as read / unread',
      group: 'Inbox',
      scope: 'inbox',
      keys: ['u'],
   },
   {
      id: 'inbox.snooze',
      label: 'Snooze notification',
      group: 'Inbox',
      scope: 'inbox',
      keys: ['h'],
   },
   {
      id: 'inbox.delete',
      label: 'Delete notification',
      group: 'Inbox',
      scope: 'inbox',
      keys: ['backspace', 'delete'],
   },
];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
   'General',
   'Navigation',
   'Issue',
   'Copy',
   'Lists',
   'Inbox',
];

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcut(id: string): Shortcut | undefined {
   return BY_ID.get(id);
}

/* ------------------------------ parse/format ------------------------------ */

interface Combo {
   key: string;
   mod: boolean;
   shift: boolean;
   alt: boolean;
}

function parseCombo(step: string): Combo {
   const parts = step.split('+');
   const key = parts[parts.length - 1];
   return {
      key,
      mod: parts.includes('mod'),
      shift: parts.includes('shift'),
      alt: parts.includes('alt'),
   };
}

const parseSequence = (alternative: string) => alternative.split(' ').map(parseCombo);

/** Nome da tecla → `code` físico (pontuação) ou `key` (o resto). */
const CODE_OF: Record<string, string> = {
   comma: 'Comma',
   period: 'Period',
   slash: 'Slash',
};
const KEY_OF: Record<string, string> = {
   backspace: 'Backspace',
   delete: 'Delete',
   enter: 'Enter',
   tab: 'Tab',
   escape: 'Escape',
   up: 'ArrowUp',
   down: 'ArrowDown',
};
const LABEL_OF: Record<string, string> = {
   comma: ',',
   period: '.',
   slash: '/',
   backspace: '⌫',
   delete: 'Del',
   enter: '↵',
   tab: 'Tab',
   escape: 'Esc',
   up: '↑',
   down: '↓',
};

export function isMacPlatform(): boolean {
   if (typeof navigator === 'undefined') return true;
   return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
}

function comboTokens(combo: Combo, mac: boolean): string[] {
   const out: string[] = [];
   if (combo.mod) out.push(mac ? '⌘' : 'Ctrl');
   if (combo.alt) out.push(mac ? '⌥' : 'Alt');
   if (combo.shift) out.push('⇧');
   out.push(LABEL_OF[combo.key] ?? combo.key.toUpperCase());
   return out;
}

/** Passos da 1ª alternativa, cada um com os seus tokens (`[['G'], ['I']]`). */
export function shortcutSequence(id: string, mac = isMacPlatform()): string[][] {
   const s = BY_ID.get(id);
   if (!s) return [];
   return parseSequence(s.keys[0]).map((c) => comboTokens(c, mac));
}

/** Tokens da 1ª alternativa, achatados (dicas do ⌘K). */
export function shortcutTokens(id: string, mac = isMacPlatform()): string[] {
   return shortcutSequence(id, mac).flat();
}

/** Todas as alternativas, para o painel `?` (`[[['J']], [['↓']]]`). */
export function shortcutAlternatives(id: string, mac = isMacPlatform()): string[][][] {
   const s = BY_ID.get(id);
   if (!s) return [];
   return s.keys.map((alt) => parseSequence(alt).map((c) => comboTokens(c, mac)));
}

/* -------------------------------- matching -------------------------------- */

function matchesCombo(combo: Combo, e: KeyboardEvent): boolean {
   const mod = e.metaKey || e.ctrlKey;
   if (combo.mod !== mod || combo.alt !== e.altKey) return false;
   // Símbolo literal (`?`, `/`): o Shift depende do layout, então só o `key` decide.
   if (combo.key.length === 1 && !/[a-z0-9]/.test(combo.key)) return e.key === combo.key;
   if (combo.shift !== e.shiftKey) return false;
   if (CODE_OF[combo.key]) return e.code === CODE_OF[combo.key] || e.key === LABEL_OF[combo.key];
   if (KEY_OF[combo.key]) return e.key === KEY_OF[combo.key];
   return e.key.toLowerCase() === combo.key;
}

/** O evento casa com alguma alternativa de UM passo do atalho `id`. */
export function matchesShortcut(id: string, e: KeyboardEvent): boolean {
   const s = BY_ID.get(id);
   if (!s) return false;
   return s.keys.some((alt) => {
      const seq = parseSequence(alt);
      return seq.length === 1 && matchesCombo(seq[0], e);
   });
}

/** Primeiro atalho de um passo, do escopo dado, que casa com o evento. */
export function findShortcut(scope: ShortcutScope, e: KeyboardEvent): Shortcut | undefined {
   return SHORTCUTS.find((s) => s.scope === scope && matchesShortcut(s.id, e));
}

const SEQUENCE_TIMEOUT_MS = 1200;

/**
 * Sequências de dois passos (`g i`) dos atalhos `global`. `feed` devolve
 * `{ pending: true }` ao iniciar uma sequência, `{ id }` ao completá-la e `{}` quando o
 * evento não faz parte de sequência (o chamador trata como tecla única).
 */
export function createSequenceTracker() {
   const sequences = SHORTCUTS.filter((s) => s.scope === 'global').flatMap((s) =>
      s.keys
         .map((alt) => ({ id: s.id, steps: parseSequence(alt) }))
         .filter((x) => x.steps.length === 2)
   );
   let pending: { first: Combo; at: number } | null = null;
   return {
      feed(e: KeyboardEvent): { pending?: true; id?: string } {
         if (pending && Date.now() - pending.at < SEQUENCE_TIMEOUT_MS) {
            const first = pending.first;
            pending = null;
            const hit = sequences.find(
               (s) =>
                  s.steps[0].key === first.key &&
                  s.steps[0].shift === first.shift &&
                  matchesCombo(s.steps[1], e)
            );
            if (hit) return { id: hit.id };
         }
         pending = null;
         const starter = sequences.find((s) => matchesCombo(s.steps[0], e));
         if (starter) {
            pending = { first: starter.steps[0], at: Date.now() };
            return { pending: true };
         }
         return {};
      },
      reset() {
         pending = null;
      },
   };
}

/* --------------------------------- context -------------------------------- */

/** Telas com a busca de issues do header (onde `/` faz sentido — co#15). */
const ISSUE_SEARCH_ROUTE =
   /^\/[^/]+\/(?:team\/[^/]+\/(?:all|active|backlog|cycle\/(?:active|upcoming))|my-issues|profiles\/[^/]+)(?:\/|$)/;

export function supportsIssueSearch(pathname: string): boolean {
   return ISSUE_SEARCH_ROUTE.test(pathname);
}

/**
 * Contrato com o painel de propriedades da issue (frente I): o evento de janela
 * `circle:issue-shortcut` com `{ action }` pede para abrir o seletor da propriedade.
 * É CANCELÁVEL: quem abre o seletor chama `event.preventDefault()`. Sem ninguém tratando
 * (painel recolhido, tela sem painel), o listener abre o ⌘K na sub-página equivalente.
 */
export const ISSUE_SHORTCUT_EVENT = 'circle:issue-shortcut';

export interface IssueShortcutDetail {
   action: IssueShortcutAction;
}

/** Dispara o evento; devolve true se algum ouvinte tratou (preventDefault). */
export function dispatchIssueShortcut(action: IssueShortcutAction): boolean {
   const event = new CustomEvent<IssueShortcutDetail>(ISSUE_SHORTCUT_EVENT, {
      detail: { action },
      cancelable: true,
   });
   window.dispatchEvent(event);
   return event.defaultPrevented;
}

/** Abre o ⌘K (opcionalmente numa sub-página, ex. `status`). */
export const OPEN_COMMAND_EVENT = 'circle:open-command';
/** Abre o painel de atalhos (`?`, "Help & shortcuts"). */
export const OPEN_SHORTCUTS_EVENT = 'circle:open-shortcuts';

export function openCommandMenu(page?: string) {
   window.dispatchEvent(
      new CustomEvent(OPEN_COMMAND_EVENT, { detail: page ? { page } : undefined })
   );
}

export function openShortcutsHelp() {
   window.dispatchEvent(new CustomEvent(OPEN_SHORTCUTS_EVENT));
}
