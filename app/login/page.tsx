'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

import { CircleLogo } from '@/components/brand/circle-logo';
import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Logo oficial "G" do Google (4 cores). Tamanho controlado pelo container. */
function GoogleGlyph({ className }: { className?: string }) {
   return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
         <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
         />
         <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
         />
         <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
         />
         <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
         />
      </svg>
   );
}

// useSearchParams exige Suspense boundary (CSR bailout do Next no prerender).
export default function LoginPage() {
   return (
      <React.Suspense fallback={null}>
         <LoginForm />
      </React.Suspense>
   );
}

function LoginForm() {
   const searchParams = useSearchParams();
   const rawCallback = searchParams.get('callbackUrl') || '/';
   // Anti open-redirect: só aceita path relativo same-origin (não `//evil.com` nem URL absoluta).
   const callbackUrl =
      rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';

   const [loading, setLoading] = React.useState(false);
   // Conta desativada (#100): o callback `signIn` redireciona pra cá com este erro.
   const deactivated = searchParams.get('error') === 'deactivated';

   return (
      <div className="bg-background flex min-h-svh items-center justify-center p-4">
         <div className="w-full max-w-sm">
            <Card>
               <CardHeader className="items-center text-center">
                  <CardTitle className="flex items-center gap-2.5 text-3xl font-semibold tracking-tight">
                     <CircleLogo size={30} className="text-foreground" />
                     Circle
                  </CardTitle>
                  <div className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                     <span>by</span>
                     <NimblooLogo size={13} />
                  </div>
                  <CardDescription className="mt-3">Entre para continuar</CardDescription>
               </CardHeader>
               <CardContent className="flex flex-col gap-4">
                  {deactivated && (
                     <p
                        role="alert"
                        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive"
                     >
                        Sua conta foi desativada. Fale com um admin do workspace.
                     </p>
                  )}
                  <button
                     type="button"
                     disabled={loading}
                     onClick={() => {
                        setLoading(true);
                        void signIn('keycloak', { callbackUrl });
                     }}
                     className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white text-sm font-medium text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f8f9fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4285F4]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-[#1f1f22] dark:text-[#e3e3e3] dark:shadow-none dark:hover:bg-[#26262b]"
                  >
                     {loading ? (
                        <Loader2 className="size-[18px] animate-spin text-muted-foreground" />
                     ) : (
                        <GoogleGlyph className="size-[18px]" />
                     )}
                     {loading ? 'Redirecionando…' : 'Entrar com o Google'}
                  </button>

                  <p className="text-muted-foreground text-center text-xs">
                     Acesso restrito a quem tem permissão no Circle. Sem acesso? Fale com um admin.
                  </p>
               </CardContent>
            </Card>
         </div>
      </div>
   );
}
