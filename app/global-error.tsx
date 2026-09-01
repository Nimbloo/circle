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
      <html lang="pt-BR">
         <head>
            <style>{`
               .global-error-button:focus-visible {
                  outline: 2px solid #7c85e6;
                  outline-offset: 2px;
               }
               @media (prefers-reduced-motion: reduce) {
                  .global-error-button { transition: none !important; }
               }
            `}</style>
         </head>
         <body
            style={{
               margin: 0,
               minHeight: '100vh',
               display: 'flex',
               flexDirection: 'column',
               alignItems: 'center',
               justifyContent: 'center',
               padding: '1.5rem',
               textAlign: 'center',
               background: '#0e0f11',
               color: '#f7f8f8',
               fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
            }}
         >
            <div
               aria-hidden="true"
               style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  display: 'grid',
                  placeItems: 'center',
                  marginBottom: '1.25rem',
                  border: '1px solid #27282d',
                  borderRadius: '0.625rem',
                  background: '#18191d',
                  color: '#8a8f98',
                  fontSize: '1.125rem',
               }}
            >
               !
            </div>
            <main role="alert" aria-labelledby="global-error-title">
               <h1
                  id="global-error-title"
                  style={{ fontSize: '1.125rem', fontWeight: 500, margin: 0 }}
               >
                  Não foi possível carregar o Circle
               </h1>
               <p
                  style={{
                     fontSize: '0.8125rem',
                     lineHeight: 1.5,
                     color: '#8a8f98',
                     maxWidth: '28rem',
                     margin: '0.375rem 0 0',
                  }}
               >
                  Ocorreu um erro inesperado. Tente novamente para recarregar a aplicação.
               </p>
            </main>
            <button
               className="global-error-button"
               type="button"
               onClick={() => reset()}
               style={{
                  marginTop: '1.25rem',
                  padding: '0.5rem 0.875rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #727cd8',
                  background: '#5e6ad2',
                  color: '#ffffff',
                  fontSize: '0.8125rem',
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
