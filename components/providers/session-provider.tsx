'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Wrapper client do `SessionProvider` do NextAuth para uso no App Router.
 * O `layout.tsx` (Server Component) não pode importar o provider direto porque
 * ele depende de Context; embrulhamos aqui com `'use client'` e re-exportamos.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
   return <SessionProvider>{children}</SessionProvider>;
}
