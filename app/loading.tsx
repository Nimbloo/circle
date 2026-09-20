import { CircleLoading } from '@/components/common/circle-loading';

/** Fallback de navegação das rotas públicas (login, convite) e da entrada no workspace. */
export default function Loading() {
   return (
      <div className="flex min-h-svh w-full items-center justify-center bg-background">
         <CircleLoading size="lg" label="Carregando…" />
      </div>
   );
}
