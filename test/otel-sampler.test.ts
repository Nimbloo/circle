import { describe, it, expect } from 'vitest';
import { ROOT_CONTEXT } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ignoreHealthProbes } from '@/lib/observability/otel';

const decide = (spanName: string) =>
   ignoreHealthProbes.shouldSample(ROOT_CONTEXT, 'a'.repeat(32), spanName, 0, {}, []).decision;

describe('otel: sampler das probes de health', () => {
   it.each([
      'GET /api/healthz',
      'GET /api/readyz',
      'GET /api/readyz?probe=1',
      'executing api route (app) /api/healthz',
   ])('descarta o span da probe: %s', (name) => {
      expect(decide(name)).toBe(SamplingDecision.NOT_RECORD);
   });

   it.each([
      'GET /api/v1/issues?next=/api/healthz',
      'GET /api/v1/issues?redirect=x&y=/api/readyz',
      'GET /api/healthzfoo',
      'executing api route (app) /api/v1/issues',
   ])('amostra requisição que só cita a probe fora do pathname: %s', (name) => {
      expect(decide(name)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
   });
});
