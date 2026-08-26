import { describe, it, expect } from 'vitest';
import { makeTestDb } from './helpers/db';
import { seedTeam, seedUser } from './helpers/fixtures';
import { createIssue } from '@/lib/api/issues';
import {
   addAttachment,
   listAttachments,
   getAttachmentBytes,
   removeAttachment,
} from '@/lib/api/attachments';

const ANA = 'ana@nimbloo.ai';
const PNG_DATA_URL = 'data:image/png;base64,aGVsbG8='; // "hello"

async function setup() {
   const db = await makeTestDb();
   await seedTeam(db, 'CORE');
   await seedUser(db, { name: 'Ana', email: ANA });
   const issue = await createIssue(
      db,
      { teamId: 'CORE', title: 'X', statusId: 'to-do', priorityId: 'low' },
      ANA
   );
   return { db, issueId: issue.id };
}

describe('issue attachments', () => {
   it('adiciona e lista um anexo (base64-no-DB) com URL própria', async () => {
      const { db, issueId } = await setup();
      const dto = await addAttachment(
         db,
         issueId,
         { name: 'foto.png', contentType: 'image/png', dataUrl: PNG_DATA_URL },
         ANA
      );
      expect(dto.name).toBe('foto.png');
      expect(dto.contentType).toBe('image/png');
      expect(dto.url).toContain(`/issues/${issueId}/attachments/${dto.id}`);

      const list = await listAttachments(db, issueId);
      expect(list.map((a) => a.id)).toContain(dto.id);
   });

   it('serve os bytes e remove o anexo', async () => {
      const { db, issueId } = await setup();
      const dto = await addAttachment(
         db,
         issueId,
         { name: 'foto.png', contentType: 'image/png', dataUrl: PNG_DATA_URL },
         ANA
      );
      const bytes = await getAttachmentBytes(db, dto.id);
      expect(bytes?.contentType).toBe('image/png');
      expect(bytes?.data).toBe('aGVsbG8=');

      expect(await removeAttachment(db, dto.id)).toBe(true);
      expect(await getAttachmentBytes(db, dto.id)).toBeNull();
      expect(await listAttachments(db, issueId)).toHaveLength(0);
   });

   it('bloqueia SVG', async () => {
      const { db, issueId } = await setup();
      await expect(
         addAttachment(
            db,
            issueId,
            { name: 'x.svg', contentType: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,aGk=' },
            ANA
         )
      ).rejects.toThrow(/SVG/i);
   });

   it('rejeita arquivo acima do limite de tamanho', async () => {
      const { db, issueId } = await setup();
      const big = Buffer.alloc(5_600_000).toString('base64'); // ~7.3MB base64 > cap
      await expect(
         addAttachment(
            db,
            issueId,
            { name: 'big.png', contentType: 'image/png', dataUrl: `data:image/png;base64,${big}` },
            ANA
         )
      ).rejects.toThrow(/tamanho|5MB|excede/i);
   });

   it('404 quando a issue não existe', async () => {
      const { db } = await setup();
      await expect(
         addAttachment(
            db,
            'nao-existe',
            { name: 'foto.png', contentType: 'image/png', dataUrl: PNG_DATA_URL },
            ANA
         )
      ).rejects.toThrow(/não encontrada/i);
   });
});
