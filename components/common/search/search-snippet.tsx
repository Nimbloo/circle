'use client';

/**
 * Renderiza o snippet vindo de `/api/v1/search`. O servidor já escapou o conteúdo e
 * deixou `<mark>` como ÚNICA tag possível (ver `lib/api/search.ts`), então o
 * `dangerouslySetInnerHTML` aqui não abre superfície de XSS — e é o que permite o
 * destaque no meio do texto sem reimplementar o `ts_headline` no cliente.
 */
export function SearchSnippet({ html, className = '' }: { html: string; className?: string }) {
   if (!html) return null;
   return (
      <p
         className={`truncate text-xs text-muted-foreground [&_mark]:rounded-[2px] [&_mark]:bg-transparent [&_mark]:px-0 [&_mark]:font-medium [&_mark]:text-foreground ${className}`}
         dangerouslySetInnerHTML={{ __html: html }}
      />
   );
}
