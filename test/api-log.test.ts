import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handle } from '@/lib/api/http';
import { ok } from '@/lib/api/response';
import { REQUEST_ID_HEADER, requestIdFrom } from '@/lib/api/log';

/**
 * O Fluent Bit já leva o stdout do pod para o Loki; o que faltava era o log ter CAMPOS.
 * Texto solto não se consulta — não dá para pedir "requisições acima de 1 s" nem seguir
 * uma requisição específica. Este teste trava o formato e a correlação.
 */
let linhas: string[];

function capturar() {
   linhas = [];
   const push = (...args: unknown[]) => void linhas.push(String(args[0]));
   vi.spyOn(console, 'log').mockImplementation(push);
   vi.spyOn(console, 'warn').mockImplementation(push);
   vi.spyOn(console, 'error').mockImplementation(push);
}

const req = (init: RequestInit = {}) => new Request('http://x/api/v1/issues/CORE-7', init);

/**
 * Tira o prefixo de timestamp e devolve o JSON. O prefixo existe porque o Fluent Bit do
 * cluster corta tudo até o primeiro espaço da linha — sem ele, a linha JSON chegava ao
 * Loki como `{}` (medido em produção: 72 linhas vazias em 24h).
 */
const semPrefixo = (linha: string) => JSON.parse(linha.slice(linha.indexOf(' ') + 1));

beforeEach(capturar);
afterEach(() => vi.restoreAllMocks());

describe('log estruturado das rotas', () => {
   it('emite uma linha JSON com rota normalizada, status e duração', async () => {
      const res = await handle(async () => ok({ ok: true }), req());
      const linha = linhas.map(semPrefixo).find((l) => l.msg?.startsWith('<<'));

      expect(linha).toMatchObject({
         level: 'info',
         method: 'GET',
         route: '/api/v1/issues/:id', // identificador normalizado: cardinalidade fechada
         status: 200,
      });
      expect(typeof linha.durationMs).toBe('number');
      expect(linha.requestId).toEqual(expect.any(String));
      expect(res.headers.get(REQUEST_ID_HEADER)).toBe(linha.requestId);
   });

   it('respeita o x-request-id do chamador (rastro atravessa serviços)', async () => {
      const res = await handle(
         async () => ok({ ok: true }),
         req({ headers: { [REQUEST_ID_HEADER]: 'req-abc-123' } })
      );
      expect(res.headers.get(REQUEST_ID_HEADER)).toBe('req-abc-123');
      expect(linhas.some((l) => l.includes('req-abc-123'))).toBe(true);
   });

   it('ignora um x-request-id hostil e gera um novo', () => {
      const gigante = 'x'.repeat(200);
      expect(requestIdFrom(req({ headers: { [REQUEST_ID_HEADER]: gigante } }))).not.toBe(gigante);
      expect(
         requestIdFrom(req({ headers: { [REQUEST_ID_HEADER]: 'quebra"json\n' } }))
      ).not.toContain('"');
   });

   it('erro não tratado vira linha de erro com o MESMO requestId da requisição', async () => {
      const res = await handle(async () => {
         throw new Error('estourou');
      }, req());

      const eventos = linhas.map(semPrefixo);
      const erro = eventos.find((l) => l.msg === 'erro não tratado');
      const requisicao = eventos.find((l) => l.msg?.startsWith('<<'));

      expect(erro).toMatchObject({ level: 'error', error: 'Error: estourou' });
      expect(erro.requestId).toBe(requisicao.requestId); // é o que casa as duas linhas
      expect(requisicao.status).toBe(500);
      expect(res.headers.get(REQUEST_ID_HEADER)).toBe(erro.requestId);
   });

   it('a resposta continua íntegra depois de passar pelo logger', async () => {
      const res = await handle(async () => ok({ nome: 'circle' }), req());
      expect(await res.json()).toEqual({ data: { nome: 'circle' } });
   });
});

describe('formato que sobrevive ao pipeline de log', () => {
   it('a linha começa com timestamp + espaço, e o resto é JSON válido', async () => {
      await handle(async () => ok({ ok: true }), req());
      const linha = linhas.find((l) => l.includes('"msg"'))!;

      // É EXATAMENTE o que o Lua do Fluent Bit faz: corta até o primeiro espaço.
      const [prefixo, ...resto] = linha.split(' ');
      expect(new Date(prefixo).toISOString()).toBe(prefixo); // timestamp ISO de verdade

      const json = JSON.parse(resto.join(' ')); // o que chega ao Loki
      expect(json.msg).toContain('<<');
      expect(json.requestId).toEqual(expect.any(String));
   });
});
