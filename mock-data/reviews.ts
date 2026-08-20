/**
 * Mock data of the Reviews feature (Linear-style PR reviews): list tabs
 * ("For you" / "Created"), and per-review Overview / Guide / Diff content.
 * Everything is fake and deterministic, on the LNDev UI storyline; the
 * `resolves` identifiers reference real issues from mock-data/issues.ts.
 */

export type ReviewStatus = 'open' | 'merged' | 'closed';
export type ReviewList = 'for-you' | 'created';

export type ReviewFileCategory = 'implementation' | 'tests';

export interface ReviewFileStat {
   name: string;
   path: string;
   additions: number;
   deletions: number;
   category: ReviewFileCategory;
}

export interface ReviewCommit {
   sha: string;
   message: string;
   timeAgo: string;
}

export interface DiffLine {
   type: 'context' | 'add' | 'del' | 'skip';
   /** New-file line number (omitted for del/skip). */
   number?: number;
   text?: string;
   /** For 'skip': how many unchanged lines are collapsed. */
   count?: number;
}

export interface FileDiff {
   name: string;
   path: string;
   additions: number;
   deletions: number;
   lines: DiffLine[];
}

export interface GuideSection {
   title: string;
   paragraphs: string[];
   /** File name shown as chips under the prose (stat = "+n -m"). */
   fileRefs: { name: string; path: string; stat: string }[];
   /** Which file diff to show next to the section. */
   diffName: string;
}

export interface ReviewVerdictRow {
   review: string;
   verdict: string;
   critical: string;
   high: string;
   medium: string;
}

export interface ReviewNote {
   author: string;
   timeAgo: string;
   verdictLine: string;
   profileLine: string;
   rows: ReviewVerdictRow[];
   footer?: string;
}

export interface Review {
   /** URL slug. */
   id: string;
   title: string;
   status: ReviewStatus;
   list: ReviewList;
   timeAgo: string;
   repo: string;
   prNumber: number;
   targetBranch: string;
   sourceBranch: string;
   additions: number;
   deletions: number;
   /** Issue this PR resolves (real identifier from mock-data/issues.ts). */
   resolves: { identifier: string; title: string };
   checksPassed: number;
   checksTotal: number;
   files: ReviewFileStat[];
   commits: ReviewCommit[];
   /** Description "Summary" bullets — `inline code` supported via backticks. */
   summary: string[];
   testPlan: { text: string; checked: boolean }[];
   deployment?: { project: string; state: string; action: string };
   reviewNote?: ReviewNote;
}

/* -------------------------------------------------------------------------- */
/*                                   Seeds                                    */
/* -------------------------------------------------------------------------- */

type FileSeed = [name: string, path: string, add: number, del: number, cat: ReviewFileCategory];

interface ReviewSeed {
   id: string;
   title: string;
   status: ReviewStatus;
   list: ReviewList;
   timeAgo: string;
   prNumber: number;
   branch: string;
   resolves: [string, string];
   files: FileSeed[];
   commits: [string, string, string][];
   summary: string[];
   testPlan: [string, boolean][];
}

const seeds: ReviewSeed[] = [];

/* -------------------------------------------------------------------------- */
/*                        Deterministic detail expansion                      */
/* -------------------------------------------------------------------------- */

const seedNumber = (value: string): number =>
   value.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 9973, 11);

