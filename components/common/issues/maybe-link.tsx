import Link from 'next/link';
import type { ReactNode } from 'react';

/** `Link` quando há destino; `span` com o mesmo visual quando não (issue otimista). */
export function MaybeLink({
   href,
   className,
   children,
}: {
   href: string | null;
   className?: string;
   children: ReactNode;
}) {
   if (!href) return <span className={className}>{children}</span>;
   return (
      <Link href={href} className={className}>
         {children}
      </Link>
   );
}
