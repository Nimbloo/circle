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
import { AuthSessionProvider } from '@/components/providers/session-provider';
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
         </head>
         <body
            className={`${inter.variable} ${geistMono.variable} antialiased bg-background`}
            suppressHydrationWarning
         >
            <NuqsAdapter>
               <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                  <AuthSessionProvider>{children}</AuthSessionProvider>
                  <Toaster />
               </ThemeProvider>
            </NuqsAdapter>
         </body>
      </html>
   );
}
