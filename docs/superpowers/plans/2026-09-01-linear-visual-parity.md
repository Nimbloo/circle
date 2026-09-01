# Linear 2026 Visual Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Atualizar todas as superfícies autenticadas do Circle para a linguagem visual do Linear 2026 sem alterar contratos de API, schema ou regras de negócio.

**Architecture:** Evoluir os tokens e componentes existentes, criar apenas primitivas pequenas para location bar e view bar e migrar as telas por famílias. Cada lote mantém o app funcional e termina com validação automática e comparação no mesmo viewport do Linear autenticado.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, Radix/shadcn, Lucide, Zustand, Vitest, PostgreSQL/Drizzle.

**Spec:** `docs/superpowers/specs/2026-09-01-linear-visual-parity-design.md`

## Global Constraints

- Contexto e documentação em pt-BR; código e identificadores em inglês.
- Nenhuma alteração de DTO, endpoint, autenticação, schema ou regra de negócio.
- Nenhuma cor literal nova em `components/`; cores de layout vêm de `app/globals.css`.
- Sidebar desktop: `244px`; inset do main: `8px`; radius do main: `12px`.
- Location bar: `44px`; view bar: `43px`; controles/tabs: `28px`.
- Issue row: `44px`; group row: `36px`; Inbox row: `55px`.
- Settings content: `640px`; Settings cards: `10px` de radius.
- Mudança comportamental ou bugfix segue RED → GREEN → REFACTOR.
- Mudança puramente visual segue o contrato geométrico e comparação por browser; não criar teste que apenas congele uma lista de classes.
- Não rastrear `CIRCLE_DEV_AUTH_EMAIL`; antes de cada commit executar `git grep -n CIRCLE_DEV_AUTH_EMAIL HEAD -- lib/api/auth.ts middleware.ts` e exigir saída vazia.
- Commits Conventional Commits em pt-BR, sem referência a assistente.

---

### Task 1: Tornar os comandos locais de banco reproduzíveis

**Files:**

- Create: `db/load-local-env.ts`
- Create: `test/local-database-env.test.ts`
- Modify: `drizzle.config.ts`
- Modify: `db/seed.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `README.md`

**Interfaces:**

- Produces: `loadLocalDatabaseEnv(options?: { cwd?: string; environment?: NodeJS.ProcessEnv }): void`
- Consumes: `.env.local` apenas quando `DATABASE_URL` ainda não está definido.

- [ ] **Step 1: escrever os testes RED para precedência e leitura de `.env.local`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLocalDatabaseEnv } from '../db/load-local-env';

describe('loadLocalDatabaseEnv', () => {
   const dirs: string[] = [];

   afterEach(async () => {
      await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
   });

   it('carrega DATABASE_URL do .env.local quando o processo não recebeu a variável', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'circle-env-'));
      dirs.push(cwd);
      await writeFile(join(cwd, '.env.local'), 'DATABASE_URL=postgres://local/circle\n');
      const environment: NodeJS.ProcessEnv = {};

      loadLocalDatabaseEnv({ cwd, environment });

      expect(environment.DATABASE_URL).toBe('postgres://local/circle');
   });

   it('preserva DATABASE_URL injetada pelo ambiente', async () => {
      const cwd = await mkdtemp(join(tmpdir(), 'circle-env-'));
      dirs.push(cwd);
      await writeFile(join(cwd, '.env.local'), 'DATABASE_URL=postgres://local/circle\n');
      const environment = { DATABASE_URL: 'postgres://runtime/circle' };

      loadLocalDatabaseEnv({ cwd, environment });

      expect(environment.DATABASE_URL).toBe('postgres://runtime/circle');
   });
});
```

- [ ] **Step 2: rodar o teste e confirmar o RED correto**

Run: `pnpm exec vitest run test/local-database-env.test.ts`

Expected: FAIL porque `db/load-local-env.ts` ainda não existe.

- [ ] **Step 3: adicionar `dotenv` e implementar o loader mínimo**

Run: `pnpm add -D dotenv`

