/**
 * Mensagem de toast que mostra o MOTIVO que o servidor deu (ad#11). Erro 4xx da API traz
 * um `detail` legível (“Label 'Bug' já existe”, “destino privado não é permitido”); o
 * toast genérico escondia isso. 5xx, rede e erros sem status ficam no texto genérico.
 *
 * Duck-typing em vez de `instanceof ApiError`: os testes mockam `@/lib/client`, e o
 * helper não pode quebrar quando o mock não exporta a classe.
 */
export function errorReason(err: unknown, fallback: string): string {
   if (!err || typeof err !== 'object') return fallback;
   const status = (err as { status?: unknown }).status;
   const message = (err as { message?: unknown }).message;
   if (typeof status !== 'number' || status < 400 || status >= 500) return fallback;
   if (typeof message !== 'string' || !message.trim()) return fallback;
   return `${fallback}: ${message.trim()}`;
}
