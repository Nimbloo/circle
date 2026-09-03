interface ContentSecurityPolicyOptions {
   cdnUrl: string;
   isDevelopment: boolean;
}

export function buildContentSecurityPolicy({
   cdnUrl,
   isDevelopment,
}: ContentSecurityPolicyOptions): string {
   const scriptSources = ["'self'", "'unsafe-inline'"];
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