```ts
import { config } from 'dotenv';
import { resolve } from 'node:path';

interface LoadLocalDatabaseEnvOptions {
   cwd?: string;
   environment?: NodeJS.ProcessEnv;
}

export function loadLocalDatabaseEnv({
   cwd = process.cwd(),
   environment = process.env,
}: LoadLocalDatabaseEnvOptions = {}): void {
   if (environment.DATABASE_URL) return;

   config({
      path: resolve(cwd, '.env.local'),
      processEnv: environment,
      override: false,
      quiet: true,
   });
}
```

- [ ] **Step 4: carregar o ambiente antes de avaliar Drizzle e antes do import de `db` no seed**

```ts
// drizzle.config.ts
import { loadLocalDatabaseEnv } from './db/load-local-env';

loadLocalDatabaseEnv();
```

```ts
// db/seed.ts
import { loadLocalDatabaseEnv } from './load-local-env';

loadLocalDatabaseEnv();

async function main() {
   const { db } = await import('./index');
   // corpo existente
}
```

- [ ] **Step 5: verificar GREEN e os dois comandos documentados**

Run: `pnpm exec vitest run test/local-database-env.test.ts`

Expected: 2 tests PASS.

Run: `pnpm db:migrate`

Expected: migrations aplicadas usando a URL de `.env.local`, sem fallback para `localhost:5432`.

Run: `pnpm db:seed`

Expected: catálogos semeados sem erro de conexão.

- [ ] **Step 6: corrigir o README e commitar**

Documentar que os comandos carregam `.env.local` sem sobrescrever `DATABASE_URL` injetada.

```bash
git add db/load-local-env.ts test/local-database-env.test.ts drizzle.config.ts db/seed.ts package.json pnpm-lock.yaml README.md
git commit -m "fix(dev): carrega ambiente local nos comandos de banco"
```

---

### Task 2: Estabelecer tokens e primitivas geométricas do Linear

**Files:**

- Create: `components/layout/header-primitives.tsx`
- Create: `test/layout-primitives.test.tsx`
- Modify: `app/globals.css`
- Modify: `app/[orgId]/layout.tsx`
- Modify: `components/layout/main-layout.tsx`
- Modify: pages returned by `rg -l "headersNumber" app -g '*.tsx'`

**Interfaces:**

- Produces: `LocationBar`, `ViewBar`, `HeaderGroup`, `HeaderTitle`, `HeaderActions`.
- Produces: `MainLayout({ children, header })` com área de conteúdo `flex-1 min-h-0`.
- Consumes: tokens Tailwind existentes (`background`, `container`, `muted`, `secondary`, `accent`, `border`).

- [ ] **Step 1: escrever o teste RED do contrato semântico e geométrico**

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MainLayout from '../components/layout/main-layout';
import { HeaderTitle, LocationBar, ViewBar } from '../components/layout/header-primitives';

describe('layout primitives', () => {
   it('renderiza location e view bars com slots distintos', () => {
      const html = renderToStaticMarkup(
         <>
            <LocationBar>
               <HeaderTitle>Issues</HeaderTitle>
            </LocationBar>
            <ViewBar>Views</ViewBar>
         </>
      );

      expect(html).toContain('data-slot="location-bar"');
      expect(html).toContain('data-slot="view-bar"');
      expect(html).toContain('h-11');
      expect(html).toContain('h-[43px]');
   });

   it('deixa o conteúdo do MainLayout ocupar o espaço restante sem calc de viewport', () => {
      const html = renderToStaticMarkup(<MainLayout header={<div>Header</div>}>Body</MainLayout>);

      expect(html).toContain('min-h-0');
      expect(html).toContain('flex-1');
      expect(html).not.toContain('calc(100svh');
   });
});
```

- [ ] **Step 2: rodar o teste e confirmar RED**

Run: `pnpm exec vitest run test/layout-primitives.test.tsx`

Expected: FAIL porque `header-primitives.tsx` não existe e o `MainLayout` ainda usa `calc()`.

- [ ] **Step 3: implementar as primitivas mínimas**

```tsx
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function LocationBar({ className, ...props }: ComponentProps<'header'>) {
   return (
      <header
         data-slot="location-bar"
         className={cn(
            'flex h-11 shrink-0 items-center justify-between border-b border-border/60 px-2',
            className
         )}
         {...props}
      />
   );
}

