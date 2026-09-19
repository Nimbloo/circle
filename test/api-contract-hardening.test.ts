import { describe, expect, it } from 'vitest';
import { handle } from '@/lib/api/http';
import { ApiError } from '@/lib/api/errors';

describe('ProblemDetail da API', () => {
   it('converte SyntaxError em 400 e preserva requestId como extension', async () => {
      const req = new Request('https://circle.test/api/v1/issues', {
         headers: { 'x-request-id': 'req-syntax' },
      });
      const response = await handle(async () => {
         throw new SyntaxError('JSON inválido');
      }, req);

      expect(response.status).toBe(400);
      expect(response.headers.get('content-type')).toContain('application/problem+json');
      expect(await response.json()).toMatchObject({
         title: 'Bad Request',
         status: 400,
         requestId: 'req-syntax',
      });
   });

   it('usa o título Payload Too Large para erros 413', async () => {
      const response = await handle(async () => {
         throw new ApiError(413, 'arquivo grande');
      });

      expect(response.status).toBe(413);
      expect(await response.json()).toMatchObject({ title: 'Payload Too Large', status: 413 });
   });
});
