# Transições, loading e estados vazios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

## Estado (handoff entre agentes)

- **Onde:** checkout principal `C:/Projetos/circle`, branch `danilo/ui-transitions-empty-states` (a partir de `origin/develop` `fde188f`), não publicada.
- **Feito:** Tasks 1–8 commitadas (`5f5ecfb`..`b85f872`). Desvios do plano: roadmap usa o título "No projects to plot yet"; inbox ganhou também o vazio "filtrado" (há notificações, mas os filtros escondem todas); issue-labels ganhou guarda de `catalog.loaded` (antes dizia "No labels yet" durante a carga).
- **Última verificação:** 2026-09-18, Claude — `pnpm test` 175 arquivos/1093 testes ok, `pnpm typecheck` ok, `pnpm lint` ok, `pnpm build` ok.
- **Próximo passo:** inspeção visual + checagem do SSE no browser (Task 9), depois PR para `develop`.
- **Bloqueios:** o dev seam (`CIRCLE_DEV_AUTH_EMAIL`) não existe hoje em `lib/api/auth.ts`/`middleware.ts` de nenhum checkout — sem ele o `pnpm dev` exige login Keycloak real.

**Goal:** Padronizar loading de navegação (ícone do Circle), entrada de rota discreta e estados vazios contextuais, sem remontar o shell do workspace nem mexer no realtime.

**Architecture:** Dois primitivos server-compatible (`CircleLoading`, `EmptyState`) em `components/common/`; `loading.tsx` do App Router na raiz e em `[orgId]` + `app/[orgId]/template.tsx` com animação CSS de entrada. Consumidores passam a separar erro → primeira carga → vazio → conteúdo; o vazio é derivado do store/estado local e sai sozinho quando o SSE aplica eventos.

**Tech Stack:** Next 15 App Router, React 19, Tailwind v4 (tokens em `app/globals.css`), lucide-react, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-18-ui-transitions-empty-states-design.md`

## Global Constraints

- `DataHydrator`/`useLiveSync` só em `app/[orgId]/layout.tsx`; nenhum loading/template/EmptyState faz chamada de API, subscription, `router.refresh` ou reset de store.
- Nada de `app/template.tsx` global; template só em `app/[orgId]/`.
- Animação de entrada: fade 0→1, deslocamento ≤ 4px, 160–200ms, sem animação de saída, desligada em `prefers-reduced-motion`.
- Sem biblioteca nova, sem `motion` JS, sem `backdrop-filter`, sem polling.
- Cores só por token. `CommandEmpty`, empty de gráfico, painéis de onboarding (Views, Reviews à direita, "No notification selected") ficam como estão.
- Copy de cada consumidor preservada no idioma em que já está (a UI mistura en/pt por paridade Linear); textos novos seguem o idioma da tela.
- `animation-fill-mode: backwards` na entrada de rota: `transform` persistente num ancestral viraria containing block de `position: fixed`.

## Mapa de arquivos

| Arquivo                                                                                                                                                                         | Responsabilidade                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `components/common/circle-loading.tsx` (novo)                                                                                                                                   | Indicador de loading com o logo                   |
| `components/common/empty-state.tsx` (novo)                                                                                                                                      | Estado vazio de página/seção                      |
| `app/globals.css`                                                                                                                                                               | keyframes `circle-loading-*`, `route-enter`       |
| `app/loading.tsx`, `app/[orgId]/loading.tsx`, `app/[orgId]/template.tsx` (novos)                                                                                                | Loading/entrada de rota                           |
| `store/notifications-store.ts`, `components/common/inbox/inbox.tsx`                                                                                                             | `loaded` + vazio do inbox                         |
| `components/common/issues/grouped-issues-view.tsx`, `my-issues/my-issues.tsx`, `projects/projects.tsx`, `roadmap/roadmap-timeline.tsx`                                          | Vazios de issues/projetos                         |
| `initiatives/initiatives.tsx`, `members/members.tsx`, `teams/teams.tsx`, `cycles/cycles.tsx`, `reviews/reviews.tsx`, `teams/team-documents.tsx`                                 | Troca de markup ad-hoc pelo primitivo             |
| `projects/details/project-activity.tsx`, `initiatives/initiative-details.tsx`                                                                                                   | Separar carregando/erro/vazio nos feeds de update |
| `settings/{audit-log,emojis,issue-labels,issue-templates,project-templates,team-workflows}-settings.tsx`                                                                        | Vazios de configurações                           |
| `test/circle-loading.test.tsx`, `test/empty-state.test.tsx`, `test/route-loading.test.tsx`, `test/notifications-loaded.test.ts`, `test/project-activity-empty.test.tsx` (novos) | Cobertura                                         |

---

### Task 1: `CircleLoading`

**Files:** Create `components/common/circle-loading.tsx`; Modify `app/globals.css`; Test `test/circle-loading.test.tsx`

**Interfaces — Produces:** `export function CircleLoading({ label, size = 'md', className }: { label?: string; size?: 'sm' | 'md' | 'lg'; className?: string })`

- [x] **Step 1: teste que falha**

```tsx
// @vitest-environment jsdom
import './setup-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CircleLoading } from '@/components/common/circle-loading';

