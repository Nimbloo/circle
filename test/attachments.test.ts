import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';

// Mocka o storage S3/CDN — testamos serviço e rota sem rede.
const s3 = vi.hoisted(() => ({
   putAsset: vi.fn(async (key: string) => `https://cdn.test/${key}`),
   deleteAsset: vi.fn(async () => undefined),
}));
vi.mock('@/lib/api/s3-assets', () => ({
   assetsConfigured: () => true,
   putAsset: s3.putAsset,
   deleteAsset: s3.deleteAsset,
   assetKeyFromUrl: (url: string) =>
      url.startsWith('https://cdn.test/') ? url.slice('https://cdn.test/'.length) : null,
}));

import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { attachment as attachmentT } from '@/db/schema';
import { createIssue, deleteIssue } from '@/lib/api/issues';
import { addComment, deleteComment, getIssueDetail, listComments } from '@/lib/api/issue-detail';
import {
   createAttachment,
   deleteAttachment,
   listIssueAttachments,
   type AttachmentFile,
} from '@/lib/api/attachments';
import { MAX_ATTACHMENT_BYTES, resolveAttachmentType } from '@/lib/attachment-types';
import { __setTestDb } from '@/db';
import { POST as postAttachment } from '@/app/api/v1/attachments/route';

const ANA = 'ana@nimbloo.ai';
const BOB = 'bob@nimbloo.ai';
const DAN = 'dan@nimbloo.ai';

const PNG = Buffer.from(
   'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
   'base64'
);

function file(name: string, type: string, bytes: Buffer = Buffer.from('conteudo')): AttachmentFile {
   return { name, type, bytes };
}

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA });
   await seedUser(db, { name: 'Bob', email: BOB });
   await seedUser(db, { name: 'Dan', email: DAN, role: 'Admin' });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id };
}

beforeEach(() => {
   s3.putAsset.mockClear();
   s3.deleteAsset.mockClear();
});

describe('allow-list de anexos (MIME + extensão)', () => {
   it('aceita os tipos da lista e normaliza o MIME canônico', () => {
      expect(resolveAttachmentType('a.png', 'image/png')?.kind).toBe('image');
      expect(resolveAttachmentType('a.PDF', 'application/pdf')?.ext).toBe('pdf');
      expect(resolveAttachmentType('notas.md', '')?.contentType).toBe('text/markdown');
      expect(resolveAttachmentType('dados.csv', 'application/vnd.ms-excel')?.kind).toBe('text');
      expect(resolveAttachmentType('x.zip', 'application/x-zip-compressed')?.contentType).toBe(
         'application/zip'
      );
      expect(resolveAttachmentType('v.mp4', 'video/mp4')?.kind).toBe('video');
      expect(
         resolveAttachmentType(
            'd.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
         )?.kind
      ).toBe('document');
   });

   it('bloqueia svg/html/js/executáveis e MIME incompatível com a extensão', () => {
      expect(resolveAttachmentType('a.svg', 'image/svg+xml')).toBeNull();
      expect(resolveAttachmentType('a.html', 'text/html')).toBeNull();
      expect(resolveAttachmentType('a.js', 'text/javascript')).toBeNull();
      expect(resolveAttachmentType('a.exe', 'application/octet-stream')).toBeNull();
      expect(resolveAttachmentType('a.sh', '')).toBeNull();
      expect(resolveAttachmentType('semext', 'image/png')).toBeNull();
      // extensão ok, MIME de outro tipo → recusa (não confia só no nome)
      expect(resolveAttachmentType('a.pdf', 'image/png')).toBeNull();
      expect(resolveAttachmentType('a.png', 'text/html')).toBeNull();
   });
});