export function ViewBar({ className, ...props }: ComponentProps<'div'>) {
   return (
      <div
         data-slot="view-bar"
         className={cn(
            'flex h-[43px] shrink-0 items-center justify-between border-b border-border/40 px-2',
            className
         )}
         {...props}
      />
   );
}

export function HeaderGroup({ className, ...props }: ComponentProps<'div'>) {
   return <div className={cn('flex min-w-0 items-center gap-2', className)} {...props} />;
}

export function HeaderTitle({ children, className }: { children: ReactNode; className?: string }) {
   return <h2 className={cn('truncate text-[13px] font-medium', className)}>{children}</h2>;
}

export function HeaderActions({ className, ...props }: ComponentProps<'div'>) {
   return <div className={cn('flex shrink-0 items-center gap-1', className)} {...props} />;
}
```

- [ ] **Step 4: substituir o cálculo de altura por flex layout**

```tsx
export default function MainLayout({ children, header }: MainLayoutProps) {
   return (
      <main className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/60 bg-container">
         {header && <div className="shrink-0">{header}</div>}
         <div className="min-h-0 w-full flex-1 overflow-auto">{children}</div>
      </main>
   );
}
```

Remover `headersNumber` da interface e das páginas; o número de barras deixa de afetar o cálculo.

- [ ] **Step 5: calibrar tokens dark confirmados e preservar variantes**

```css
.dark {
   --background: lch(2.595 0.4 272);
   --container: lch(5.52 0.4 272);
   --card: lch(9.232 0.85 272);
   --secondary: lch(10.149 0.689 272);
   --muted: lch(9.232 0.85 272);
   --accent: lch(13.845 1.3 272);
   --border: lch(9.84 1.48 272);
}
```

Manter `--primary: #5e6ad2`; revisar light e variantes contra referências oficiais sem copiar o dark por aproximação.

- [ ] **Step 6: verificar GREEN, typecheck e shell no browser**

Run: `pnpm exec vitest run test/layout-primitives.test.tsx && pnpm typecheck`

Expected: testes e typecheck PASS.

Browser: comparar em `1718 × 1270`; exigir sidebar `244px`, main `x=244`, `y=8`, radius `12px`.

- [ ] **Step 7: commitar**

```bash
git add app/globals.css app/[orgId] components/layout/main-layout.tsx components/layout/header-primitives.tsx test/layout-primitives.test.tsx
git commit -m "style(shell): alinha fundação visual ao Linear 2026"
```

---

### Task 3: Refinar sidebar global e sidebar de Settings

**Files:**

- Modify: `components/ui/sidebar.tsx`
- Modify: `components/layout/sidebar/app-sidebar.tsx`
- Modify: `components/layout/sidebar/org-switcher.tsx`
- Modify: `components/layout/sidebar/nav-search.tsx`
- Modify: `components/layout/sidebar/nav-inbox.tsx`
- Modify: `components/layout/sidebar/nav-favorites.tsx`
- Modify: `components/layout/sidebar/nav-workspace.tsx`
- Modify: `components/layout/sidebar/nav-teams.tsx`
- Modify: `components/layout/sidebar/nav-footer.tsx`
- Modify: `components/layout/sidebar/back-to-app.tsx`
- Modify: `components/layout/sidebar/nav-settings.tsx`
- Modify: `components/layout/sidebar/nav-teams-settings.tsx`

**Interfaces:**

- Consumes: tokens da Task 2 e `SidebarMenuButton` existente.
- Produces: navegação desktop de `244px`, itens de `28px`, ícones de `14px`, radius `8px` e busca de Settings.

- [ ] **Step 1: registrar screenshot/medidas do Circle antes da mudança**

Capturar Inbox e Settings em `1718 × 1270`, dark. Registrar apenas medidas, sem dados do Linear.

- [ ] **Step 2: ajustar as variantes do menu**