describe('CircleLoading', () => {
   it('anuncia o estado de forma polida e esconde só o SVG', () => {
      const { container } = render(<CircleLoading label="Carregando…" />);
      const status = screen.getByRole('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.getAttribute('aria-hidden')).toBeNull();
      expect(status.textContent).toContain('Carregando…');
      expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
   });

   it('sem label visível ainda tem nome acessível', () => {
      render(<CircleLoading />);
      expect(screen.getByRole('status').textContent).toContain('Carregando');
      expect(screen.getByText('Carregando').className).toContain('sr-only');
   });

   it.each([
      ['sm', '16'],
      ['md', '24'],
      ['lg', '32'],
   ] as const)('tamanho %s → logo de %spx', (size, px) => {
      const { container } = render(<CircleLoading size={size} />);
      expect(container.querySelector('svg')?.getAttribute('width')).toBe(px);
      expect(screen.getByRole('status').dataset.size).toBe(size);
   });
});
```

- [x] **Step 2:** `pnpm vitest run test/circle-loading.test.tsx` → FAIL (módulo inexistente).
- [x] **Step 3: implementação**

```tsx
import { CircleLogo } from '@/components/brand/circle-logo';
import { cn } from '@/lib/utils';

const LOGO_PX = { sm: 16, md: 24, lg: 32 } as const;

/**
 * Loading com a marca do Circle. Server-compatible (sem estado). A animação vive em
 * `app/globals.css` (`.circle-loading`): aparece com atraso curto — navegação rápida não
 * pisca — e pulsa de leve; `prefers-reduced-motion` deixa o ícone estático.
 */
export function CircleLoading({
   label,
   size = 'md',
   className,
}: {
   label?: string;
   size?: 'sm' | 'md' | 'lg';
   className?: string;
}) {
   return (
      <div
         role="status"
         aria-live="polite"
         data-size={size}
         className={cn(
            'circle-loading flex flex-col items-center justify-center gap-3 text-muted-foreground',
            className
         )}
      >
         <CircleLogo size={LOGO_PX[size]} className="circle-loading-mark" />
         {label ? (
            <span className="text-[13px]">{label}</span>
         ) : (
            <span className="sr-only">Carregando</span>
         )}
      </div>
   );
}
```

CSS (após o bloco do collapsible em `app/globals.css`):

```css
/* Loading de rota (CircleLoading): entra após 120 ms — navegação rápida não pisca — e
   pulsa de leve. Seletor direto pelo mesmo motivo do collapsible (Turbopack/animate-*). */
@keyframes circle-loading-in {
   from {
      opacity: 0;
   }
}
@keyframes circle-loading-pulse {
   from {
      opacity: 0.55;
      transform: scale(0.92);
   }
   to {
      opacity: 1;
      transform: scale(1);
   }
}
.circle-loading {
   animation: circle-loading-in 150ms ease-out 120ms backwards;
}
.circle-loading-mark {
   animation: circle-loading-pulse 900ms ease-in-out infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
   .circle-loading,
   .circle-loading-mark {
      animation: none;
   }
}
```

- [x] **Step 4:** teste → PASS.
- [x] **Step 5:** commit `feat(ui): adiciona CircleLoading com a marca do Circle`.

### Task 2: `EmptyState`

**Files:** Create `components/common/empty-state.tsx`; Test `test/empty-state.test.tsx`

**Interfaces — Produces:**

```ts
export type EmptyStateVariant = 'empty' | 'activity' | 'search' | 'filtered';
export function EmptyState(props: {
   variant?: EmptyStateVariant; // default 'empty'
   icon?: React.ComponentType<{ className?: string }>; // sobrescreve o ícone da variante
   title: string;
   description?: string;
   action?: React.ReactNode;
   className?: string;
}): JSX.Element;
```

`icon` é a única adição ao spec: consumidores já têm ícone de domínio (Goal, Users, CyclePlayIcon) e perdê-lo seria regressão visual.

- [x] **Step 1: teste que falha**

```tsx
// @vitest-environment jsdom
import './setup-dom';
import { render, screen } from '@testing-library/react';
import { Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '@/components/common/empty-state';

describe('EmptyState', () => {
   it('renderiza título, descrição e ação num status', () => {
      render(
         <EmptyState
            title="No teams yet"
            description="Create one."
            action={<button>New team</button>}
         />
      );
      const status = screen.getByRole('status');
      expect(screen.getByText('No teams yet').tagName).toBe('H3');
      expect(status.textContent).toContain('Create one.');
      expect(screen.getByRole('button', { name: 'New team' })).toBeTruthy();
   });

   it('sem descrição/ação não gera markup extra', () => {
      const { container } = render(<EmptyState title="Nada" />);
      expect(container.querySelectorAll('p').length).toBe(0);
      // wrapper + ícone(container + svg) + título
      expect(container.querySelectorAll('*').length).toBeLessThanOrEqual(6);
   });

   it.each([
      ['empty', 'lucide-circle-dashed'],
      ['activity', 'lucide-activity'],
      ['search', 'lucide-search'],
      ['filtered', 'lucide-list-filter'],
   ] as const)('variante %s usa o ícone padrão', (variant, cls) => {
      const { container } = render(<EmptyState variant={variant} title="x" />);
      const status = screen.getByRole('status');
      expect(status.dataset.variant).toBe(variant);
      expect(container.querySelector('svg')?.getAttribute('class')).toContain(cls);
   });

   it('icon sobrescreve o ícone da variante', () => {
      const { container } = render(<EmptyState variant="filtered" icon={Users} title="x" />);
      expect(container.querySelector('svg')?.getAttribute('class')).toContain('lucide-users');
   });
});
```

- [x] **Step 2:** `pnpm vitest run test/empty-state.test.tsx` → FAIL. (Se a classe do lucide tiver outro nome na versão instalada, ex. `lucide-list-filter` vs `lucide-funnel`, ajustar o teste ao nome real.)
- [x] **Step 3: implementação**

```tsx
import { cn } from '@/lib/utils';
import { Activity, CircleDashed, ListFilter, Search } from 'lucide-react';

export type EmptyStateVariant = 'empty' | 'activity' | 'search' | 'filtered';

const VARIANT_ICON = {
   empty: CircleDashed,
   activity: Activity,
   search: Search,
   filtered: ListFilter,
} satisfies Record<EmptyStateVariant, React.ComponentType<{ className?: string }>>;

/**
 * Vazio de conteúdo de página/seção (não de combobox — lá fica o `CommandEmpty`).
 * Mesma linguagem do `ErrorState`: ícone num chip de card, título curto, descrição
 * opcional e ação só quando há próximo passo útil. Só aparece depois da primeira carga.
 */
export function EmptyState({
   variant = 'empty',
   icon,
   title,
   description,
   action,
   className,
}: {
   variant?: EmptyStateVariant;
   icon?: React.ComponentType<{ className?: string }>;
   title: string;
   description?: string;
   action?: React.ReactNode;
   className?: string;
}) {
   const Icon = icon ?? VARIANT_ICON[variant];
   return (
      <div
         role="status"
         data-variant={variant}
         className={cn(
            'mx-auto flex w-full max-w-sm flex-col items-center justify-center px-6 py-16 text-center',
            className
         )}
      >
         <div className="mb-4 flex size-10 items-center justify-center rounded-[10px] border bg-card text-muted-foreground shadow-[var(--card-shadow)]">
            <Icon className="size-[18px]" aria-hidden="true" />
         </div>
         <h3 className="text-sm font-medium text-foreground">{title}</h3>
         {description && (
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{description}</p>
         )}
         {action && <div className="mt-4">{action}</div>}
      </div>
   );
}
```

- [x] **Step 4:** teste → PASS.
- [x] **Step 5:** commit `feat(ui): adiciona EmptyState para vazios de página e seção`.

### Task 3: Loading e entrada de rota

**Files:** Create `app/loading.tsx`, `app/[orgId]/loading.tsx`, `app/[orgId]/template.tsx`; Modify `app/globals.css`; Test `test/route-loading.test.tsx`

**Interfaces — Consumes:** `CircleLoading` (Task 1).

- [x] **Step 1: teste que falha**

```tsx
// @vitest-environment jsdom
import './setup-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RootLoading from '@/app/loading';
import OrgLoading from '@/app/[orgId]/loading';
import OrgTemplate from '@/app/[orgId]/template';

describe('loading/entrada de rota', () => {
   it('root e workspace anunciam o carregamento com o CircleLoading', () => {
      render(<RootLoading />);
      expect(screen.getByRole('status').textContent).toContain('Carregando');
   });

   it('o fallback do workspace ocupa só o frame de conteúdo', () => {
      const { container } = render(<OrgLoading />);
      const main = container.querySelector('main');
      expect(main?.className).toContain('bg-container');
      expect(main?.className).toContain('h-full');
      expect(screen.getByRole('status')).toBeTruthy();
   });

   it('o template só envolve os filhos com a classe de entrada', () => {
      const { container } = render(
         <OrgTemplate>
            <p>page</p>
         </OrgTemplate>
      );
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.className).toContain('route-enter');
      expect(wrapper.className).toContain('h-full');
      expect(wrapper.textContent).toBe('page');
   });
});
```

- [x] **Step 2:** rodar → FAIL.
- [x] **Step 3: implementação**

`app/loading.tsx`:

```tsx
import { CircleLoading } from '@/components/common/circle-loading';

/** Fallback de navegação das rotas públicas (login, convite) e da entrada no workspace. */
export default function Loading() {
   return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background">
         <CircleLoading size="lg" label="Carregando…" />
      </div>
   );
}
```

`app/[orgId]/loading.tsx`:

```tsx
import { CircleLoading } from '@/components/common/circle-loading';

