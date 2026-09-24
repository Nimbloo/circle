// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * A "piscada" do avatar: a Radix pintava a inicial em toda montagem e em toda troca de
 * foto até o `onload` assíncrono. Imagem já carregada aparece direto; na troca, a foto
 * anterior fica até a nova carregar.
 */
const images: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
const RealImage = window.Image;

beforeEach(() => {
   images.length = 0;
   window.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      complete = false;
      naturalWidth = 0;
      src = '';
      constructor() {
         images.push(this);
      }
   } as unknown as typeof Image;
});
afterEach(() => {
   window.Image = RealImage;
});

const view = (src?: string) => (
   <Avatar>
      <AvatarImage src={src} alt="Ana" />
      <AvatarFallback>A</AvatarFallback>
   </Avatar>
);
const load = (src: string) => act(() => images.find((i) => i.src === src)!.onload!());

describe('Avatar sem piscada', () => {
   it('sem foto: mostra a inicial', () => {
      render(view(undefined));
      expect(screen.getByText('A')).toBeTruthy();
      expect(screen.queryByRole('img')).toBeNull();
   });

   it('foto que já carregou aparece na montagem seguinte, sem passar pela inicial', () => {
      const first = render(view('/a1.png'));
      load('/a1.png');
      expect(screen.getByRole('img').getAttribute('src')).toBe('/a1.png');
      first.unmount();

      render(view('/a1.png'));
      expect(screen.getByRole('img').getAttribute('src')).toBe('/a1.png');
      expect(screen.queryByText('A')).toBeNull();
   });

   it('troca de foto: a anterior fica até a nova carregar', () => {
      const { rerender } = render(view('/b1.png'));
      load('/b1.png');
      rerender(view('/b2.png'));
      expect(screen.getByRole('img').getAttribute('src')).toBe('/b1.png');
      expect(screen.queryByText('B')).toBeNull();
      expect(screen.queryByText('A')).toBeNull();
      load('/b2.png');
      expect(screen.getByRole('img').getAttribute('src')).toBe('/b2.png');
   });

   it('foto que falha cai na inicial', () => {
      render(view('/quebrada.png'));
      act(() => images.find((i) => i.src === '/quebrada.png')!.onerror!());
      expect(screen.getByText('A')).toBeTruthy();
      expect(screen.queryByRole('img')).toBeNull();
   });

   it('remover a foto volta para a inicial', () => {
      const { rerender } = render(view('/c1.png'));
      load('/c1.png');
      rerender(view(undefined));
      expect(screen.getByText('A')).toBeTruthy();
      expect(screen.queryByRole('img')).toBeNull();
   });

   it('AvatarImage condicional que sai com o Avatar montado volta para a inicial', () => {
      const cond = (show: boolean) => (
         <Avatar>
            {show && <AvatarImage src="/d1.png" alt="Ana" />}
            <AvatarFallback>A</AvatarFallback>
         </Avatar>
      );
      const { rerender } = render(cond(true));
      load('/d1.png');
      expect(screen.queryByText('A')).toBeNull();
      rerender(cond(false));
      expect(screen.getByText('A')).toBeTruthy();
   });
});
