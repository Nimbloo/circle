import { describe, expect, it } from 'vitest';
import { parseVideoUrl, videoEmbedUrl } from '@/lib/editor-video';

describe('parseVideoUrl #16', () => {
   it('reconhece YouTube (watch, youtu.be, shorts) e monta o embed sem cookies', () => {
      for (const src of [
         'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
         'https://youtu.be/dQw4w9WgXcQ',
         'https://youtube.com/shorts/dQw4w9WgXcQ',
      ]) {
         const attrs = parseVideoUrl(src);
         expect(attrs?.provider).toBe('youtube');
         expect(videoEmbedUrl(attrs!)).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
      }
   });

   it('reconhece Vimeo e Loom', () => {
      const vimeo = parseVideoUrl('https://vimeo.com/76979871');
      expect(vimeo?.provider).toBe('vimeo');
      expect(videoEmbedUrl(vimeo!)).toBe('https://player.vimeo.com/video/76979871');

      const loom = parseVideoUrl('https://www.loom.com/share/0123456789abcdef0123456789abcdef');
      expect(loom?.provider).toBe('loom');
      expect(videoEmbedUrl(loom!)).toBe(
         'https://www.loom.com/embed/0123456789abcdef0123456789abcdef'
      );
   });

   it('arquivo .mp4/.webm direto vira provider file (sem embed)', () => {
      const file = parseVideoUrl('https://cdn.test/demo.webm?x=1');
      expect(file).toEqual({ src: 'https://cdn.test/demo.webm?x=1', provider: 'file' });
      expect(videoEmbedUrl(file!)).toBeNull();
   });

   it('recusa URL comum, protocolo não http e texto solto', () => {
      expect(parseVideoUrl('https://example.com/watch?v=abc')).toBeNull();
      expect(parseVideoUrl('ftp://cdn.test/demo.mp4')).toBeNull();
      expect(parseVideoUrl('not a url')).toBeNull();
   });
});