/**
 * Fallback de navegação do workspace. Fica DENTRO do `[orgId]/layout` (sidebar, SSE e
 * stores seguem montados) e imita o frame do `MainLayout`, então só a área de conteúdo
 * troca. Telas que já conhecem o formato futuro continuam com seus skeletons.
 */
export default function OrgLoading() {
   return (
      <main className="flex h-full w-full items-center justify-center bg-container lg:rounded-xl lg:border lg:border-border/60">
         <CircleLoading label="Carregando…" />
      </main>
   );
}
```

`app/[orgId]/template.tsx`:

```tsx
/**
 * Entrada de rota do workspace. Template (não layout) remonta a cada navegação — por
 * isso fica ABAIXO do `[orgId]/layout`: DataHydrator, SSE e sidebar não remontam. Não
 * há layouts aninhados sob `[orgId]`, então nenhum estado persistente mora aqui dentro.
 * Só CSS: sem animação de saída, sem JS.
 */
export default function OrgTemplate({ children }: { children: React.ReactNode }) {
   return <div className="route-enter h-full w-full">{children}</div>;
}
```

CSS (junto do bloco da Task 1):

```css
/* Entrada de rota do workspace ([orgId]/template.tsx). `backwards` (não `both`): terminada
   a animação não sobra `transform` no wrapper — senão ele viraria containing block de todo
   `position: fixed` da página (barra de bulk actions, popovers não portados). */
