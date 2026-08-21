import { describe, it, expect } from 'vitest';
import { getMetrics, observeHttp } from '@/lib/metrics';

describe('metrics', () => {
   it('expõe process metrics + http counter/histogram no formato Prometheus', async () => {
      observeHttp('GET', 200, 0.12);
      observeHttp('POST', 500, 0.4);
      const text = await getMetrics().registry.metrics();

      // process/node defaults
      expect(text).toContain('process_cpu_seconds_total');
      expect(text).toContain('nodejs_eventloop_lag_seconds');
      // http custom com common label application="circle"
      expect(text).toContain('http_requests_total');
      expect(text).toContain('http_request_duration_seconds_bucket');
      expect(text).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*status="200"[^}]*\}/);
      expect(text).toMatch(/application="circle"/);
   });
});
