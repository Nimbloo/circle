// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { generateHTML } from '@tiptap/core';
import { sanitizeDoc } from '@/lib/doc-sanitize';
import { projectDescriptionDoc } from '@/lib/api/description-doc';
import { Video } from '@/lib/editor-video';
import type { EditorDoc } from '@/lib/editor-doc';
import StarterKit from '@tiptap/starter-kit';

/**
 * XSS armazenado (auditoria 23/09): o nó `video` renderizava `<a href={src}>` sem checar o
 * protocolo, e o servidor gravava qualquer JSON de documento. Com `provider: 'youtube'` e
 * `src: 'javascript:…'`, o link executava no clique de quem abrisse a descrição.
 */
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as unknown as EditorDoc;
const p = (text: string, marks?: unknown[]) => ({
   type: 'paragraph',
   content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

describe('sanitização do documento do editor', () => {
   it('remove vídeo com src que não é URL de vídeo http(s)', () => {
      const out = sanitizeDoc(
         doc(
            p('antes'),
            { type: 'video', attrs: { src: 'javascript:alert(1)', provider: 'youtube' } },
            { type: 'video', attrs: { src: 'https://youtu.be/dQw4w9WgXcQ', provider: 'file' } }
         )
      );
      const videos = (out.content ?? []).filter((n) => n.type === 'video');
      expect(videos).toHaveLength(1);
      // provider vem da URL, não do JSON recebido.
      expect(videos[0].attrs).toEqual({ src: 'https://youtu.be/dQw4w9WgXcQ', provider: 'youtube' });
   });

   it('remove imagem com src fora de http(s)/data:image (inclui o placeholder blob:)', () => {
      const out = sanitizeDoc(
         doc(
            { type: 'image', attrs: { src: 'javascript:alert(1)' } },
            { type: 'image', attrs: { src: 'blob:https://circle/abc', uploading: true } },
            { type: 'image', attrs: { src: 'https://cdn.x/a.png' } },
            { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } }
         )
      );
      expect((out.content ?? []).map((n) => n.attrs?.src)).toEqual([
         'https://cdn.x/a.png',
         'data:image/png;base64,AAAA',
      ]);
   });

   it('tira a marca de link com href perigoso e mantém o texto', () => {
      const out = sanitizeDoc(
         doc(
            p('clique', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
            p('ok', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
            p('mail', [{ type: 'link', attrs: { href: 'mailto:a@b.co' } }]),
            p('interno', [{ type: 'link', attrs: { href: '/nimbloo/issue/CORE-1' } }])
         )
      );
      const marksOf = (i: number) => out.content?.[i].content?.[0].marks;
      expect(out.content?.[0].content?.[0].text).toBe('clique');
      expect(marksOf(0)).toBeUndefined();
      expect(marksOf(1)).toHaveLength(1);
      expect(marksOf(2)).toHaveLength(1);
      expect(marksOf(3)).toHaveLength(1);
   });

   it('o servidor grava o documento já sanitizado', () => {
      const { doc: saved } = projectDescriptionDoc(
         doc(p('texto'), {
            type: 'video',
            attrs: { src: 'javascript:alert(document.domain)', provider: 'youtube' },
         })
      );
      expect(JSON.stringify(saved)).not.toContain('javascript:');
   });

   it('mesmo sem o servidor, o nó de vídeo não renderiza href javascript:', () => {
      const html = generateHTML(
         doc({
            type: 'video',
            attrs: { src: 'javascript:alert(1)', provider: 'youtube' },
         }) as never,
         [StarterKit, Video]
      );
      expect(html).not.toContain('javascript:');
   });
});