/** Deterministic, plausible-looking TypeScript diff for a file. */
export function getReviewFileDiff(review: Review, file: ReviewFileStat): FileDiff {
   const seed = seedNumber(review.id + file.name);
   const base = file.name.replace(/\.(test|stories)?\.?(tsx?|css)$/, '');
   const camel = base.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
   const isTest = file.category === 'tests';
   const lines: DiffLine[] = [];
   let n = 1;
   const push = (type: DiffLine['type'], text: string) => {
      lines.push({ type, number: type === 'del' ? undefined : n, text });
      if (type !== 'del') n += 1;
   };

   const pascal = camel[0].toUpperCase() + camel.slice(1);
   const isHook = base.startsWith('use-');
   /** Function name of the file (hooks keep their camelCase name). */
   const fn = isHook ? camel : pascal;
   const stateHook = isHook ? `${camel}State` : `use${pascal}State`;

   if (isTest) {
      push('context', "import { describe, expect, it } from 'vitest';");
      push('context', "import { render, screen } from '@testing-library/react';");
      push('add', `import { ${fn} } from '../${base}';`);
      push('context', '');
      push('context', `describe('${fn}', () => {`);
      push(
         'add',
         `   it('${review.summary[0]
            ?.slice(0, 48)
            .toLowerCase()
            .replace(/[`'".]/g, '')}…', () => {`
      );
      push('add', `      render(<${fn} />);`);
      push(
         'add',
         `      expect(screen.getByRole('${seed % 2 ? 'dialog' : 'button'}')).toBeInTheDocument();`
      );
      push('add', '   });');
      push('add', '');
      push('add', `   it('keeps the previous behaviour for the default props', () => {`);
      push('add', `      const { container } = render(<${fn} />);`);
      push('add', '      expect(container.firstChild).toMatchSnapshot();');
      push('add', '   });');
      push('context', '});');
      lines.push({ type: 'skip', count: 18 + (seed % 30) });
   } else {
      push('context', "'use client';");
      push('context', '');
      push('context', "import { cn } from '@/lib/utils';");
      push('add', `import { ${stateHook} } from './${isHook ? base : `use-${base}`}-state';`);
      push('context', '');
      push('context', `export function ${fn}(props: ${pascal}Props) {`);
      push('del', '   const state = legacyState(props);');
      push('add', `   const state = ${stateHook}(props);`);
      push('context', '');
      push('add', '   // The measured size tracks the content box, so nested scroll');
      push('add', '   // containers no longer report a stale height on first paint.');
      push('add', `   const measured = state.measure({ clamp: ${seed % 2 ? 'true' : 'false'} });`);
      push('context', '');
      push('context', '   return (');
      push(
         'add',
         `      <div className={cn('relative min-w-0', props.className)} data-slot="${base}">`
      );
      push('context', '         {props.children}');
      push('context', '      </div>');
      push('context', '   );');
      push('context', '}');
      lines.push({ type: 'skip', count: 24 + (seed % 40) });
   }

   return {
      name: file.name,
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      lines,
   };
}

/** Guide sections: one per implementation file (max 2), prose from the summary. */
export function getReviewGuide(review: Review): GuideSection[] {
   const implementation = review.files.filter((file) => file.category === 'implementation');
   const sections = implementation.slice(0, 2).map((file, index) => {
      const others = review.files.filter((candidate) => candidate !== file).slice(0, 3);
      return {
         title:
            index === 0
               ? (review.summary[0]?.split(/[—.:]/)[0].replace(/^Bug/, 'Fixing the bug') ??
                 review.title)
               : `Wiring ${file.name}`,
         paragraphs: [
            review.summary[index] ?? review.summary[0] ?? '',
            review.summary[index + 1] ?? 'The change is covered by the tests listed below.',
         ],
         fileRefs: [
            {
               name: file.name,
               path: file.path,
               stat: `+${file.additions}${file.deletions ? ` -${file.deletions}` : ''}`,
            },
            ...others.map((other) => ({
               name: other.name,
               path: other.path,
               stat: `+${other.additions}${other.deletions ? ` -${other.deletions}` : ''}`,
            })),
         ],
         diffName: file.name,
      };
   });
   return sections;
}

/* -------------------------------------------------------------------------- */
/*                                  Reviews                                   */
/* -------------------------------------------------------------------------- */

/** Agent verdict variants, picked deterministically per review. */
const REVIEW_NOTES: Omit<ReviewNote, 'author' | 'timeAgo'>[] = [
   {
      verdictLine:
         '✅ GO — All selected reviews passed (0 critical, 0 high). The architecture HIGH was fixed in-branch and re-verified by mutation testing.',
      profileLine:
         'Profile computed on the real diff (dev-flow Phase 4.5): logic + performance + architecture. Security skipped (no auth surface — UI rendering only).',
      rows: [
         {
            review: 'Logic',
            verdict: '✅ PASS',
            critical: '0',
            high: '0',
            medium: '2 (1 fixed, 1 deferred)',
         },
         {
            review: 'Performance',
            verdict: '✅ PASS',
            critical: '0',
            high: '0',
            medium: '1 (pre-existing, deferred)',
         },
         {
            review: 'Architecture',
            verdict: '✅ PASS (was BLOCKED, fixed)',
            critical: '0',
            high: '0 → fixed',
            medium: '2 (deferred)',
         },
         { review: 'Security', verdict: '⏭️ SKIPPED', critical: '—', high: '—', medium: '—' },
      ],
      footer:
         'Fixed post-review: the regression surface is now asserted by a test — a break would fail loudly instead of degrading silently.',
   },
   {
      verdictLine: '✅ GO — Clean pass on the first round (0 critical, 0 high, 1 medium deferred).',
      profileLine:
         'Profile computed on the real diff (dev-flow Phase 4.5): logic + accessibility + performance. Security skipped (no data boundary touched).',
      rows: [
         { review: 'Logic', verdict: '✅ PASS', critical: '0', high: '0', medium: '0' },
         {
            review: 'Accessibility',
            verdict: '✅ PASS',
            critical: '0',
            high: '0',
            medium: '1 (deferred)',
         },
         { review: 'Performance', verdict: '✅ PASS', critical: '0', high: '0', medium: '0' },
         { review: 'Security', verdict: '⏭️ SKIPPED', critical: '—', high: '—', medium: '—' },
      ],
      footer:
         'The deferred medium is tracked as a follow-up ticket; no behaviour change shipped without a test.',
   },
   {
      verdictLine:
         '✅ GO — Passed after one fix round: the logic HIGH found in round one was fixed in-branch and re-verified.',
      profileLine:
         'Profile computed on the real diff (dev-flow Phase 4.5): logic + architecture. Performance and security skipped (leaf UI change).',
      rows: [
         {
            review: 'Logic',
            verdict: '✅ PASS (was BLOCKED, fixed)',
            critical: '0',
            high: '1 → fixed',
            medium: '1 (fixed)',
         },
         {
            review: 'Architecture',
            verdict: '✅ PASS',
            critical: '0',
            high: '0',
            medium: '1 (deferred)',
         },
         { review: 'Performance', verdict: '⏭️ SKIPPED', critical: '—', high: '—', medium: '—' },
         { review: 'Security', verdict: '⏭️ SKIPPED', critical: '—', high: '—', medium: '—' },
      ],
      footer:
         'Round-two diff was re-profiled from scratch: the fix did not widen the review surface.',
   },
];

export const reviews: Review[] = seeds.map((seed) => {
   const noteSeed = seedNumber(seed.id);
   return {
      id: seed.id,
      title: seed.title,
      status: seed.status,
      list: seed.list,
      timeAgo: seed.timeAgo,
      repo: 'lndev-ui',
      prNumber: seed.prNumber,
      targetBranch: 'main',
      sourceBranch: seed.branch,
      additions: seed.files.reduce((acc, file) => acc + file[2], 0),
      deletions: seed.files.reduce((acc, file) => acc + file[3], 0),
      resolves: { identifier: seed.resolves[0], title: seed.resolves[1] },
      checksPassed: seed.status === 'closed' ? 2 : seed.status === 'open' ? 3 : 4,
      checksTotal: 5,
      files: seed.files.map(([name, path, additions, deletions, category]) => ({
         name,
         path,
         additions,
         deletions,
         category,
      })),
      commits: seed.commits.map(([sha, message, timeAgo]) => ({ sha, message, timeAgo })),
      summary: seed.summary,
      testPlan: seed.testPlan.map(([text, checked]) => ({ text, checked })),
      deployment: {
         project: 'lndev-ui-docs',
         state: seed.status === 'closed' ? 'Skipped' : 'Ready',
         action: 'Preview',
      },
      reviewNote:
         seed.list === 'for-you' && seed.status === 'merged'
            ? {
                 author: 'Atlas',
                 timeAgo: seed.timeAgo === '1h' ? '55min ago' : seed.timeAgo + ' ago',
                 ...REVIEW_NOTES[noteSeed % REVIEW_NOTES.length],
              }
            : undefined,
   };
});

export const forYouReviews = reviews.filter((review) => review.list === 'for-you');
export const createdReviews = reviews.filter((review) => review.list === 'created');

export function getReviewById(id: string): Review | undefined {
   return reviews.find((review) => review.id === id);
}
