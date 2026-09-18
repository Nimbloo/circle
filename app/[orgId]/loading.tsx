import { CircleLoading } from '@/components/common/circle-loading';

/**
 * Fallback de navegação do workspace. Fica DENTRO do `[orgId]/layout` (sidebar, SSE e
 * stores seguem montados) e imita o frame do `MainLayout`, então só a área de conteúdo
 * troca. Telas que já conhecem o formato futuro continuam com seus skeletons.
 */
export default function OrgLoading() {
   return (
      <main className="flex h-full w-full items-center justify-center bg-container lg:rounded-xl lg:border lg:border-border/60">
         <CircleLoading label="Carregando…" />
      </main>
   );
}
