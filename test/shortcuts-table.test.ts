// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
   dispatchIssueShortcut,
   ISSUE_SHORTCUT_EVENT,
   matchesShortcut,
   SHORTCUTS,
   shortcutSequence,
   shortcutTokens,
   supportsIssueSearch,
   createSequenceTracker,
} from '@/lib/shortcuts';

/**
 * co#5/#6 — uma tabela só de atalhos: o listener, as dicas do ⌘K e o painel `?` leem
 * dela, então o que a paleta anuncia é o que a tecla faz.
 */
const key = (k: string, over: Partial<KeyboardEventInit> = {}) =>
   new KeyboardEvent('keydown', { key: k, ...over });

describe('tabela de atalhos', () => {
   it('ids únicos e todo atalho com rótulo e grupo', () => {
      const ids = SHORTCUTS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const s of SHORTCUTS) {
         expect(s.label).toBeTruthy();
         expect(s.group).toBeTruthy();
         expect(s.keys.length).toBeGreaterThan(0);
      }
   });

   it('teclas da issue no padrão do Linear', () => {
      expect(shortcutTokens('issue.status')).toEqual(['S']);
      expect(shortcutTokens('issue.priority')).toEqual(['P']);
      expect(shortcutTokens('issue.assignee')).toEqual(['A']);
      expect(shortcutTokens('issue.assign-me')).toEqual(['I']);
      expect(shortcutTokens('issue.labels')).toEqual(['L']);
      expect(shortcutTokens('issue.project')).toEqual(['⇧', 'P']);
      expect(shortcutTokens('issue.cycle')).toEqual(['⇧', 'C']);
      expect(shortcutTokens('issue.due-date')).toEqual(['⇧', 'D']);
   });

   it('navegação em sequência G + tecla', () => {
      expect(shortcutTokens('nav.inbox')).toEqual(['G', 'I']);
      expect(shortcutTokens('nav.my-issues')).toEqual(['G', 'M']);
      expect(shortcutSequence('nav.settings')).toEqual([['G'], ['S']]);
   });

   it('modificador vira ⌘ no Mac e Ctrl fora dele', () => {
      expect(shortcutTokens('copy.id', true)).toEqual(['⌘', '.']);
      expect(shortcutTokens('copy.id', false)).toEqual(['Ctrl', '.']);
   });
});

describe('casamento de teclas', () => {
   it('letra simples sem modificador', () => {
      expect(matchesShortcut('issue.status', key('s'))).toBe(true);
      expect(matchesShortcut('issue.status', key('s', { metaKey: true }))).toBe(false);
      expect(matchesShortcut('issue.status', key('S', { shiftKey: true }))).toBe(false);
   });

   it('shift + letra', () => {
      expect(matchesShortcut('issue.project', key('P', { shiftKey: true }))).toBe(true);
      expect(matchesShortcut('issue.project', key('p'))).toBe(false);
   });

   it('pontuação pelo code (layout com shift muda o key)', () => {
      expect(
         matchesShortcut('copy.url', key('<', { code: 'Comma', ctrlKey: true, shiftKey: true }))
      ).toBe(true);
      expect(matchesShortcut('copy.id', key('.', { code: 'Period', metaKey: true }))).toBe(true);
   });

   it('`?` casa com shift (é assim que se digita)', () => {
      expect(matchesShortcut('help.shortcuts', key('?', { shiftKey: true }))).toBe(true);
   });

   it('sequência G + I expira', () => {
      vi.useFakeTimers();
      const tracker = createSequenceTracker();
      expect(tracker.feed(key('g'))).toEqual({ pending: true });
      expect(tracker.feed(key('i'))).toEqual({ id: 'nav.inbox' });
      tracker.feed(key('g'));
      vi.advanceTimersByTime(1500);
      expect(tracker.feed(key('i'))).toEqual({});
      vi.useRealTimers();
   });
});

describe('contexto', () => {
   it('`/` só onde há busca de issues', () => {
      expect(supportsIssueSearch('/nimbloo/team/ENG/all')).toBe(true);
      expect(supportsIssueSearch('/nimbloo/team/ENG/cycle/active')).toBe(true);
      expect(supportsIssueSearch('/nimbloo/my-issues/assigned')).toBe(true);
      expect(supportsIssueSearch('/nimbloo/profiles/u1')).toBe(true);
      expect(supportsIssueSearch('/nimbloo/inbox')).toBe(false);
      expect(supportsIssueSearch('/nimbloo/settings')).toBe(false);
   });

   it('evento da issue é cancelável: quem trata chama preventDefault', () => {
      expect(dispatchIssueShortcut('status')).toBe(false);
      const onShortcut = (e: Event) => {
         expect((e as CustomEvent).detail).toEqual({ action: 'status' });
         e.preventDefault();
      };
      window.addEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
      expect(dispatchIssueShortcut('status')).toBe(true);
      window.removeEventListener(ISSUE_SHORTCUT_EVENT, onShortcut);
   });
});
