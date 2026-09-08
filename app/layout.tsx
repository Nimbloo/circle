import type { Metadata } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

// Inter é a fonte da UI do Linear — troca a Geist para fidelidade tipográfica.
const inter = Inter({
   variable: '--font-inter',
   subsets: ['latin'],
});

const geistMono = Geist_Mono({
   variable: '--font-geist-mono',
   subsets: ['latin'],
});

export const metadata: Metadata = {
   title: {
      template: '%s | Circle',
      default: 'Circle',
   },
   description:
      'Circle by Nimbloo — workspace para acompanhamento de issues, projetos e times com uma interface moderna e responsiva.',
   openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'Circle',
   },
   twitter: {
      card: 'summary_large_image',
   },
   keywords: ['circle', 'nimbloo', 'workspace', 'issues', 'projetos'],
};

import { ThemeProvider } from '@/components/layout/theme-provider';
import { applyStoredTheme } from '@/lib/theme-bootstrap';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export default function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   return (
      <html lang="en" suppressHydrationWarning>
         <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
            {/* Script BLOQUEANTE, antes do primeiro paint: aplica a variante de tema
                (`data-app-theme`) e as variáveis do tema custom lidas do localStorage.
                O next-themes já faz isso para a classe claro/escuro; a camada de
                variante do Circle não tinha equivalente e entrava só no `useEffect`,
                depois da hidratação — daí o flash com o tema anterior. */}
            <script dangerouslySetInnerHTML={{ __html: `(${applyStoredTheme.toString()})();` }} />
         </head>
         <body
            className={`${inter.variable} ${geistMono.variable} font-sans antialiased bg-background`}
            suppressHydrationWarning
         >
            <NuqsAdapter>
               {/* `defaultTheme` espelha o padrão do `useThemeStore` (`mode: 'system'`).
                   Com "dark" aqui, quem nunca escolheu tema e usa SO claro pintava
                   escuro e só depois da hidratação o ThemeApplier chamava
                   `setTheme('system')` e corrigia — um segundo flash, agora de
                   claro/escuro. O estado final é o mesmo; o que sai é o flash. */}
               <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                  {/* Sem SessionProvider: NADA no app consome `useSession` — quem
                      identifica o usuário é o `me` do bootstrap. O provider fazia um
                      GET /api/auth/session a cada carga de página (e outro a cada foco
                      da janela) para um dado que ninguém lia. `signOut` não depende
                      dele: usa a config de módulo do next-auth/react. */}
                  {children}
                  <Toaster />
               </ThemeProvider>
            </NuqsAdapter>
         </body>
      </html>
   );
}
