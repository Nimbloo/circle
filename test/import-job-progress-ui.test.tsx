// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportJobDto } from '@/lib/api/import';

const job = vi.hoisted(() => vi.fn());
vi.mock('@/lib/client', () => ({ api: { importIssues: { job } } }));

import { ImportJobProgress } from '@/components/common/settings/import-job-progress';
import { IMPORT_JOB_EVENT } from '@/lib/use-live-sync';

/** #10 — a tela acompanha o job de import até o fim (polling + evento SSE do dono). */
function dto(p: Partial<ImportJobDto>): ImportJobDto {
   return {
      id: 'j1',
      teamId: 'CORE',
      source: 'csv',
      status: 'running',
      total: 10,
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      error: null,
      createdAt: '2026-09-18T00:00:00.000Z',
      finishedAt: null,
      ...p,
   };
}

describe('ImportJobProgress (#10)', () => {
   beforeEach(() => job.mockReset());

   it('mostra o progresso e avisa quando termina', async () => {
      job.mockResolvedValueOnce(dto({ processed: 4 })).mockResolvedValue(
         dto({ status: 'succeeded', processed: 10, created: 10 })
      );
      const onFinished = vi.fn();
      render(<ImportJobProgress jobId="j1" onFinished={onFinished} intervalMs={10} />);
      expect(await screen.findByText(/4 de 10/)).toBeTruthy();
      await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
      expect(onFinished.mock.calls[0][0]).toMatchObject({ status: 'succeeded', created: 10 });
   });

   it('evento do job relê na hora', async () => {
      job.mockResolvedValueOnce(dto({ processed: 1 })).mockResolvedValue(
         dto({ status: 'failed', error: 'boom' })
      );
      const onFinished = vi.fn();
      render(<ImportJobProgress jobId="j1" onFinished={onFinished} intervalMs={60_000} />);
      expect(await screen.findByText(/1 de 10/)).toBeTruthy();
      act(() => {
         window.dispatchEvent(new CustomEvent(IMPORT_JOB_EVENT, { detail: { id: 'j1' } }));
      });
      await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
      expect(onFinished.mock.calls[0][0]).toMatchObject({ status: 'failed', error: 'boom' });
   });
});
