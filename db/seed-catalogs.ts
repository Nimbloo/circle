import type { Db } from './index';
import { status, priority, label, health, projectStatus } from './schema';

/** Catálogos fixos do produto — valores 1:1 do mock-data (status.tsx, priorities.tsx, labels.ts, projects.ts). */

export const STATUS_SEED = [
   { id: 'in-progress', name: 'In Progress', color: '#facc15', category: 'started', position: 0 },
   {
      id: 'technical-review',
      name: 'Technical Review',
      color: '#22c55e',
      category: 'started',
      position: 1,
   },
   { id: 'done', name: 'Done', color: '#5e6ad2', category: 'completed', position: 2 },
   { id: 'paused', name: 'Paused', color: '#26b5ce', category: 'started', position: 3 },
   { id: 'to-do', name: 'Todo', color: '#99a2b2', category: 'unstarted', position: 4 },
   { id: 'backlog', name: 'Backlog', color: '#95a2b3', category: 'backlog', position: 5 },
   { id: 'triage', name: 'Triage', color: '#f2790f', category: 'triage', position: 6 },
   { id: 'idea', name: 'Idea', color: '#5e6ad2', category: 'backlog', position: 7 },
   {
      id: 'product-feedback',
      name: 'Product Feedback',
      color: '#f2994a',
      category: 'started',
      position: 8,
   },
   { id: 'blocked', name: 'Blocked', color: '#eb5757', category: 'started', position: 9 },
   { id: 'shipped', name: 'Shipped', color: '#4cb782', category: 'completed', position: 10 },
   { id: 'canceled', name: 'Canceled', color: '#95a2b3', category: 'canceled', position: 11 },
   { id: 'duplicate', name: 'Duplicate', color: '#95a2b3', category: 'canceled', position: 12 },
];

export const PRIORITY_SEED = [
   { id: 'no-priority', name: 'No priority', position: 0, sortRank: 4 },
   { id: 'urgent', name: 'Urgent', position: 1, sortRank: 0 },
   { id: 'high', name: 'High', position: 2, sortRank: 1 },
   { id: 'medium', name: 'Medium', position: 3, sortRank: 2 },
   { id: 'low', name: 'Low', position: 4, sortRank: 3 },
];

export const LABEL_SEED = [
   { id: 'ui', name: 'UI Enhancement', color: 'purple' },
   { id: 'bug', name: 'Bug', color: 'red' },
   { id: 'feature', name: 'Feature', color: 'green' },
   { id: 'documentation', name: 'Documentation', color: 'blue' },
   { id: 'refactor', name: 'Refactor', color: 'yellow' },
   { id: 'performance', name: 'Performance', color: 'orange' },
   { id: 'design', name: 'Design', color: 'pink' },
   { id: 'security', name: 'Security', color: 'gray' },
   { id: 'accessibility', name: 'Accessibility', color: 'indigo' },
   { id: 'testing', name: 'Testing', color: 'teal' },
   { id: 'internationalization', name: 'Internationalization', color: 'cyan' },
];

export const HEALTH_SEED = [
   { id: 'no-update', name: 'No Update', color: '#8f9299', description: null },
   { id: 'off-track', name: 'Off Track', color: '#eb5757', description: null },
   { id: 'on-track', name: 'On Track', color: '#4cb782', description: null },
   { id: 'at-risk', name: 'At Risk', color: '#f2c94c', description: null },
];

// Status de PROJETO (paridade Linear) — separados do workflow de issue.
export const PROJECT_STATUS_SEED = [
   { id: 'proj-backlog', name: 'Backlog', color: '#95a2b3', category: 'backlog', position: 0 },
   { id: 'proj-planned', name: 'Planned', color: '#99a2b2', category: 'planned', position: 1 },
   {
      id: 'proj-in-progress',
      name: 'In Progress',
      color: '#facc15',
      category: 'started',
      position: 2,
   },
   {
      id: 'proj-completed',
      name: 'Completed',
      color: '#5e6ad2',
      category: 'completed',
      position: 3,
   },
   { id: 'proj-canceled', name: 'Canceled', color: '#95a2b3', category: 'canceled', position: 4 },
];

/** Idempotente: só semeia se vazio (onConflictDoNothing). */
export async function seedCatalogs(db: Db) {
   await db.insert(status).values(STATUS_SEED).onConflictDoNothing();
   await db.insert(priority).values(PRIORITY_SEED).onConflictDoNothing();
   await db.insert(label).values(LABEL_SEED).onConflictDoNothing();
   await db.insert(health).values(HEALTH_SEED).onConflictDoNothing();
   await db.insert(projectStatus).values(PROJECT_STATUS_SEED).onConflictDoNothing();
}