@keyframes route-enter {
   from {
      opacity: 0;
      transform: translateY(4px);
   }
}
.route-enter {
   animation: route-enter 180ms cubic-bezier(0.2, 0, 0, 1) backwards;
}
@media (prefers-reduced-motion: reduce) {
   .route-enter {
      animation: none;
   }
}
```

- [x] **Step 4:** teste → PASS; `pnpm typecheck`.
- [x] **Step 5:** commit `feat(ui): adiciona loading e entrada de rota sem remontar o workspace`.

### Task 4: Inbox — carregado vs vazio

**Files:** Modify `store/notifications-store.ts`, `components/common/inbox/inbox.tsx`; Test `test/notifications-loaded.test.ts`

**Interfaces — Produces:** `NotificationsState.loaded: boolean` (false até a 1ª `hydrate()` terminar, com sucesso ou falha — a falha já degrada em silêncio hoje e mantém a lista atual).

- [x] **Step 1: teste que falha**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const list = vi.fn();
vi.mock('@/lib/client', () => ({
   api: {
      inbox: { list: (...a: unknown[]) => list(...a), unreadCount: async () => ({ count: 0 }) },
   },
}));

import { useNotificationsStore } from '@/store/notifications-store';

describe('notifications-store loaded', () => {
   beforeEach(() => {
      useNotificationsStore.setState({ notifications: [], loaded: false });
      list.mockReset();
   });

   it('só fica loaded depois da primeira hidratação', async () => {
      let resolve!: (v: unknown[]) => void;
      list.mockReturnValue(new Promise((r) => (resolve = r)));
      const p = useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().loaded).toBe(false);
      resolve([]);
      await p;
      expect(useNotificationsStore.getState().loaded).toBe(true);
   });

   it('falha também encerra a primeira carga (não prende em skeleton)', async () => {
      list.mockRejectedValue(new Error('boom'));
      await useNotificationsStore.getState().hydrate();
      expect(useNotificationsStore.getState().loaded).toBe(true);
   });
});
```

