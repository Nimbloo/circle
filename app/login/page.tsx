'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

import { CircleLogo } from '@/components/brand/circle-logo';
import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
                  <Button
                     type="button"
                     className="w-full"
                     disabled={loading}
                     onClick={() => {
                        setLoading(true);
                        void signIn('keycloak', { callbackUrl });
                     }}
                  >
                     {loading ? 'Redirecionando…' : 'Entrar com SSO Nimbloo'}
                  </Button>

                  <p className="text-muted-foreground text-center text-xs">
                     Acesso via SSO, restrito a quem tem permissão no Circle. Sem acesso? Fale com
                     um admin.
                  </p>
               </CardContent>
            </Card>
         </div>
      </div>
   );
}
