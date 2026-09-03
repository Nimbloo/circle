/**
 * Vídeo no editor de blocos (#16): nó atômico `video { src, provider }`.
 *
 * YouTube, Vimeo e Loom viram `iframe` responsivo (16:9, fullscreen, sem autoplay);
 * URL direta `.mp4`/`.webm` vira `<video controls>`. Entra ao colar a URL num parágrafo
 * ou pelo item "Video" do menu "/". Sem React — o schema é compartilhado com o servidor.
 */
import { Node, mergeAttributes, nodePasteRule } from '@tiptap/core';

export type VideoProvider = 'youtube' | 'vimeo' | 'loom' | 'file';

export interface VideoAttrs {
   src: string;
   provider: VideoProvider;
}

declare module '@tiptap/core' {
   interface Commands<ReturnType> {
      video: {
         /** Insere o vídeo a partir da URL; false se a URL não for suportada. */
         setVideo: (options: { src: string }) => ReturnType;
      };
   }
}

const YOUTUBE_ID = /^[\w-]{6,}$/;

function youtubeId(url: URL): string | null {
   const host = url.hostname.replace(/^www\.|^m\./, '');
   let id: string | null = null;
   if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
   else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else {
         const m = /^\/(?:embed|shorts|live|v)\/([^/?]+)/.exec(url.pathname);
         id = m ? m[1] : null;
      }
   }
   return id && YOUTUBE_ID.test(id) ? id : null;
}

function vimeoId(url: URL): string | null {
   const host = url.hostname.replace(/^www\./, '');
   if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
   const m = /(?:^\/video\/|^\/)(\d+)(?:[/?]|$)/.exec(url.pathname);
   return m ? m[1] : null;
}

function loomId(url: URL): string | null {
   if (url.hostname.replace(/^www\./, '') !== 'loom.com') return null;
   const m = /^\/(?:share|embed)\/([a-f0-9]{16,})/i.exec(url.pathname);
   return m ? m[1] : null;
}

/** Reconhece a URL e devolve os attrs do nó, ou null quando não é um vídeo suportado. */
export function parseVideoUrl(input: string): VideoAttrs | null {
   let url: URL;
   try {
      url = new URL(input.trim());
   } catch {
      return null;
   }
   if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
   if (youtubeId(url)) return { src: url.toString(), provider: 'youtube' };
   if (vimeoId(url)) return { src: url.toString(), provider: 'vimeo' };
   if (loomId(url)) return { src: url.toString(), provider: 'loom' };
   if (/\.(mp4|webm)$/i.test(url.pathname)) return { src: url.toString(), provider: 'file' };
   return null;
}

/** URL do player embutido (só providers de iframe). */
export function videoEmbedUrl(attrs: VideoAttrs): string | null {
   let url: URL;
   try {
      url = new URL(attrs.src);
   } catch {
      return null;
   }
   switch (attrs.provider) {
      case 'youtube': {
         const id = youtubeId(url);
         return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
      }
      case 'vimeo': {
         const id = vimeoId(url);
         return id ? `https://player.vimeo.com/video/${id}` : null;
      }
      case 'loom': {
         const id = loomId(url);
         return id ? `https://www.loom.com/embed/${id}` : null;
      }
      default:
         return null;
   }
}

export const Video = Node.create({
   name: 'video',
   group: 'block',
   atom: true,
   draggable: true,
   selectable: true,

   addAttributes() {
      // Renderizados como data-* no wrapper (ver renderHTML), não como atributos soltos.
      return {
         src: { default: null, renderHTML: () => ({}) },
         provider: { default: 'file', renderHTML: () => ({}) },
      };
   },

   parseHTML() {
      return [
         {
            tag: 'div[data-type="video"]',
            getAttrs: (el) => {
               const src = el.getAttribute('data-src');
               if (!src) return false;
               return { src, provider: el.getAttribute('data-provider') ?? 'file' };
            },
         },
      ];
   },

   renderHTML({ node, HTMLAttributes }) {
      const attrs = node.attrs as VideoAttrs;
      const wrapper = mergeAttributes(HTMLAttributes, {
         'data-type': 'video',
         'data-src': attrs.src,
         'data-provider': attrs.provider,
      });
      if (attrs.provider === 'file') {
         return [
            'div',
            wrapper,
            ['video', { src: attrs.src, controls: 'true', preload: 'metadata' }],
         ];
      }
      const embed = videoEmbedUrl(attrs);
      if (!embed) return ['div', wrapper, ['a', { href: attrs.src, rel: 'noopener' }, attrs.src]];
      return [
         'div',
         wrapper,
         [
            'iframe',
            {
               src: embed,
               allowfullscreen: 'true',
               allow: 'fullscreen; picture-in-picture',
               loading: 'lazy',
               referrerpolicy: 'strict-origin-when-cross-origin',
               frameborder: '0',
            },
         ],
      ];
   },

   renderText({ node }) {
      return String(node.attrs.src ?? '');
   },

   addCommands() {
      return {
         setVideo:
            ({ src }) =>
            ({ commands }) => {
               const attrs = parseVideoUrl(src);
               if (!attrs) return false;
               return commands.insertContent({ type: this.name, attrs });
            },
      };
   },

   addPasteRules() {
      return [
         nodePasteRule({
            find: /https?:\/\/\S+/g,
            type: this.type,
            getAttributes: (match) => parseVideoUrl(match[0]),
         }),
      ];
   },
});
