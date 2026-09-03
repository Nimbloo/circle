/**
 * Markdown -> ContentBlock[] — módulo puro (sem React/catálogos) para ser usado tanto
 * pelo adapter da UI quanto pelo servidor (projeção da descrição de project a partir
 * do documento do editor de blocos).
 */
import type { ContentBlock } from '@/data/issue-details';

/**
 * Markdown -> ContentBlock[] (#16): parseia headings (#), listas (- / 1.),
 * checklists (- [ ] / - [x]), code fences (```), quotes (>), dividers (---) e
 * parágrafos. É a leitura da projeção em texto (markdown) que o servidor mantém ao
 * lado do documento do editor de blocos (`description_doc`).
 */
export function textToBlocks(text: string | null | undefined): ContentBlock[] {
   if (!text || !text.trim()) return [];
   const lines = text.replace(/\r\n/g, '\n').split('\n');
   const blocks: ContentBlock[] = [];
   let para: string[] = [];
   const flushPara = () => {
      const t = para.join(' ').trim();
      if (t) blocks.push({ type: 'paragraph', text: t });
      para = [];
   };

   let i = 0;
   while (i < lines.length) {
      const trimmed = lines[i].trim();

      // code fence ```lang ... ```
      const fence = trimmed.match(/^```(\w*)$/);
      if (fence) {
         flushPara();
         const code: string[] = [];
         i++;
         while (i < lines.length && lines[i].trim() !== '```') code.push(lines[i++]);
         i++; // pula a fence de fechamento
         blocks.push({ type: 'code', language: fence[1] || 'text', code: code.join('\n') });
         continue;
      }
      // linha em branco separa parágrafos
      if (trimmed === '') {
         flushPara();
         i++;
         continue;
      }
      // divider
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
         flushPara();
         blocks.push({ type: 'divider' });
         i++;
         continue;
      }
      // heading # / ##…
      const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
         flushPara();
         blocks.push({ type: 'heading', text: h[2].trim(), level: h[1].length === 1 ? 1 : 2 });
         i++;
         continue;
      }
      // checklist - [ ] / - [x]
      if (/^[-*]\s+\[( |x|X)\]\s+/.test(trimmed)) {
         flushPara();
         const items: { text: string; checked: boolean }[] = [];
         let m: RegExpMatchArray | null;
         while (i < lines.length && (m = lines[i].trim().match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/))) {
            items.push({ text: m[2].trim(), checked: m[1].toLowerCase() === 'x' });
            i++;
         }
         blocks.push({ type: 'checklist', items });
         continue;
      }
      // bullet list - / *
      if (/^[-*]\s+/.test(trimmed)) {
         flushPara();
         const items: string[] = [];
         let m: RegExpMatchArray | null;
         while (i < lines.length && (m = lines[i].trim().match(/^[-*]\s+(.*)$/))) {
            if (/^\[( |x|X)\]/.test(m[1])) break;
            items.push(m[1].trim());
            i++;
         }
         blocks.push({ type: 'bullet-list', items });
         continue;
      }
      // numbered list 1. 2. …
      if (/^\d+\.\s+/.test(trimmed)) {
         flushPara();
         const items: string[] = [];
         let m: RegExpMatchArray | null;
         while (i < lines.length && (m = lines[i].trim().match(/^\d+\.\s+(.*)$/))) {
            items.push(m[1].trim());
            i++;
         }
         blocks.push({ type: 'numbered-list', items });
         continue;
      }
      // quote >
      if (/^>\s?/.test(trimmed)) {
         flushPara();
         const quote: string[] = [];
         while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
            quote.push(lines[i].trim().replace(/^>\s?/, ''));
            i++;
         }
         blocks.push({ type: 'quote', text: quote.join(' ').trim() });
         continue;
      }
      // linha de parágrafo
      para.push(trimmed);
      i++;
   }
   flushPara();
   return blocks;
}