```ts
const sidebarMenuButtonVariants = cva(
   'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-lg px-2 text-left text-[13px] font-medium outline-hidden transition-colors duration-150 [&>svg]:size-3.5',
   {
      variants: {
         size: {
            default: 'h-7',
            sm: 'h-7 text-xs',
            lg: 'h-10',
         },
      },
   }
);
```

Preservar atributos, atalhos, collapse mobile e handlers existentes.

- [ ] **Step 3: alinhar grupos e ordem visual sem alterar rotas**

Usar `gap-0.5`, grupos com `px-3 py-2`, labels de `12px`, ícones `size-3.5` e selected via `bg-sidebar-accent`. Na sidebar de Settings, renderizar `BackToApp`, busca e grupos sem botão contornado.

- [ ] **Step 4: validar teclado e responsividade**

Browser: testar `Ctrl/Cmd+B`, mobile `390 × 844`, active item, hover, foco e scroll independente da Settings sidebar.

- [ ] **Step 5: rodar regressão e commitar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add components/ui/sidebar.tsx components/layout/sidebar
git commit -m "style(sidebar): reproduz navegação compacta do Linear"
```

---

### Task 4: Migrar todos os headers para location bar e view bar

**Files:**

- Modify: `components/layout/headers/agent/header.tsx`
- Modify: `components/layout/headers/issues/header.tsx`
- Modify: `components/layout/headers/issues/header-nav.tsx`
- Modify: `components/layout/headers/issues/header-options.tsx`
- Modify: `components/layout/headers/cycle/header.tsx`
- Modify: `components/layout/headers/cycle/header-nav.tsx`
- Modify: `components/layout/headers/cycle/header-options.tsx`
- Modify: `components/layout/headers/cycles/header.tsx`
- Modify: `components/layout/headers/cycles/header-nav.tsx`
- Modify: `components/layout/headers/issue/header.tsx`
- Modify: `components/layout/headers/issue/header-nav.tsx`
- Modify: `components/layout/headers/initiative/header.tsx`
- Modify: `components/layout/headers/initiatives/header.tsx`
- Modify: `components/layout/headers/members/header.tsx`
- Modify: `components/layout/headers/members/header-nav.tsx`
- Modify: `components/layout/headers/members/header-options.tsx`
- Modify: `components/layout/headers/my-issues/header.tsx`
- Modify: `components/layout/headers/profile/header.tsx`
- Modify: `components/layout/headers/project/header.tsx`
- Modify: `components/layout/headers/projects/header.tsx`
- Modify: `components/layout/headers/projects/header-nav.tsx`
- Modify: `components/layout/headers/settings/header.tsx`
- Modify: `components/layout/headers/settings/header-nav.tsx`
- Modify: `components/layout/headers/team/header.tsx`
- Modify: `components/layout/headers/team/header-nav.tsx`
- Modify: `components/layout/headers/team/header-tabs.tsx`
- Modify: `components/layout/headers/team-projects/header.tsx`
- Modify: `components/layout/headers/team-views/header.tsx`
- Modify: `components/layout/headers/teams/header.tsx`
- Modify: `components/layout/headers/teams/header-nav.tsx`
- Modify: `components/layout/headers/view/header.tsx`
- Modify: `components/layout/headers/views/header.tsx`
- Modify: `components/layout/headers/display-options.tsx`

**Interfaces:**

- Consumes: `LocationBar`, `ViewBar`, `HeaderGroup`, `HeaderTitle`, `HeaderActions`.
- Preserves: search, notifications, filters, export, insights, display options, favorites e links.

- [ ] **Step 1: migrar primeiro o header de Issues como referência**

```tsx
<>
   <LocationBar>
      <HeaderGroup>{/* sidebar trigger + team breadcrumb + Issues */}</HeaderGroup>
      <HeaderActions>{/* notification */}</HeaderActions>
   </LocationBar>
   <ViewBar>
      <IssueViewTabs />
      <HeaderActions>{/* filter, export, insights, display */}</HeaderActions>
   </ViewBar>
