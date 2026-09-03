import { describe, expect, it } from 'vitest';
import { SettingsSchema } from '@/lib/api/settings';

const layout = {
   displayByView: {
      'team/ENG/all': {
         grouping: 'assignee',
         ordering: 'created',
         orderCompletedByRecency: true,
         completedIssues: 'none',
         showEmptyGroups: true,
         displayProperties: { id: true, cycle: true, estimate: false },
      },
      'my-issues': { grouping: 'none' },
   },
   viewTypeByView: { 'team/ENG/all': 'grid', 'project/p1/issues': 'list' },
   sidebarTeams: { openById: { t1: true, t2: false } },
   sidebarPrefs: {
      badgeStyle: 'dot',
      visibility: { inbox: 'always', reviews: 'badged', members: 'never' },
      order: { personal: ['inbox', 'my-issues', 'reviews'], workspace: ['projects', 'teams'] },
   },
   detailPanels: { openByKind: { initiative: true, project: false, issue: true, member: true } },
   inboxListWidth: 360,
};

describe('SettingsSchema.layout', () => {
   it('aceita o blob completo de layout junto com as fatias existentes', () => {
      const blob = {
         theme: { mode: 'dark' },
         notifications: { marketing: false },
         preferences: { fontSize: 'Large' },
         layout,
      };
      expect(SettingsSchema.parse(blob)).toEqual(blob);
   });

   it('aceita layout parcial (só o que o cliente mandou)', () => {
      expect(() => SettingsSchema.parse({ layout: { inboxListWidth: 300 } })).not.toThrow();
      expect(() => SettingsSchema.parse({ layout: {} })).not.toThrow();
   });

   it('rejeita chave desconhecida em layout e dentro de uma view', () => {
      expect(() => SettingsSchema.parse({ layout: { injected: true } })).toThrow();
      expect(() =>
         SettingsSchema.parse({ layout: { displayByView: { 'my-issues': { evil: 1 } } } })
      ).toThrow();
      expect(() =>
         SettingsSchema.parse({ layout: { sidebarTeams: { openById: {}, extra: 1 } } })
      ).toThrow();
   });

   it('rejeita viewType, grouping e badgeStyle fora do domínio', () => {
      expect(() =>
         SettingsSchema.parse({ layout: { viewTypeByView: { 'my-issues': 'board' } } })
      ).toThrow();
      expect(() =>
         SettingsSchema.parse({ layout: { displayByView: { 'my-issues': { grouping: 'team' } } } })
      ).toThrow();
      expect(() =>
         SettingsSchema.parse({ layout: { sidebarPrefs: { badgeStyle: 'pill' } } })
      ).toThrow();
      expect(() => SettingsSchema.parse({ layout: { inboxListWidth: -1 } })).toThrow();
   });
});
