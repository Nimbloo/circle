import { describe, expect, it } from 'vitest';
import { buildTeamTree, teamBreadcrumb, teamWithDescendants } from '@/lib/team-tree';
import type { Team } from '@/data/teams';

function team(id: string, parentId: string | null = null, name = id): Team {
   return {
      id,
      name,
      icon: '📁',
      joined: true,
      color: '#000',
      estimateScale: 'fibonacci',
      cycleCooldownDays: 0,
      autoCloseParent: false,
      autoCloseChildren: false,
      parentId,
      members: [],
      projects: [],
   };
}

// CORE › WEB › MOBILE, mais DESIGN solto.
const CORE = team('CORE', null, 'Core');
const WEB = team('WEB', 'CORE', 'Web');
const MOBILE = team('MOBILE', 'WEB', 'Mobile');
const DESIGN = team('DESIGN', null, 'Design');
const ALL = [MOBILE, DESIGN, WEB, CORE];

describe('team-tree (#100)', () => {
   it('aninha os sub-times sob o pai e ordena por nome', () => {
      const tree = buildTeamTree(ALL);
      expect(tree.map((n) => n.team.id)).toEqual(['CORE', 'DESIGN']);
      expect(tree[0].children.map((n) => n.team.id)).toEqual(['WEB']);
      expect(tree[0].children[0].children.map((n) => n.team.id)).toEqual(['MOBILE']);
      expect(tree[1].children).toEqual([]);
   });

   it('sub-time cujo pai não está no subconjunto sobe pro ancestral presente', () => {
      // Usuário só participa de CORE e MOBILE — WEB (o pai direto) fica de fora.
      const tree = buildTeamTree([CORE, MOBILE], ALL);
      expect(tree.map((n) => n.team.id)).toEqual(['CORE']);
      expect(tree[0].children.map((n) => n.team.id)).toEqual(['MOBILE']);
   });

   it('sem nenhum ancestral presente, o sub-time vira raiz', () => {
      expect(buildTeamTree([MOBILE], ALL).map((n) => n.team.id)).toEqual(['MOBILE']);
   });

   it('breadcrumb vai da raiz até o time', () => {
      expect(teamBreadcrumb(ALL, 'MOBILE').map((t) => t.name)).toEqual(['Core', 'Web', 'Mobile']);
      expect(teamBreadcrumb(ALL, 'CORE').map((t) => t.name)).toEqual(['Core']);
   });

   it('teamWithDescendants cobre a subárvore inteira', () => {
      expect(teamWithDescendants(ALL, 'CORE').sort()).toEqual(['CORE', 'MOBILE', 'WEB']);
      expect(teamWithDescendants(ALL, 'MOBILE')).toEqual(['MOBILE']);
   });

   it('não trava com ciclo em dado legado', () => {
      const a = team('A', 'B');
      const b = team('B', 'A');
      expect(() => buildTeamTree([a, b])).not.toThrow();
      expect(teamBreadcrumb([a, b], 'A').length).toBeLessThanOrEqual(2);
   });
});