- [x] **Step 2:** rodar → FAIL.
- [x] **Step 3:** no store: campo `loaded: boolean` na interface (comentário curto), `loaded: false` no estado inicial, `loaded: true` no `set` de sucesso e `set({ loaded: true })` no `catch`.
      No `inbox.tsx`, dentro do container da lista (linha ~363), antes do bloco mobile:

```tsx
{
   filteredNotifications.length === 0 && !loaded && (
      <div className="w-full">
         <ListSkeleton rows={6} />
      </div>
   );
}
{
   filteredNotifications.length === 0 && loaded && (
      <EmptyState
         variant="activity"
         icon={Inbox}
         title="No notifications"
         description="You're all caught up."
         className="my-auto"
      />
   );
}
```

e remover o bloco `filteredNotifications.length === 0 && isMobile && <NotificationPreview />` (no mobile o preview vazio "No notification selected" era o vazio da lista; agora o EmptyState cobre os dois). `const loaded = useNotificationsStore((s) => s.loaded);`. Checar colisão do nome `Inbox` (componente default do arquivo) — importar o ícone como `Inbox as InboxIcon`.

- [x] **Step 4:** testes → PASS; `pnpm typecheck`.
- [x] **Step 5:** commit `feat(inbox): distingue carregando de inbox vazio`.

### Task 5: Issues, busca, projetos e roadmap

**Files:** Modify `components/common/issues/grouped-issues-view.tsx`, `components/common/my-issues/my-issues.tsx`, `components/common/projects/projects.tsx`, `components/common/roadmap/roadmap-timeline.tsx`

- [x] **Step 1:** `IssuesEmptyState`: branch final vira
      `return <EmptyState icon={LayersIcon ?? Layers} title="Nenhuma issue" description="Issues criadas aqui aparecem nesta lista." />` — usar `Layers` do lucide; erro e loading ficam como estão. Nos dois call sites (board e list) os wrappers (`h-40`/`h-full`) continuam.
- [x] **Step 2:** `my-issues.tsx` busca sem resultado:

