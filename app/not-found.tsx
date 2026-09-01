import { ErrorState } from '@/components/common/error-state';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NotFound() {
   return (
      <ErrorState
         role="status"
         title="Página não encontrada"
         description="Este endereço pode estar incorreto ou o conteúdo pode ter sido removido."
         action={
            <Button asChild>
               <Link href="/">Voltar ao início</Link>
            </Button>
         }
      />
   );
}
