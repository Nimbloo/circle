import { CircleLoading } from '@/components/common/circle-loading';
import { cn } from '@/lib/utils';

/** Altura de uma linha de lista (h-11): `rows` reserva o espaço do conteúdo que vem. */
const ROW_PX = 44;

/**
 * Área carregando: o `CircleLoading` centralizado num bloco com a altura aproximada do
 * conteúdo (`rows` linhas de lista), para a troca loading → conteúdo não pular a tela.
 */
export function LoadingArea({
   rows = 6,
   size = 'md',
   label,
   className,
}: {
   rows?: number;
   /** Nome acessível (e texto visível) do loading; sem ele, "Carregando". */
   label?: string;
   size?: 'sm' | 'md' | 'lg';
   className?: string;
}) {
   return (
      <div
         className={cn('flex w-full items-center justify-center', className)}
         style={{ minHeight: rows * ROW_PX }}
      >
         <CircleLoading size={size} label={label} />
      </div>
   );
}
