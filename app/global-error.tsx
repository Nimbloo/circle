'use client';

import { useEffect } from 'react';

/**
 * Boundary de último recurso: captura erros no root layout (acima de
 * [orgId]/error.tsx). Substitui o RootLayout, então precisa renderizar a
 * própria <html>/<body> e não pode depender do globals.css / providers —
 * por isso os estilos são inline.
 */
export default function GlobalError({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   useEffect(() => {
      console.error(error);
   }, [error]);

   return (
      <html lang="en">
         <body
            style={{
               margin: 0,
               minHeight: '100vh',
               display: 'flex',
               flexDirection: 'column',
               alignItems: 'center',
               justifyContent: 'center',
               gap: '1rem',
               padding: '1.5rem',
               textAlign: 'center',
               background: '#0a0a0a',
               color: '#ededed',
               fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            }}
         >
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Algo deu errado</h2>
            <p style={{ fontSize: '0.875rem', color: '#a1a1a1', maxWidth: '28rem', margin: 0 }}>
               Ocorreu um erro inesperado. Você pode tentar novamente.
            </p>
            <button
               type="button"
               onClick={() => reset()}
               style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #2a2a2a',
                  background: '#ededed',
                  color: '#0a0a0a',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
               }}
            >
               Tentar de novo
            </button>
         </body>
      </html>
   );
}
