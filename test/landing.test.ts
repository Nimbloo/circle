import { beforeEach, describe, expect, it } from 'vitest';
import { landingPath } from '@/lib/home-view';
import { landingHref } from '@/lib/landing';
import { usePreferencesStore } from '@/store/preferences-store';
import { useWorkspaceStore } from '@/store/workspace-store';

const team = (id: string, name: string, joined = false) => ({ id, name, joined });

describe('landingPath (regra única servidor/cliente)', () => {
   it('preferência fixa ganha dos times', () => {
      expect(
         landingPath({ homeView: 'Inbox', role: 'Member', teams: [team('A', 'A', true)] })
      ).toBe('inbox');
   });

   it('1º time do qual é membro, por nome', () => {
      const teams = [team('Z', 'Zeta', true), team('B', 'Beta'), team('A', 'Alfa', true)];
      expect(landingPath({ homeView: 'Team issues', role: 'Member', teams })).toBe('team/A/all');
   });

   it('sem time próprio: convidado vai para My issues; membro vai para o 1º time', () => {
      const teams = [team('Z', 'Zeta'), team('B', 'Beta')];
      expect(landingPath({ homeView: undefined, role: 'Guest', teams })).toBe('my-issues');
      expect(landingPath({ homeView: undefined, role: 'Member', teams })).toBe('team/B/all');
   });

   it('sem time nenhum: criar time', () => {
      expect(landingPath({ homeView: undefined, role: 'Admin', teams: [] })).toBe(
         'settings/teams/new'
      );
   });
});

describe('landingHref (Back to app, sair/excluir time)', () => {
   beforeEach(() => {
      usePreferencesStore.setState({ defaultHomeView: 'Team issues' });
   });

   it('navega direto para o time, sem passar pelo redirect de /[orgId]', () => {
      useWorkspaceStore.setState({
         me: { role: 'Member', teamIds: ['ENG'] } as never,
         teams: [
            { id: 'QA', name: 'Qualidade' },
            { id: 'ENG', name: 'Engenharia' },
         ] as never,
      });
      expect(landingHref('nimbloo')).toBe('/nimbloo/team/ENG/all');
   });

   it('lê o store na hora: o time recém-excluído não é o destino', () => {
      useWorkspaceStore.setState({
         me: { role: 'Member', teamIds: [] } as never,
         teams: [{ id: 'QA', name: 'Qualidade' }] as never,
      });
      expect(landingHref('nimbloo')).toBe('/nimbloo/team/QA/all');
   });

   it('sem time nenhum sai de settings (My issues), em vez de voltar para "criar time"', () => {
      useWorkspaceStore.setState({ me: { role: 'Admin', teamIds: [] } as never, teams: [] });
      expect(landingHref('nimbloo')).toBe('/nimbloo/my-issues');
   });

   it('workspace não hidratado: fica com o redirect do servidor', () => {
      useWorkspaceStore.setState({ me: null, teams: [] });
      expect(landingHref('nimbloo')).toBe('/nimbloo');
   });
});