describe('createAttachment', () => {
   it('sobe em uploads/<uuid>.<ext>, grava e devolve o DTO (imagem sem Content-Disposition)', async () => {
      const { db, issueId } = await setup();
      const dto = await createAttachment(
         db,
         { issueId, file: file('foto.png', 'image/png', PNG) },
         ANA
      );
      expect(dto.url).toMatch(/^https:\/\/cdn\.test\/uploads\/[0-9a-f-]{36}\.png$/);
      expect(dto.fileName).toBe('foto.png');
      expect(dto.contentType).toBe('image/png');
      expect(dto.size).toBe(PNG.length);
      expect(dto.commentId).toBeNull();
      expect(dto.uploadedBy?.email).toBe(ANA);
      expect(s3.putAsset).toHaveBeenCalledWith(expect.any(String), PNG, 'image/png', {
         contentDisposition: undefined,
      });
      expect(await listIssueAttachments(db, issueId)).toHaveLength(1);
   });

   it('não-imagem sobe com Content-Disposition: attachment', async () => {
      const { db, issueId } = await setup();
      await createAttachment(db, { issueId, file: file('doc.pdf', 'application/pdf') }, ANA);
      expect(s3.putAsset.mock.calls[0][3]).toEqual({
         contentDisposition: 'attachment; filename="doc.pdf"',
      });
   });

   it('recusa tipo fora da lista (400) e acima de 25 MB (413), sem subir nada', async () => {
      const { db, issueId } = await setup();
      await expect(
         createAttachment(db, { issueId, file: file('x.svg', 'image/svg+xml') }, ANA)
      ).rejects.toMatchObject({ status: 400 });
      await expect(
         createAttachment(db, { issueId, file: file('x.exe', 'application/octet-stream') }, ANA)
      ).rejects.toMatchObject({ status: 400 });
      await expect(
         createAttachment(
            db,
            {
               issueId,
               file: file('big.txt', 'text/plain', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1)),
            },
            ANA
         )
      ).rejects.toMatchObject({ status: 413 });
      expect(s3.putAsset).not.toHaveBeenCalled();
   });

   it('issue inexistente → 404; comentário de outra issue → 404', async () => {
      const { db, issueId } = await setup();
      await expect(
         createAttachment(db, { issueId: 'nope', file: file('a.txt', 'text/plain') }, ANA)
      ).rejects.toMatchObject({ status: 404 });
      const other = await createIssue(
         db,
         { teamId: 'CORE', title: 'Y', statusId: 'to-do', priorityId: 'low' },
         ANA
      );
      const c = await addComment(db, other.id, 'oi', ANA);
      await expect(
         createAttachment(db, { issueId, commentId: c.id, file: file('a.txt', 'text/plain') }, ANA)
      ).rejects.toMatchObject({ status: 404 });
   });

   it('anexo de comentário aparece no CommentDto e não na lista da issue', async () => {
      const { db, issueId } = await setup();
      const c = await addComment(db, issueId, 'oi', ANA);
      const a = await createAttachment(
         db,
         { issueId, commentId: c.id, file: file('a.txt', 'text/plain') },
         ANA
      );
      const [listed] = await listComments(db, issueId);
      expect(listed.attachments.map((x) => x.id)).toEqual([a.id]);
      expect(await listIssueAttachments(db, issueId)).toHaveLength(0);

      await createAttachment(db, { issueId, file: file('b.txt', 'text/plain') }, ANA);
      const detail = await getIssueDetail(db, issueId);
      expect(detail?.attachments.map((x) => x.fileName)).toEqual(['b.txt']);
   });
});

describe('deleteAttachment / cascades', () => {
   it('uploader remove (S3 best-effort); terceiro 403; admin remove', async () => {
      const { db, issueId } = await setup();
      const a = await createAttachment(db, { issueId, file: file('a.txt', 'text/plain') }, ANA);
      const b = await createAttachment(db, { issueId, file: file('b.txt', 'text/plain') }, ANA);

      await expect(deleteAttachment(db, a.id, BOB)).rejects.toMatchObject({ status: 403 });
      expect(await deleteAttachment(db, a.id, ANA)).toBe(true);
      expect(await deleteAttachment(db, b.id, DAN)).toBe(true);
      expect(await deleteAttachment(db, a.id, ANA)).toBe(false);
      expect(await listIssueAttachments(db, issueId)).toHaveLength(0);
      await new Promise((r) => setTimeout(r, 10));
      expect(s3.deleteAsset).toHaveBeenCalledTimes(2);
      expect(s3.deleteAsset.mock.calls[0][0]).toMatch(/^uploads\/.*\.txt$/);
   });

   it('excluir o comentário leva os anexos dele', async () => {
      const { db, issueId } = await setup();
      const c = await addComment(db, issueId, 'oi', ANA);
      await createAttachment(
         db,
         { issueId, commentId: c.id, file: file('a.txt', 'text/plain') },
         ANA
      );
      await deleteComment(db, c.id, ANA);
      expect(
         await db.select().from(attachmentT).where(eq(attachmentT.issueId, issueId))
      ).toHaveLength(0);
   });

   it('excluir a issue faz cascade nos anexos', async () => {
      const { db, issueId } = await setup();
      await createAttachment(db, { issueId, file: file('a.txt', 'text/plain') }, ANA);
      const c = await addComment(db, issueId, 'oi', ANA);
      await createAttachment(
         db,
         { issueId, commentId: c.id, file: file('b.txt', 'text/plain') },
         ANA
      );
      expect(await deleteIssue(db, issueId)).toBe(true);
      expect(await db.select().from(attachmentT)).toHaveLength(0);
   });
});

describe('POST /attachments (multipart)', () => {
   function post(form: FormData, email: string | null = ANA) {
      return new Request('http://x/api/v1/attachments', {
         method: 'POST',
         headers: email ? { 'x-forwarded-email': email } : undefined,
         body: form,
      });
   }

   it('sobe o arquivo do form e devolve o DTO', async () => {
      const { db, issueId } = await setup();
      __setTestDb(db);
      try {
         const form = new FormData();
         form.set('file', new File([PNG], 'foto.png', { type: 'image/png' }));
         form.set('issueId', issueId);
         const res = await postAttachment(post(form));
         expect(res.status).toBe(200);
         const { data } = await res.json();
         expect(data.fileName).toBe('foto.png');
         expect(data.url).toMatch(/\.png$/);
      } finally {
         __setTestDb(null);
      }
   });

   it('sem autenticação → 401; sem file → 400', async () => {
      const form = new FormData();
      form.set('issueId', 'x');
      expect((await postAttachment(post(form, null))).status).toBe(401);
      expect((await postAttachment(post(form))).status).toBe(400);
   });
});
