import type { NextConfig } from 'next';

// Headers de segurança em toda resposta (defesa em profundidade além do gateway Istio).
// CSP permite o mínimo do Next (styles inline do runtime; imagens data:/blob: pro avatar
// base64 + o CDN CloudFront pros custom emojis) e bloqueia embedding + framing de terceiros.
// CDN: lido de env no build; fallback pro domínio da distribution (estável).
const CDN = (process.env.CIRCLE_CDN_URL || 'https://d23ibma5syugvj.cloudfront.net').replace(
   /\/$/,
   ''
);
// Em DEV o Fast Refresh do Next (react-refresh) usa `eval` e o HMR usa websocket —
// libera 'unsafe-eval' + ws: SOMENTE em desenvolvimento. Prod segue estrito.
const isDev = process.env.NODE_ENV === 'development';
const CSP = [
   "default-src 'self'",
   `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
   "style-src 'self' 'unsafe-inline'",
   `img-src 'self' data: blob: ${CDN}`,
   "font-src 'self' data:",
   `connect-src 'self'${isDev ? ' ws: http://localhost:*' : ''}`,
   "frame-ancestors 'none'",
   "base-uri 'self'",
   "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
   { key: 'Content-Security-Policy', value: CSP },
   { key: 'X-Frame-Options', value: 'DENY' },
   { key: 'X-Content-Type-Options', value: 'nosniff' },
   { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
   {
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
   },
];

const nextConfig: NextConfig = {
   /* config options here */
   output: 'standalone',
   devIndicators: false,
   // Tree-shake barrels grandes (ícones/UI/charts) — só o que é usado entra no chunk.
   experimental: {
      optimizePackageImports: ['lucide-react', 'react-icons', 'recharts', '@radix-ui/react-icons'],
   },
   async headers() {
      return [{ source: '/:path*', headers: SECURITY_HEADERS }];
   },
   // pg/bcryptjs usam APIs de Node. Com o middleware criando um runtime Edge, o webpack
   // tentava bundlar o `pg` (via instrumentation → @/db) pro Edge e quebrava em
   // `Can't resolve 'fs'/'path'/'stream'`. Externaliza + no bundle EDGE resolve os
   // node-builtins pra `false` (o código node-only nunca EXECUTA no Edge: o middleware
   // usa só a sessão JWT, e o `register()` da instrumentation é gated em NEXT_RUNTIME).
   serverExternalPackages: ['pg', 'bcryptjs', 'prom-client'],
   webpack: (config, { nextRuntime, webpack }) => {
      // Tudo que NÃO é o runtime Node (edge + qualquer compilação de instrumentation
      // fora do node) não deve tentar resolver pg/node-builtins.
      if (nextRuntime !== 'nodejs') {
         // Especificadores `node:` (ex.: `node:crypto`) não são resolvíveis no Edge
         // (UnhandledSchemeError). Tira o prefixo → cai no fallback abaixo (=false).
         config.plugins = config.plugins || [];
         config.plugins.push(
            new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
               resource.request = resource.request.replace(/^node:/, '');
            })
         );
         // No bundle EDGE (middleware), a instrumentation puxa @/db → pg, que usa
         // dezenas de node-builtins. Como o Edge NUNCA executa isso (o register() é
         // gated em NEXT_RUNTIME e o middleware só lê a sessão JWT), aliasamos o pg e
         // o migrator node-postgres pra `false` (módulo vazio) → corta a cadeia toda,
         // sem caçar node-builtin por node-builtin.
         config.resolve = config.resolve || {};
         config.resolve.alias = {
            ...(config.resolve.alias || {}),
            'pg': false,
            'pg-native': false,
            'drizzle-orm/node-postgres': false,
            'drizzle-orm/node-postgres/migrator': false,
         };
         // Fallback abrangente: qualquer node-builtin que o código node-only (pg &
         // família, via instrumentation) referencie no bundle Edge resolve pra `false`
         // (módulo vazio). O Edge NUNCA executa esse caminho (register() é gated).
         const NODE_BUILTINS = [
            'fs',
            'fs/promises',
            'path',
            'os',
            'crypto',
            'stream',
            'stream/promises',
            'string_decoder',
            'util',
            'util/types',
            'events',
            'buffer',
            'assert',
            'net',
            'tls',
            'dns',
            'dns/promises',
            'http',
            'https',
            'http2',
            'zlib',
            'url',
            'querystring',
            'child_process',
            'cluster',
            'dgram',
            'module',
            'perf_hooks',
            'async_hooks',
            'timers',
            'timers/promises',
            'tty',
            'vm',
            'constants',
            'process',
            'punycode',
         ];
         config.resolve.fallback = {
            ...(config.resolve.fallback || {}),
            ...Object.fromEntries(NODE_BUILTINS.map((m) => [m, false])),
         };
      }
      return config;
   },
};

export default nextConfig;
