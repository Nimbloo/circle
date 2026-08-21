'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** "G" oficial do Google (4 cores), independente de tema. */
function GoogleIcon({ className }: { className?: string }) {
   return (
      <svg className={className} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
         <path
            fill="#4285F4"
            d="M23.52 12.27c0-.82-.07-1.6-.2-2.36H12v4.46h6.47a5.53 5.53 0 0 1-2.4 3.63v3.01h3.88c2.27-2.09 3.57-5.17 3.57-8.74Z"
         />
         <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.08 7.95-2.92l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
         />
         <path
            fill="#FBBC05"
            d="M5.27 14.26a7.2 7.2 0 0 1 0-4.52V6.63H1.28a12 12 0 0 0 0 10.74l3.99-3.11Z"
         />
         <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.63l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
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
   const router = useRouter();
   const searchParams = useSearchParams();
   const rawCallback = searchParams.get('callbackUrl') || '/';
   // Anti open-redirect: só aceita path relativo same-origin (não `//evil.com` nem URL absoluta).
   const callbackUrl =
      rawCallback.startsWith('/') && !rawCallback.startsWith('//') ? rawCallback : '/';

   const [email, setEmail] = React.useState('');
   const [password, setPassword] = React.useState('');
   const [error, setError] = React.useState<string | null>(null);
   const [loading, setLoading] = React.useState(false);
   const [googleLoading, setGoogleLoading] = React.useState(false);

   async function onSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
         const res = await signIn('credentials', { email, password, redirect: false });
         if (res?.error) {
            setError('E-mail ou senha inválidos.');
            return;
         }
         router.push(callbackUrl);
      } catch {
         setError('Não foi possível entrar. Tente novamente.');
      } finally {
         setLoading(false);
      }
   }

   const busy = loading || googleLoading;

   return (
      <div className="bg-background flex min-h-svh items-center justify-center p-4">
         <div className="w-full max-w-sm">
            <Card>
               <CardHeader className="items-center text-center">
                  <CardTitle className="text-3xl font-semibold tracking-tight">Circle</CardTitle>
                  <div className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                     <span>by</span>
                     <NimblooLogo size={14} />
                  </div>
                  <CardDescription className="mt-3">Entre para continuar</CardDescription>
               </CardHeader>
               <CardContent className="flex flex-col gap-4">
                  <Button
                     type="button"
                     variant="outline"
                     className="w-full gap-2"
                     disabled={busy}
                     onClick={() => {
                        setGoogleLoading(true);
                        void signIn('google', { callbackUrl });
                     }}
                  >
                     <GoogleIcon className="size-4" />
                     {googleLoading ? 'Redirecionando…' : 'Entrar com Google'}
                  </Button>

                  <div className="flex items-center gap-3">
                     <div className="bg-border h-px flex-1" />
                     <span className="text-muted-foreground text-xs">ou</span>
                     <div className="bg-border h-px flex-1" />
                  </div>

                  <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                     <div className="flex flex-col gap-2">
                        <Label htmlFor="email">E-mail</Label>
                        <Input
                           id="email"
                           type="email"
                           autoComplete="email"
                           required
                           value={email}
                           onChange={(e) => setEmail(e.target.value)}
                           disabled={busy}
                        />
                     </div>
                     <div className="flex flex-col gap-2">
                        <Label htmlFor="password">Senha</Label>
                        <Input
                           id="password"
                           type="password"
                           autoComplete="current-password"
                           required
                           value={password}
                           onChange={(e) => setPassword(e.target.value)}
                           disabled={busy}
                        />
                     </div>

                     {error && (
                        <p role="alert" className="text-destructive text-sm">
                           {error}
                        </p>
                     )}

                     <Button type="submit" className="w-full" disabled={busy}>
                        {loading ? 'Entrando…' : 'Entrar'}
                     </Button>
                  </form>

                  <p className="text-muted-foreground text-center text-xs">
                     Acesso por convite ou e-mail @nimbloo.ai. Recebeu um convite? Use o link do
                     e-mail para definir sua senha.
                  </p>
               </CardContent>
            </Card>
         </div>
      </div>
   );
}
