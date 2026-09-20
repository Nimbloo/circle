import type { ContentBlock } from '@/data/issue-details';
import { textToBlocks } from '@/lib/text-blocks';

/**
 * ContentBlock[] -> markdown, para reabrir um update no composer sem perder listas,
 * headings, citações e código (pl#11). É o inverso de `textToBlocks`.
 */
export function blocksToMarkdown(blocks: ContentBlock[]): string {
   return blocks
      .map((block) => {
         switch (block.type) {
            case 'heading':
               return `${block.level === 2 ? '##' : '#'} ${block.text}`;
            case 'paragraph':
               return block.text;
            case 'bullet-list':
               return block.items.map((item) => `- ${item}`).join('\n');
            case 'numbered-list':
               return block.items.map((item, index) => `${index + 1}. ${item}`).join('\n');
            case 'checklist':
               return block.items
                  .map((item) => `- [${item.checked ? 'x' : ' '}] ${item.text}`)
                  .join('\n');
            case 'code':
               return `\`\`\`${block.language}\n${block.code}\n\`\`\``;
            case 'quote':
               return `> ${block.text}`;
            case 'divider':
               return '---';
            case 'issue-ref':
               return block.identifier;
            default:
               return '';
         }
      })
      .filter((chunk) => chunk !== '')
      .join('\n\n');
}

/** Texto do composer -> blocos, preservando listas e demais estruturas. */
export function markdownToBlocks(text: string): ContentBlock[] {
   return textToBlocks(text);
}
