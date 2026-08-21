'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
   const callbackUrl = searchParams.get('callbackUrl') || '/';

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
            <div className="mb-6 flex justify-center">
               <NimblooLogo size={28} />
            </div>
            <Card>
               <CardHeader className="text-center">
                  <CardTitle className="text-2xl">Circle</CardTitle>
                  <CardDescription>by Nimbloo</CardDescription>
               </CardHeader>
               <CardContent className="flex flex-col gap-4">
                  <Button
                     type="button"
                     variant="outline"
                     className="w-full"
                     disabled={busy}
                     onClick={() => {
                        setGoogleLoading(true);
                        void signIn('google', { callbackUrl });
                     }}
                  >
                     {googleLoading ? 'Redirecionando…' : 'Continuar com Google'}
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

                  <p className="text-muted-foreground text-center text-sm">
                     Recebeu um convite?{' '}
                     <Link href="/signup" className="text-foreground font-medium hover:underline">
                        Criar conta
                     </Link>
                  </p>
               </CardContent>
            </Card>
         </div>
      </div>
   );
}
