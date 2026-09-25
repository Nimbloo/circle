import { describe, it, expect } from 'vitest';
import { ROOT_CONTEXT, TraceFlags, trace } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { ignoreHealthProbes, tracingSampler } from '@/lib/observability/otel';

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

describe('otel: sampler respeita a decisão do span pai', () => {
   const parent = (sampled: boolean) =>
      trace.setSpanContext(ROOT_CONTEXT, {
         traceId: 'a'.repeat(32),
         spanId: 'b'.repeat(16),
         traceFlags: sampled ? TraceFlags.SAMPLED : TraceFlags.NONE,
         isRemote: false,
      });
   const decideIn = (ctx: typeof ROOT_CONTEXT, name: string) =>
      tracingSampler.shouldSample(ctx, 'a'.repeat(32), name, 0, {}, []).decision;

   it('filho de uma probe descartada também é descartado, mesmo sem o path no nome', () => {
      expect(decideIn(parent(false), 'start response')).toBe(SamplingDecision.NOT_RECORD);
   });

   it('filho de requisição amostrada segue amostrado', () => {
      expect(decideIn(parent(true), 'start response')).toBe(SamplingDecision.RECORD_AND_SAMPLED);
   });

   it('span raiz continua passando pelo filtro das probes', () => {
      expect(decideIn(ROOT_CONTEXT, 'GET /api/healthz')).toBe(SamplingDecision.NOT_RECORD);
      expect(decideIn(ROOT_CONTEXT, 'GET /api/v1/issues')).toBe(
         SamplingDecision.RECORD_AND_SAMPLED
      );
   });
});
