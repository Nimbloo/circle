import { db } from '@/db';
import { notFound } from '@/lib/api/response';
import { handle, requireEmail } from '@/lib/api/http';
import { getAvatar } from '@/lib/api/avatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * GET /users/{id}/avatar — serve os bytes da foto de perfil (decodifica o base64).
 * 404 (problem+json) se o usuário não tiver foto. Exige sessão no próprio handler
 * (o browser manda o cookie no `<img>`), além do gate do middleware.
 */
export async function GET(req: Request, { params }: Params) {
   return handle(async () => {
      await requireEmail(req);
      const { id } = await params;
      const avatar = await getAvatar(db, id);
      if (!avatar) return notFound('Avatar não encontrado');
      const bytes = Buffer.from(avatar.data, 'base64');
      return new Response(new Uint8Array(bytes), {
         status: 200,
         headers: {
            'content-type': avatar.contentType,
            // nosniff: o content-type é validado contra allowlist de imagem no upload,
            // mas os bytes não; impede o browser de re-interpretar o conteúdo.
            'x-content-type-options': 'nosniff',
            // A avatar_url carrega cache-bust (?v=timestamp) que muda a cada upload,
            // então a versão servida é imutável — cache privado agressivo é seguro.
            'cache-control': 'private, max-age=86400',
         },
      });
   });
}
