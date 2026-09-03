import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

class ResizeObserverStub implements ResizeObserver {
   observe() {}
   unobserve() {}
   disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
   configurable: true,
   value: ResizeObserverStub,
});

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
   configurable: true,
   value: () => {},
});

// ProseMirror (Tiptap) mede a seleção com getClientRects/getBoundingClientRect em Range e
// Element ao focar/rolar; o jsdom não implementa layout — devolvemos retângulos vazios.
const emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
const emptyRects = () => Object.assign([] as DOMRect[], { item: () => null });
for (const proto of [Range.prototype, Element.prototype]) {
   if (!('getClientRects' in proto)) {
      Object.defineProperty(proto, 'getClientRects', { configurable: true, value: emptyRects });
   }
   if (!('getBoundingClientRect' in proto)) {
      Object.defineProperty(proto, 'getBoundingClientRect', {
         configurable: true,
         value: emptyRect,
      });
   }
}

afterEach(cleanup);
