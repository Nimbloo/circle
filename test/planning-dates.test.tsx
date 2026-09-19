// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import { DatePicker } from '@/components/common/projects/date-picker';
import { parseDay } from '@/lib/project-dates';
import { makeProject } from './helpers/project-fixture';

vi.mock('@/lib/client', () => ({ api: { projects: {} } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ orgId: 'nimbloo' }) }));

/**
 * Datas `YYYY-MM-DD` (#44) e "hoje" (Pl baixa) no fuso do usuário: `new Date('2026-09-30')`
 * é meia-noite UTC — em UTC−3 vira 29/09. E "hoje" via `toISOString()` é o dia UTC:
 * às 23h30 em São Paulo já era "amanhã".
 */
const originalTz = process.env.TZ;
beforeAll(() => {
   process.env.TZ = 'America/Sao_Paulo';
});
afterAll(() => {
   process.env.TZ = originalTz;
   vi.useRealTimers();
});

describe('datas do planejamento no fuso local', () => {
   it('parseDay lê o dia civil, não meia-noite UTC', () => {
      expect(parseDay('2026-09-30').getDate()).toBe(30);
   });

   it('o DatePicker mostra o mesmo dia gravado', () => {
      render(<DatePicker date={parseDay('2026-09-30')} />);
      expect(screen.getByText('Sep 30, 2026')).toBeTruthy();
   });

   it('"hoje" da timeline é o dia local, não o dia UTC', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-09-19T02:30:00Z')); // 23h30 de 18/09 em São Paulo
      const projects = [makeProject({ id: 'p1', name: 'Alpha' })];
      render(<ProjectsTimeline groups={[{ id: 'all', name: 'All', projects }]} />);
      expect(screen.getByText('SEP 18')).toBeTruthy();
      vi.useRealTimers();
   });
});
