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

afterEach(cleanup);
