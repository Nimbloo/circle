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

function messageForStatus(status: number): string {
   switch (status) {
      case 403:
         return 'Convite inválido ou expirado. Peça um novo convite a um admin.';
      case 409:
         return 'Este e-mail já tem cadastro. Faça login.';
      case 400:
         return 'Dados inválidos. Verifique o e-mail e a senha (mínimo 8 caracteres).';
      default:
         return 'Não foi possível criar a conta. Tente novamente.';
   }
}

// useSearchParams exige Suspense boundary (CSR bailout do Next no prerender).
export default function SignupPage() {
   return (
      <React.Suspense fallback={null}>
         <SignupForm />
      </React.Suspense>
   );
}

function SignupForm() {
   const router = useRouter();
   const searchParams = useSearchParams();
   const email = searchParams.get('email') ?? '';
   const token = searchParams.get('token') ?? '';
   const hasInvite = token.length > 0;

   const [password, setPassword] = React.useState('');
   const [confirm, setConfirm] = React.useState('');
   const [error, setError] = React.useState<string | null>(null);
   const [loading, setLoading] = React.useState(false);

   async function onSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);

      if (!hasInvite) {
         setError('Convite inválido ou expirado. Peça um novo convite a um admin.');
         return;
      }
      if (password.length < 8) {
         setError('A senha deve ter no mínimo 8 caracteres.');
         return;
      }
      if (password !== confirm) {
         setError('As senhas não conferem.');
         return;
      }

      setLoading(true);
      try {
         const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password, token }),
         });

         if (!res.ok) {
            setError(messageForStatus(res.status));
            return;
         }

         const signInRes = await signIn('credentials', { email, password, redirect: false });
         if (signInRes?.error) {
            setError('Conta criada, mas o login falhou. Tente entrar manualmente.');
            return;
         }
         router.push('/');
      } catch {
         setError('Não foi possível criar a conta. Tente novamente.');
      } finally {
         setLoading(false);
      }
   }

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
                  {!hasInvite ? (
                     <p role="alert" className="text-destructive text-center text-sm">
                        Convite inválido ou expirado. Peça um novo convite a um admin.
                     </p>
                  ) : (
                     <form className="flex flex-col gap-4" onSubmit={onSubmit}>
                        <div className="flex flex-col gap-2">
                           <Label htmlFor="email">E-mail</Label>
                           <Input
                              id="email"
                              type="email"
                              autoComplete="email"
                              readOnly
                              value={email}
                           />
                        </div>
                        <div className="flex flex-col gap-2">
                           <Label htmlFor="password">Senha</Label>
                           <Input
                              id="password"
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              disabled={loading}
                           />
                        </div>
                        <div className="flex flex-col gap-2">
                           <Label htmlFor="confirm">Confirmar senha</Label>
                           <Input
                              id="confirm"
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              required
                              value={confirm}
                              onChange={(e) => setConfirm(e.target.value)}
                              disabled={loading}
                           />
                        </div>

                        {error && (
                           <p role="alert" className="text-destructive text-sm">
                              {error}
                           </p>
                        )}

                        <Button type="submit" className="w-full" disabled={loading}>
                           {loading ? 'Criando conta…' : 'Criar conta'}
                        </Button>
                     </form>
                  )}

                  <p className="text-muted-foreground text-center text-sm">
                     Já tem conta?{' '}
                     <Link href="/login" className="text-foreground font-medium hover:underline">
                        Entrar
                     </Link>
                  </p>
               </CardContent>
            </Card>
         </div>
      </div>
   );
}