```tsx
<EmptyState variant="search" title="No results" description={`Nothing matches "${searchQuery}".`} />
```

- [x] **Step 3:** `projects.tsx`: ler `loaded` do workspace-store e `allProjects` (lista crua antes dos filtros — usar o seletor que já alimenta `displayed`). Antes do switch de `viewType`:

```tsx
{displayed.length === 0 && !loaded ? (
   <div className="py-4"><ListSkeleton rows={6} /></div>
) : displayed.length === 0 ? (
   <EmptyState
      variant={hasProjects ? 'filtered' : 'empty'}
      icon={hasProjects ? undefined : Box}
      title={hasProjects ? 'No projects match your filters' : 'No projects yet'}
      description={hasProjects ? 'Try clearing or adjusting the filters.' : 'Projects group issues toward a shared outcome.'}
   />
) : (/* switch atual */)}
```

- [x] **Step 4:** `roadmap-timeline.tsx` `groups.length === 0`: manter o wrapper `flex h-full items-center justify-center`, trocar o texto por `<EmptyState icon={GanttChart} title="No projects to plot" description="Projects with dates show up on the roadmap." />` (usar o ícone de roadmap que o sidebar já usa, se houver).
- [x] **Step 5:** `pnpm typecheck` + `pnpm vitest run test/issue-filters.test.ts test/display-settings-store.test.ts`; commit `feat(ui): estados vazios de issues, projetos e roadmap`.

### Task 6: Troca de markup ad-hoc (initiatives, members, teams, cycles, reviews, documentos)

**Files:** Modify `components/common/initiatives/initiatives.tsx:588-609`, `components/common/members/members.tsx:70-87`, `components/common/teams/teams.tsx:88-107`, `components/common/cycles/cycles.tsx:43-57`, `components/common/reviews/reviews.tsx:398-403`, `components/common/teams/team-documents.tsx:129-133`

Guardas de loading existentes (`!loaded` → `ListSkeleton`) permanecem. Copy e ícone de domínio preservados:

- [x] **Step 1:** initiatives — `<EmptyState variant={none ? 'empty' : 'filtered'} icon={none ? Goal : undefined} title=… description=… action={none && <Button size="sm" onClick={startCreate}>New initiative</Button>} />` com `none = allInitiatives.length === 0`.
- [x] **Step 2:** members — `filtered = filters.role.length > 0`; `icon={filtered ? undefined : Users}`, textos atuais.
- [x] **Step 3:** teams — `filtered = filters.membership.length > 0 || filters.identifier.length > 0`; `action={!filtered && <NewTeamButton />}`.
- [x] **Step 4:** cycles — `<EmptyState icon={CyclePlayIcon} title="No cycles yet" description="Cycles focus your team…" />`.
- [x] **Step 5:** reviews (lista, painel esquerdo) — `<EmptyState variant={reviews.length > 0 ? 'filtered' : 'empty'} title={reviews.length > 0 ? 'No reviews match the current filters' : 'No reviews yet'} className="py-10" />`. O painel de onboarding da direita (EmptySketch) fica.
- [x] **Step 6:** team-documents — `<EmptyState icon={FileText} title="No documents yet" description="Use “New document” to create your first one." className="py-10" />`.
- [x] **Step 7:** `pnpm typecheck`; commit `refactor(ui): unifica estados vazios das listas no EmptyState`.

### Task 7: Feeds de update — não mostrar vazio durante a carga nem em erro

**Files:** Modify `components/common/projects/details/project-activity.tsx`, `components/common/initiatives/initiative-details.tsx`; Test `test/project-activity-empty.test.tsx`

Hoje os dois começam com lista vazia e mostram "No updates yet"/"Nenhum update ainda." enquanto o fetch corre, e engolem erro como vazio (mentira).

