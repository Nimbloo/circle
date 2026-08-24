import Link from 'next/link';

import { NimblooLogo } from '@/components/brand/nimbloo-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Cadastro por convite nativo foi desativado — acesso agora é via SSO (Keycloak). */
export default function SignupPage() {
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
                  <p role="alert" className="text-muted-foreground text-center text-sm">
                     Cadastro por convite foi desativado — o acesso agora é via SSO. Fale com um
                     admin.
                  </p>
                  <Button asChild className="w-full">
                     <Link href="/login">Ir para o login</Link>
                  </Button>
               </CardContent>
            </Card>
         </div>
      </div>
   );
}