</>
```

Tabs usam `h-7 rounded-full px-2.5 text-xs font-medium`; ativo usa `bg-accent`, inativo `text-muted-foreground`.

- [ ] **Step 2: comparar Issues no browser antes de replicar**

Exigir: primeira barra `44px`, segunda `43px`, controles `28px`, padding lateral inicial `8px`, sem terceira borda.

- [ ] **Step 3: migrar as demais famílias preservando ações**

Aplicar uma `LocationBar` quando a rota só tem contexto; adicionar `ViewBar` somente quando há tabs/filtros. Settings não recebe header global: o título fica no conteúdo da página.

- [ ] **Step 4: validar todas as rotas com snapshot DOM**

Confirmar um único `main`, no máximo um `location-bar`, no máximo um `view-bar` e `aria-label` em todo botão apenas com ícone.

- [ ] **Step 5: rodar regressão e commitar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add components/layout/headers
git commit -m "refactor(headers): unifica chrome das páginas"
```

---

### Task 5: Alinhar Issues list, board, filtros e display options

**Files:**

- Modify: `components/common/issues/virtual-issue-list.tsx`
- Modify: `components/common/issues/issue-line.tsx`
- Modify: `components/common/issues/grouped-issues-view.tsx`
- Modify: `components/common/issues/group-issues.tsx`
- Modify: `components/common/issues/issue-grid.tsx`
- Modify: `components/common/issues/issue-filter-trigger.tsx`
- Modify: `components/common/issues/issue-filter-bar.tsx`
- Modify: `components/layout/headers/display-options.tsx`
- Modify: `components/common/list-skeleton.tsx`

**Interfaces:**

- Preserves: agrupamento, ordenação, filtros, seleção em massa, drag-and-drop e virtualização.
- Produces: rows `44px`, group headers `36px`, cards e skeletons com a mesma geometria final.

- [ ] **Step 1: capturar RED visual do Circle e medir os elementos atuais**

Registrar altura de row/group, alinhamento do identifier, título, labels, assignee e data.

- [ ] **Step 2: ajustar a lista virtual e seus estimadores juntos**

```ts
const GROUP_HEADER_HEIGHT = 36;
const ISSUE_ROW_HEIGHT = 44;
```

Usar os mesmos valores no CSS (`h-9`, `h-11`) e no virtualizer. Group header: `mx-2 rounded-lg bg-muted`; row: `px-3`, hover `bg-accent/40`, divisores apenas dentro do grupo quando necessários.

- [ ] **Step 3: alinhar metadados e truncamento**

Identifier e data em `text-xs text-muted-foreground tabular-nums`; título em `text-[13px] font-medium`; badges `h-6 rounded-full`; ações aparecem por focus-within/hover sem deslocar o conteúdo.

- [ ] **Step 4: alinhar board e filtros ao mesmo vocabulário**

Columns usam superfície `bg-muted`, radius `10px`, header `36px`; cards usam `bg-card`, radius `8px`, border sutil e padding `10px`. Popovers de filtro/display usam os primitivos Radix existentes.

