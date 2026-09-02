'use client';

import { type KeyboardEventHandler, useCallback, useLayoutEffect, useRef, useState } from 'react';

export function useCommandPages<Page extends string>(rootPage: Page, onRootEscape?: () => void) {
   const [pages, setPages] = useState<Page[]>([rootPage]);
   const [query, setQuery] = useState('');
   const searchInputRef = useRef<HTMLInputElement>(null);
   const page = pages.at(-1) ?? rootPage;

   useLayoutEffect(() => {
      searchInputRef.current?.focus();
   }, [page]);

   const push = useCallback((nextPage: Page) => {
      setQuery('');
      setPages((current) => [...current, nextPage]);
   }, []);

   const back = useCallback(() => {
      setQuery('');
      setPages((current) => (current.length > 1 ? current.slice(0, -1) : current));
   }, []);

   const reset = useCallback(() => {
      setQuery('');
      setPages([rootPage]);
   }, [rootPage]);

   const onKeyDown = useCallback<KeyboardEventHandler<HTMLElement>>(
      (event) => {
         if (pages.length === 1 && event.key === 'ArrowRight') {
            const selected = event.currentTarget.querySelector<HTMLElement>(
               '[cmdk-item][aria-selected="true"][data-command-page]'
            );
            const nextPage = selected?.dataset.commandPage as Page | undefined;
            if (nextPage) {
               event.preventDefault();
               event.stopPropagation();
               push(nextPage);
               return;
            }
         }
         if (pages.length === 1 && event.key === 'Escape' && onRootEscape) {
            event.preventDefault();
            event.stopPropagation();
            onRootEscape();
            return;
         }
         if (pages.length === 1 || (event.key !== 'ArrowLeft' && event.key !== 'Escape')) return;

         event.preventDefault();
         event.stopPropagation();
         back();
      },
      [back, onRootEscape, pages.length, push]
   );

   return {
      page,
      depth: pages.length,
      query,
      setQuery,
      searchInputRef,
      push,
      back,
      reset,
      onKeyDown,
   };
}
