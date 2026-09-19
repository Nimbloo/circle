/**
 * Guardas dos atalhos de teclado de página (globais e do inbox): não disparam digitando
 * nem com dialog/menu/popover aberto — antes `c` com um menu aberto abria o "criar
 * issue" por cima, e `j/k` navegava a lista por baixo de um dialog.
 */
export function isTypingTarget(el: EventTarget | null): boolean {
   const n = el as HTMLElement | null;
   if (!n || typeof n.tagName !== 'string') return false;
   const tag = n.tagName;
   return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || n.isContentEditable === true;
}

const OVERLAY_SELECTOR = [
   '[role="dialog"][data-state="open"]',
   '[role="alertdialog"][data-state="open"]',
   '[role="menu"][data-state="open"]',
   '[data-radix-popper-content-wrapper]',
].join(',');

/** Há um overlay Radix aberto (dialog, sheet, menu, popover, select). */
export function hasOpenOverlay(root: ParentNode = document): boolean {
   return root.querySelector(OVERLAY_SELECTOR) !== null;
}