- [ ] **Step 5: comparar list e board em dark/light e commitar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add components/common/issues components/common/list-skeleton.tsx components/layout/headers/display-options.tsx
git commit -m "style(issues): alinha listas e boards ao Linear"
```

---

### Task 6: Alinhar Projects, Initiatives, Teams, Views e Reviews

**Files:**

- Modify: `components/common/projects/projects-list.tsx`
- Modify: `components/common/projects/project-line.tsx`
- Modify: `components/common/projects/projects-board.tsx`
- Modify: `components/common/projects/projects-timeline.tsx`
- Modify: `components/common/projects/projects.tsx`
- Modify: `components/common/initiatives/initiatives.tsx`
- Modify: `components/common/initiatives/initiative-details.tsx`
- Modify: `components/common/initiatives/initiatives-side-panel.tsx`
- Modify: `components/common/initiatives/initiative-progress-panel.tsx`
- Modify: `components/common/teams/teams.tsx`
- Modify: `components/common/teams/team-line.tsx`
- Modify: `components/common/teams/team-projects.tsx`
- Modify: `components/common/teams/team-members.tsx`
- Modify: `components/common/teams/team-overview.tsx`
- Modify: `components/common/views/views.tsx`
- Modify: `components/common/views/view-details.tsx`
- Modify: `components/common/reviews/reviews.tsx`
- Modify: `components/common/reviews/review-shared.tsx`
- Modify: `components/common/members/members.tsx`
- Modify: `components/common/members/member-line.tsx`

**Interfaces:**

- Consumes: tokens, header primitives e densidade estabelecidos nas Tasks 2–5.
- Preserves: DnD, seleção, filtros, timeline, side panels e navegação.

- [ ] **Step 1: confirmar a estrutura de cada equivalente no Linear**

Projects/Initiatives: location + view bars de `44/43px`, header de tabela logo abaixo e rows compactas. Teams/Views/Reviews: usar a mesma gramática do Circle quando não houver equivalente 1:1, sem inventar função.

- [ ] **Step 2: padronizar tabelas e linhas**

```text
table header: 32px, 12px/500, muted
data row: 44px, 13px/500 para nome, 12px para metadata
cell padding: 12px horizontal
hover: accent/40
```

Não mudar ordem, filtros ou conteúdo das colunas.

- [ ] **Step 3: padronizar board, timeline e side panels**

Usar os tokens de `card`, `muted`, `accent` e `border`; remover chrome duplicado; manter handles e handlers DnD existentes.

- [ ] **Step 4: validar rotas e commitar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add components/common/projects components/common/initiatives components/common/teams components/common/views components/common/reviews components/common/members
git commit -m "style(workspace): harmoniza superfícies de trabalho"
```

---

### Task 7: Reestruturar detalhes de Issue, Project e Initiative

**Files:**

- Modify: `components/common/issues/details/issue-details.tsx`
- Modify: `components/common/issues/details/issue-properties-panel.tsx`
- Modify: `components/common/issues/details/issue-detail-skeleton.tsx`
- Modify: `components/common/issues/details/activity-feed.tsx`
- Modify: `components/common/issues/details/comment-composer.tsx`
- Modify: `components/common/issues/details/content-blocks.tsx`
- Modify: `components/common/projects/details/project-overview.tsx`
- Modify: `components/common/projects/details/project-properties-panel.tsx`
- Modify: `components/common/projects/details/project-side-panel.tsx`
- Modify: `components/common/projects/details/project-activity.tsx`
- Modify: `components/common/initiatives/initiative-details.tsx`
- Modify: `components/common/initiatives/initiatives-side-panel.tsx`

**Interfaces:**

- Preserves: edição, comments, reactions, relações, subscription, propriedades e activity.
- Produces: coluna editorial `minmax(0, 800px)` e painel de propriedades `360px` no desktop.

- [ ] **Step 1: confirmar benchmark de detalhe**

No viewport `1718 × 1270`, conteúdo principal observado em cerca de `791px`; propriedades ficam em coluna direita sem card externo. Título usa `26px`/`32px`, peso `600`.

- [ ] **Step 2: aplicar o grid editorial**

```tsx
<div className="mx-auto grid w-full max-w-[1120px] grid-cols-[minmax(0,800px)_360px] gap-12 px-8 py-8 max-lg:grid-cols-1">
   <article className="min-w-0">...</article>
   <aside className="min-w-0 max-lg:border-t max-lg:pt-6">...</aside>
</div>
```

- [ ] **Step 3: reduzir chrome de propriedades e activity**

Propriedades usam rows de `28px`, labels de seção `12px`, sem container card. Comments preservam ações e threading, usando superfície elevada apenas no comentário, não no feed inteiro.

- [ ] **Step 4: espelhar geometria em skeletons**

Skeleton deve ocupar exatamente as duas colunas e trocar para uma coluna nos mesmos breakpoints.

- [ ] **Step 5: validar edição e commitar**

