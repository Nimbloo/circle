interface ContentSecurityPolicyOptions {
   cdnUrl: string;
   isDevelopment: boolean;
   /** Nonce da requisição: só scripts com ele (e os que eles carregam) executam. */
   nonce: string;
}

/** Nonce aleatório por requisição (128 bits, base64), Edge-safe. */
export function createNonce(): string {
   const bytes = crypto.getRandomValues(new Uint8Array(16));
   return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy({
   cdnUrl,
   isDevelopment,
   nonce,
}: ContentSecurityPolicyOptions): string {
   // Sem `unsafe-inline`: script injetado no HTML não tem o nonce e não roda. O
   // `strict-dynamic` libera os chunks que os scripts do Next (com nonce) carregam.
   const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
   if (isDevelopment) scriptSources.push("'unsafe-eval'");

   return [
      "default-src 'self'",
      `script-src ${scriptSources.join(' ')}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${cdnUrl}`,
      "font-src 'self' data:",
      "connect-src 'self' https://*.ingest.us.sentry.io",
      // Vídeos do editor de blocos: players embutidos (iframe) e arquivos .mp4/.webm por URL.
      'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com',
      "media-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
   ].join('; ');
}
