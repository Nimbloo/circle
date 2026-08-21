import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
   /* config options here */
   output: 'standalone',
   devIndicators: false,
   // pg/bcryptjs usam APIs de Node. Com o middleware criando um runtime Edge, o webpack
   // tentava bundlar o `pg` (via instrumentation → @/db) pro Edge e quebrava em
   // `Can't resolve 'fs'/'path'/'stream'`. Externaliza + no bundle EDGE resolve os
   // node-builtins pra `false` (o código node-only nunca EXECUTA no Edge: o middleware
   // usa só a sessão JWT, e o `register()` da instrumentation é gated em NEXT_RUNTIME).
   serverExternalPackages: ['pg', 'bcryptjs'],
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