Browser: abrir issue/project/initiative, editar um campo local descartável, confirmar toast após API e rollback em falha simulada apenas no ambiente local.

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add components/common/issues/details components/common/projects/details components/common/initiatives
git commit -m "style(details): aplica layout editorial do Linear"
```

---

### Task 8: Corrigir a composição visual de Inbox e Cycles

**Files:**

- Modify: `components/common/inbox/inbox.tsx`
- Modify: `components/common/inbox/issue-line.tsx`
- Modify: `components/common/inbox/issue-preview.tsx`
- Modify: `components/common/cycles/cycles.tsx`
- Modify: `components/common/cycles/cycle-line.tsx`
- Modify: `components/common/cycles/cycle-details-panel.tsx`
- Modify: `components/common/cycles/cycle-burnup-chart.tsx`
- Modify: `components/common/cycles/capacity-ring.tsx`

**Interfaces:**

- Preserves: filtros, read/unread, snooze, seleção, burn-up e actions.
- Produces: Inbox com lista `302px` incluindo chrome e rows `55px`; Cycles com timeline densa e current expandido.

- [ ] **Step 1: alinhar Inbox ao split confirmado**

```tsx
<div className="grid h-full grid-cols-[302px_minmax(0,1fr)] max-md:grid-cols-1">
   <section className="min-w-0 border-r border-border/60">...</section>
   <section className="min-w-0">...</section>
</div>
```

Row: `h-[55px] rounded-lg px-2`; selected usa `bg-accent`; apenas o painel direito renderiza “No notification selected”. No mobile, seleção troca lista por detalhe e mantém o botão Back existente.

- [ ] **Step 2: alinhar Cycles sem alterar cálculos**

Cycle row colapsada usa `44px`; current expandido contém burn-up e stats no mesmo fluxo, com eixos/divisores discretos. Não tocar em `data/cycles.ts`, adapters ou store.

- [ ] **Step 3: validar estados especiais**

Inbox: carregado, vazio, unread, snoozed, selected e mobile. Cycles: current, upcoming, previous, sem burn-up e loading.

- [ ] **Step 4: rodar regressão e commitar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add components/common/inbox components/common/cycles
git commit -m "style(special): alinha Inbox e Cycles ao Linear"
```

---

### Task 9: Alinhar Settings, formulários e overlays

**Files:**

- Modify: `components/common/settings/shared.tsx`
- Modify: `components/common/settings/account-code-reviews.tsx`
- Modify: `components/common/settings/account-notifications.tsx`
- Modify: `components/common/settings/agent-personalization.tsx`
- Modify: `components/common/settings/ai-agents.tsx`
- Modify: `components/common/settings/audit-log-settings.tsx`
- Modify: `components/common/settings/emojis-settings.tsx`
- Modify: `components/common/settings/issue-templates-settings.tsx`
- Modify: `components/common/settings/new-team.tsx`
- Modify: `components/common/settings/preferences.tsx`
- Modify: `components/common/settings/profile.tsx`
- Modify: `components/common/settings/project-statuses-settings.tsx`
- Modify: `components/common/settings/project-templates-settings.tsx`
- Modify: `components/common/settings/pulse-settings.tsx`
- Modify: `components/common/settings/team-settings.tsx`
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/input.tsx`
- Modify: `components/ui/dialog.tsx`
- Modify: `components/ui/dropdown-menu.tsx`
- Modify: `components/ui/popover.tsx`
- Modify: `components/ui/select.tsx`
- Modify: `components/ui/command.tsx`
- Modify: `components/ui/sheet.tsx`
- Modify: `components/ui/sonner.tsx`
- Modify: `components/layout/command-palette.tsx`

**Interfaces:**

- Preserves: formulários, save states, dialogs, menus, keyboard navigation e toasts.
- Produces: conteúdo Settings `640px`, cards radius `10px`, overlays coerentes.

- [ ] **Step 1: ajustar os componentes compartilhados de Settings**

```tsx
<div className="mx-auto w-full max-w-[640px] px-0 py-16 max-md:px-5 max-md:py-8">
   <h1 className="text-[26px] font-semibold leading-8">{title}</h1>
   <div className="mt-8 flex flex-col gap-10">{children}</div>
