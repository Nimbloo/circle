import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) =>
   readFileSync(join(process.cwd(), relativePath), 'utf8');

describe('workspace layout contract', () => {
   it('compõe Projects sem uma toolbar duplicada', () => {
      const projects = readSource('components/common/projects/projects.tsx');
      const header = readSource('components/layout/headers/projects/header.tsx');

      expect(projects).not.toContain('Tabs + view controls');
      expect(header).toContain('<ProjectsViewControls />');
   });

   it('mantém a geometria da tabela de Projects igual ao Linear', () => {
      const list = readSource('components/common/projects/projects-list.tsx');
      const line = readSource('components/common/projects/project-line.tsx');
      const displayOptions = readSource('components/common/projects/projects-display-options.tsx');
      const board = readSource('components/common/projects/projects-board.tsx');
      const displayStore = readSource('store/projects-display-store.ts');

      expect(list).toContain('h-8');
      expect(list).toContain('w-[38px]');
      expect(line).toContain('h-12');
      expect(line).toContain('text-[13px]');
      expect(line).toContain('showTeam');
      expect(displayOptions).toContain('h-[406px]');
      expect(displayOptions).toContain('w-[332px]');
      expect(displayOptions).not.toContain('w-[420px]');
      expect(board).toContain('w-[354px]');
      expect(board).toContain('pl-[13px]');
      expect(board).toContain('pt-[9px]');
      expect(board).toContain('min-h-[94px]');
      expect(board).toContain('shadow-[var(--card-shadow)]');
      expect(displayStore).toContain("grouping: 'none' as ProjectsGrouping");
   });

   it('mantém a escala e a lista lateral da timeline iguais ao Linear', () => {
      const timeline = readSource('components/common/projects/projects-timeline.tsx');

      expect(timeline).toContain('const LIST_WIDTH = 312');
      expect(timeline).toContain("{ id: 'year', label: 'Year', shortcut: 'Y', monthWidth: 76 }");
      expect(timeline).toContain('className="relative h-4"');
      expect(timeline).toContain('className="relative h-[72px] flex items-center"');
      expect(timeline).toContain("group.id !== 'all'");
      expect(timeline).toContain('month.days * dayWidthOf(monthWidth)');
      expect(timeline).toContain('text-[13px] leading-4 font-medium');
   });

   it('compõe Iniciativas no mesmo chrome e grid do Linear', () => {
      const initiatives = readSource('components/common/initiatives/initiatives.tsx');
      const header = readSource('components/layout/headers/initiatives/header.tsx');
      const controls = readSource(
         'components/layout/headers/initiatives/initiatives-view-controls.tsx'
      );

      expect(header).toContain('<ViewBar>');
      expect(header).toContain('<InitiativesViewControls />');
      expect(initiatives).not.toContain('sticky top-0 bg-background');
      expect(initiatives).toContain('h-8 pl-[52px] pr-[34px]');
      expect(initiatives).toContain('h-[52px] pl-[52px] pr-[34px]');
      expect(initiatives).toContain('w-[56px]');
      expect(initiatives).toContain('w-[50px]');
      expect(initiatives).toContain('w-[100px]');
      expect(initiatives).toContain('w-[59px]');
      expect(initiatives).toContain('w-[108px]');
      expect(initiatives).toContain('w-[98px]');
      expect(initiatives).toContain('w-[302px]');
      expect(initiatives).toContain('rounded-xl');
      expect(initiatives).toContain('sideOffset={4}');
      expect(initiatives).toContain('h-8 w-full');
      expect(initiatives).toContain('h-6 rounded-full');
      expect(header).toContain('h-7 px-2.5 text-xs');
      expect(controls).toContain("togglePanel('initiatives-breakdown')");
   });

   it('mantém Teams em largura total e com a grade do Linear', () => {
      const header = readSource('components/layout/headers/teams/header.tsx');
      const teams = readSource('components/common/teams/teams.tsx');
      const line = readSource('components/common/teams/team-line.tsx');
      const filter = readSource('components/layout/headers/teams/filter.tsx');
      const display = readSource('components/common/teams/teams-display-options.tsx');

      expect(header).toContain('return <HeaderNav />');
      expect(teams).toContain('<ViewBar');
      expect(teams).toContain('h-8 pl-[18px] pr-[34px]');
      expect(teams).toContain('w-[96px]');
      expect(teams).toContain('w-[126px]');
      expect(teams).toContain('w-[88px]');
      expect(teams).toContain('w-[154px]');
      expect(line).toContain('h-12 pl-[18px] pr-[34px]');
      expect(line).toContain('size-[18px]');
      expect(line).toContain('text-[13px]');
      expect(filter).toContain('aria-label="Filter teams"');
      expect(filter).toContain('className="relative size-7 p-0"');
      expect(display).toContain('w-[302px]');
      expect(display).toContain('sideOffset={4}');
      expect(display).toContain('h-6 rounded-full');
      expect(display).not.toContain('ArrowUpNarrowWide');
   });

   it('compõe Views com tabs no ViewBar e estado vazio fiel ao Linear', () => {
      const header = readSource('components/layout/headers/views/header.tsx');
      const views = readSource('components/common/views/views.tsx');
      const create = readSource('components/common/views/create-view-dialog.tsx');

      expect(header).not.toContain('SidebarTrigger');
      expect(header).toContain('<CreateViewButton label="New view" />');
      expect(views).toContain('<ViewBar');
      expect(views).toContain("label: 'Issues'");
      expect(views).toContain("label: 'Projects'");
      expect(views).toContain('w-[302px]');
      expect(views).toContain('h-8 pl-[18px] pr-[34px]');
      expect(views).toContain('w-[340px]');
      expect(views).toContain('Create custom views using filters');
      expect(views).toContain('label="Create new view"');
      expect(create).toContain('label?: string');
   });

   it('mantém Reviews denso sem alterar o split view existente', () => {
      const reviews = readSource('components/common/reviews/reviews.tsx');

      expect(reviews).not.toContain('SidebarTrigger');
      expect(reviews).toContain('h-11 px-[18px]');
      expect(reviews).toContain('h-[43px]');
      expect(reviews).toContain('h-7 rounded-full');
      expect(reviews).toContain('h-8 w-full');
      expect(reviews).toContain('h-11 px-[18px] text-[13px]');
      expect(reviews).toContain('Review diffs in Circle');
      expect(reviews).toContain('Sync from GitHub');
   });

   it('alinha Members ao grid do Linear sem perder o fluxo de convites', () => {
      const header = readSource('components/layout/headers/members/header.tsx');
      const nav = readSource('components/layout/headers/members/header-nav.tsx');
      const members = readSource('components/common/members/members.tsx');
      const line = readSource('components/common/members/member-line.tsx');
      const invite = readSource('components/common/members/invite-panel.tsx');

      expect(header).not.toContain('HeaderOptions');
      expect(nav).not.toContain('SidebarTrigger');
      expect(nav).toContain('<InvitePanel />');
      expect(nav).toContain('<Filter />');
      expect(members).not.toContain('<InvitePanel />');
      expect(members).toContain('h-8 pl-5 pr-6');
      expect(members).toContain('w-[220px]');
      expect(members).toContain('w-[87px]');
      expect(members).toContain('w-[82px]');
      expect(members).toContain('w-[93px]');
      expect(line).toContain('h-[50px] pl-5 pr-6');
      expect(line).toContain('size-7');
      expect(invite).toContain('Invite members');
      expect(invite).toContain('pending.map');
   });

   it('alinha as superfícies internas do time ao Linear', () => {
      const nav = readSource('components/layout/headers/team/header-nav.tsx');
      const tabs = readSource('components/layout/headers/team/header-tabs.tsx');
      const overview = readSource('components/common/teams/team-overview.tsx');
      const members = readSource('components/common/teams/team-members.tsx');
      const picker = readSource('components/common/teams/add-team-member-button.tsx');

      expect(nav).not.toContain('SidebarTrigger');
      expect(nav).toContain('className="pl-2.5"');
      expect(tabs).toContain('gap-2');
      expect(tabs).toContain('translate-y-[0.5px]');
      expect(tabs).toContain('<AddTeamMemberButton />');
      expect(overview).toContain('-translate-x-[9px]');
      expect(overview).toContain('lg:w-[212px]');
      expect(overview).toContain('size-9');
      expect(overview).toContain('text-2xl');
      expect(members).toContain('h-8 pl-[18px] pr-[34px]');
      expect(members).toContain('h-[50px] pl-[18px] pr-[34px]');
      expect(members).toContain('w-[220px]');
      expect(members).toContain('w-[174px]');
      expect(picker).toContain('aria-label="Add a member"');
      expect(picker).toContain('api.teams.addMember');
   });

   it('mantém views do time e detalhes de view no mesmo chrome do Linear', () => {
      const teamViewsHeader = readSource('components/layout/headers/team-views/header.tsx');
      const viewHeader = readSource('components/layout/headers/view/header.tsx');
      const sharedReview = readSource('components/common/reviews/review-shared.tsx');

      expect(teamViewsHeader).not.toContain('SidebarTrigger');
      expect(teamViewsHeader).toContain('<CreateViewButton label="New view" />');
      expect(teamViewsHeader).toContain('<HeaderTitle>Views</HeaderTitle>');
      expect(viewHeader).not.toContain('SidebarTrigger');
      expect(viewHeader).toContain('view.teamId');
      expect(viewHeader).toContain('href={`/${orgId}/views`}');
      expect(viewHeader).toContain('<ViewBar className="pl-[18px] pr-2.5">');
      expect(sharedReview).not.toMatch(/#[0-9a-f]{3,8}/i);
   });
});