- [x] **Step 1: teste que falha** — renderiza `ProjectActivity` com `api.projects.detail` pendente (mock de `@/lib/client`), workspace-store `loaded: true` com o projeto semeado: espera **não** encontrar "No updates yet" e encontrar skeleton; resolve com detalhe sem updates → aparece o `EmptyState`; rejeição → "Could not load updates." sem o vazio. (Montar o projeto a partir do fixture/adapter usado nos testes de projeto existentes; `vi.mock('next/navigation')` como em `inbox-issue-panel.test.tsx`.)
- [x] **Step 2:** rodar → FAIL.
- [x] **Step 3:** `project-activity.tsx`: `const [feed, setFeed] = useState<'loading' | 'ready' | 'error'>('loading')`; o effect por `projectId` faz `setFeed('loading')` no início, `'ready'` no then, `'error'` no catch (sem trocar `detail` por vazio no erro); `reload` (pós-mutation) segue silencioso e não mexe em `feed`. Render:

```tsx
{feed === 'loading' && updates.length === 0 ? (
   <div className="mt-8"><ListSkeleton rows={3} /></div>
) : feed === 'error' && updates.length === 0 ? (
   <p className="mt-10 text-center text-sm text-muted-foreground">Could not load updates.</p>
) : updatesByMonth.length === 0 ? (
   <EmptyState variant="activity" title="No updates yet" description="Post the first one to keep the team in the loop." className="py-10" />
) : (/* timeline atual */)}
```

(updates otimistas do próprio usuário aparecem mesmo durante a carga — por isso a condição `updates.length === 0`.)

- [x] **Step 4:** `initiative-details.tsx` `Activity`: mesmo padrão com `feed` local; vazio → `<EmptyState variant="activity" title="Nenhum update ainda" description="Publique o primeiro para registrar o andamento." className="py-8" />`; erro → `Não foi possível carregar os updates.`.
- [x] **Step 5:** testes → PASS; commit `fix(ui): feeds de update não mostram vazio durante a carga nem no erro`.

### Task 8: Configurações

**Files:** Modify `settings/audit-log-settings.tsx:79`, `settings/emojis-settings.tsx:226-231`, `settings/issue-labels-settings.tsx:293-297`, `settings/issue-templates-settings.tsx:267-275`, `settings/project-templates-settings.tsx:285-293`, `settings/team-workflows-settings.tsx:553-558`

- [x] **Step 1:** audit-log → `<EmptyState variant="activity" title="Nenhuma ação registrada ainda" className="py-10" />`.
- [x] **Step 2:** emojis → `<EmptyState variant={query ? 'search' : 'empty'} icon={query ? undefined : Smile} title={query ? 'Nenhum emoji encontrado' : 'Nenhum emoji customizado'} />` mantendo a altura atual via `className`.
- [x] **Step 3:** issue-labels → `query ? variant search 'No labels match your filter' : icon Tag 'No labels yet' + description 'Create your first one.'`, `className="py-10"`.
- [x] **Step 4:** issue/project templates → `EmptyState` com os ícones (`FileText`/`FolderKanban`) e textos atuais, `className="py-10"`.
- [x] **Step 5:** team-workflows: `title={loading ? 'Carregando…' : …}` mistura carga e vazio. Separar: `loading && automations.length === 0` → `<ListSkeleton rows={2} />` dentro do `SettingsCard`; vazio após carga mantém o `SettingsRow` (padrão de linha das settings, Linear-like). Webhooks já separa — sem mudança.
- [x] **Step 6:** `pnpm typecheck`; commit `refactor(settings): estados vazios padronizados e carga separada do vazio`.

### Task 9: Verificação final

- [x] `pnpm test`, `pnpm typecheck`, `pnpm lint` — tudo verde.
- [x] `pnpm build` **fora** da pasta de um `next dev` em uso (memória: build sobrescreve `.next`); se o dev estiver de pé, parar antes ou rodar em outro checkout.
- [ ] Inspeção no browser (light/dark, desktop/mobile): inbox vazio, projects vazio/filtrado, roadmap, activity de projeto; navegação entre rotas mostra entrada suave; `prefers-reduced-motion` (emular no DevTools) desliga.
- [ ] Realtime: na aba Network, uma única conexão `events` por workspace após navegar por 5+ rotas; `DataHydrator` não re-hidrata na navegação.
- [ ] Atualizar o bloco **Estado** e abrir PR para `develop`.