</div>
```

`SettingsCard`: `rounded-[10px] bg-card divide-y divide-border/60`, sem borda externa forte. `SettingsRow`: mínimo `64px`, padding `16px`.

- [ ] **Step 2: remover cor literal compartilhada**

Trocar `bg-[#00cc66]` de `EnabledDot` por token semântico de sucesso já existente ou adicionar `--success`/`--color-success` em `globals.css` e usar `bg-success`.

- [ ] **Step 3: calibrar overlays vendored sem alterar APIs**

Popover/dialog/menu: `bg-popover`, radius `10px`, border sutil, shadow curta, item `28px`, focus/selected via `bg-accent`. Dialog mantém focus trap, escape e portais Radix.

- [ ] **Step 4: validar teclado, foco e todos os Settings shells**

Percorrer Profile, Preferences, Notifications, Code & reviews, Agent personalization, templates, labels, integrations, audit e team settings. Confirmar que o loading usa a mesma largura do conteúdo final.

- [ ] **Step 5: rodar regressão e commitar**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add app/globals.css components/common/settings components/ui components/layout/command-palette.tsx
git commit -m "style(settings): reproduz superfícies e overlays do Linear"
```

---

### Task 10: Hardening responsivo, temas e acessibilidade

**Files:**

- Modify: `app/globals.css`
- Modify: `components/layout/main-layout.tsx`
- Modify: `components/layout/header-primitives.tsx`
- Modify: `components/ui/sidebar.tsx`
- Modify: `components/common/issues/virtual-issue-list.tsx`
- Modify: `components/common/issues/issue-line.tsx`
- Modify: `components/common/projects/projects-list.tsx`
- Modify: `components/common/inbox/inbox.tsx`
- Modify: `components/common/cycles/cycles.tsx`
- Modify: `components/common/settings/shared.tsx`
- Modify: `app/error.tsx`
- Modify: `app/global-error.tsx`
- Modify: `app/not-found.tsx`
- Modify: `app/[orgId]/error.tsx`
- Modify: `docs/PENDENCIAS.md`

**Interfaces:**

- Produces: dark/light, cinco viewports, focus/keyboard e estados finais aprovados.
- Preserves: todas as APIs públicas dos componentes e stores.

- [ ] **Step 1: executar a matriz visual completa**

Rotas: Inbox, My issues, team Active/Backlog/All, Cycles, Projects, Initiatives, Views, Reviews, Members, Teams, issue detail, project detail, initiative detail e cada grupo de Settings.

Viewports: `1718×1270`, `1440×900`, `1280×800`, `768×1024`, `390×844`.

Estados: loaded, empty, loading, error, hover, selected, focus, popover e dialog.

- [ ] **Step 2: corrigir apenas divergências reproduzidas**

Cada ajuste deve registrar rota, viewport, medida esperada e medida observada antes da alteração. Não fazer limpeza lateral.

- [ ] **Step 3: validar acessibilidade**

Usar Tab/Shift+Tab/Escape/Enter/Space; confirmar focus ring, ordem de foco, `aria-label` em icon buttons, reduced motion e ausência de cor como único indicador.

- [ ] **Step 4: validar temas**

Comparar dark com o Linear autenticado e light com as referências oficiais. Validar também `pure-light`, `magic-blue`, `classic-dark` e custom theme sem sobrescrever os tokens escolhidos pelo usuário.

- [ ] **Step 5: executar verificação final automatizada**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm lint`

Expected: 0 warnings/errors.

Run: `pnpm test`

Expected: 56 arquivos e 336 testes PASS, incluindo os dois novos arquivos.

Run: `pnpm build`

Expected: build de produção concluída sem erro.

Run: `git diff --check`

Expected: saída vazia.

Run: `git grep -n CIRCLE_DEV_AUTH_EMAIL HEAD -- lib/api/auth.ts middleware.ts`

Expected: saída vazia.

- [ ] **Step 6: atualizar continuidade e commitar**

Registrar em `docs/PENDENCIAS.md` a issue #65, o estado dos lotes, as divergências intencionais e os resultados de verificação.

```bash
git add app components docs/PENDENCIAS.md
git commit -m "docs(ui): registra conclusão da paridade visual"
```

- [ ] **Step 7: solicitar code review e preparar PR**

Revisar o diff completo contra a spec, corrigir findings reproduzíveis, reexecutar a verificação final e abrir PR para `develop` com `Closes #65`.
