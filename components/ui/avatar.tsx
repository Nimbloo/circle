'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Avatar sem a Radix: a dela começa SEMPRE em "idle" e só marca "loaded" no `onload`
 * assíncrono — toda montagem (lista, navegação) e toda troca de foto pintavam a inicial
 * antes da imagem (a "piscada"). Aqui: URL que já carregou nesta sessão aparece no
 * primeiro paint, e na troca de foto a anterior fica até a nova carregar.
 */
const loadedSrcs = new Set<string>();

type AvatarContextValue = { loaded: boolean; setLoaded: (loaded: boolean) => void };
const AvatarContext = React.createContext<AvatarContextValue>({
   loaded: false,
   setLoaded: () => {},
});

function Avatar({ className, ...props }: React.ComponentProps<'span'>) {
   const [loaded, setLoaded] = React.useState(false);
   const value = React.useMemo(() => ({ loaded, setLoaded }), [loaded]);
   return (
      <AvatarContext.Provider value={value}>
         <span
            data-slot="avatar"
            className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
            {...props}
         />
      </AvatarContext.Provider>
   );
}

function AvatarImage({ className, src, alt = '', ...props }: React.ComponentProps<'img'>) {
   const { setLoaded } = React.useContext(AvatarContext);
   const url = typeof src === 'string' && src ? src : null;
   // Mostrada = a última que carregou. Troca só quando a nova termina de carregar.
   const [shown, setShown] = React.useState(() => (url && loadedSrcs.has(url) ? url : null));

   React.useLayoutEffect(() => {
      if (!url) {
         setShown(null);
         return;
      }
      if (loadedSrcs.has(url)) {
         setShown(url);
         return;
      }
      let alive = true;
      const image = new window.Image();
      const done = () => {
         loadedSrcs.add(url);
         if (alive) setShown(url);
      };
      image.onload = done;
      image.onerror = () => {
         if (alive) setShown(null);
      };
      image.src = url;
      // Já no cache do navegador: resolve antes do paint, sem esperar o `onload`.
      if (image.complete && image.naturalWidth > 0) done();
      return () => {
         alive = false;
      };
   }, [url]);

   React.useLayoutEffect(() => {
      setLoaded(shown !== null);
   }, [shown, setLoaded]);

   if (!shown) return null;
   return (
      <img
         data-slot="avatar-image"
         className={cn('aspect-square size-full', className)}
         src={shown}
         alt={alt}
         {...props}
      />
   );
}

/** Hash estável de string → hue [0,360) para cor determinística das iniciais. */
function hueFromString(seed: string): number {
   let h = 0;
   for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
   return h % 360;
}

function AvatarFallback({ className, children, style, ...props }: React.ComponentProps<'span'>) {
   // Iniciais em fundo colorido determinístico (padrão Slack/Google/Linear) quando o
   // conteúdo é texto e o caller NÃO definiu um `bg-*` próprio (ex.: cor de status).
   const seed = typeof children === 'string' ? children.trim() : '';
   const colorize = seed.length > 0 && !/(^|\s)bg-/.test(className ?? '');
   const { loaded } = React.useContext(AvatarContext);
   if (loaded) return null;
   return (
      <span
         data-slot="avatar-fallback"
         className={cn(
            'flex size-full items-center justify-center rounded-full',
            colorize ? 'font-medium text-white' : 'bg-muted',
            className
         )}
         style={
            colorize
               ? { backgroundColor: `hsl(${hueFromString(seed.toLowerCase())} 52% 48%)`, ...style }
               : style
         }
         {...props}
      >
         {children}
      </span>
   );
}

export { Avatar, AvatarImage, AvatarFallback };
