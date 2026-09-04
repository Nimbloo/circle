// @vitest-environment jsdom

import './setup-dom';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { blocksToDoc, docToText, type EditorDoc } from '@/lib/editor-doc';
import { status } from '@/data/status';
import { useIssuesStore } from '@/store/issues-store';

vi.mock('next/navigation', () => ({
   useParams: () => ({ orgId: 'nimbloo' }),
}));

const apiMocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }));
vi.mock('@/lib/client', () => ({
   api: { issues: { create: apiMocks.create, get: apiMocks.get } },
}));

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMocks }));

/** DTO mínimo da sub-issue criada (o que `adaptIssues` lê). */
const SUB_ISSUE_DTO = {
   id: 'i9',
   identifier: 'ENG-9',
   teamId: 'ENG',
   title: 'escrever testes',
   status: { id: status[1].id, name: status[1].name, color: '', category: status[1].category },
   priority: { id: 'no-priority', name: 'No priority' },
   assignee: null,
   createdBy: null,
   project: null,
   cycleId: '',
   labels: [],
   rank: 'b',
   dueDate: null,
   estimate: null,
   subIssueCount: 0,
   subIssueDoneCount: 0,
   snoozedUntil: null,
   createdAt: '2026-01-01T00:00:00.000Z',
   updatedAt: '2026-01-01T00:00:00.000Z',
};

async function mount(props: Partial<React.ComponentProps<typeof BlockEditor>> = {}) {
   let editor: Editor | null = null;
   const utils = render(
      <BlockEditor doc={blocksToDoc([])} onReady={(e) => (editor = e)} saveDelayMs={0} {...props} />
   );
   await waitFor(() => expect(editor).not.toBeNull());
   return { ...utils, editor: editor as unknown as Editor };
}

/** JSON do doc sem o tipo estreito do `getJSON()` do Tiptap 3 (asserções por caminho). */
const json = (editor: Editor): EditorDoc => editor.getJSON() as EditorDoc;

/** Cola texto puro com o ClipboardEvent/DataTransfer do setup-dom. */
function pasteText(editor: Editor, text: string, html?: string) {
   const data = new DataTransfer();
   data.setData('text/plain', text);
   if (html) data.setData('text/html', html);
   editor.view.pasteText(text, new ClipboardEvent('paste', { clipboardData: data }));
}

const CHECKLIST: EditorDoc = blocksToDoc([
   {
      type: 'checklist',
      items: [
         { text: 'primeira', checked: false },
         { text: 'segunda', checked: false },
      ],
   },
]);

describe('BlockEditor — checklist (paridade Linear)', () => {
   it('Mod-Shift-7 alterna a task list no parágrafo atual (e de volta)', async () => {
      const { editor } = await mount();
      act(() => {
         editor.chain().focus('end').insertContent('tarefa').run();
      });
      act(() => {
         editor.commands.keyboardShortcut('Mod-Shift-7');
      });
      expect(json(editor).content?.[0].type).toBe('taskList');
      act(() => {
         editor.commands.keyboardShortcut('Mod-Shift-7');
      });
      expect(json(editor).content?.[0].type).toBe('paragraph');
   });

   it('Alt-Enter e Mod-Enter alternam o check do item atual', async () => {
      const { editor, container } = await mount({ doc: CHECKLIST });
      act(() => {
         editor.commands.focus('start');
      });
      act(() => {
         editor.commands.keyboardShortcut('Alt-Enter');
      });
      const items = () => container.querySelectorAll('ul[data-type="taskList"] > li');
      expect(items()[0].getAttribute('data-checked')).toBe('true');
      expect(items()[1].getAttribute('data-checked')).toBe('false');
      act(() => {
         editor.commands.keyboardShortcut('Mod-Enter');
      });
      expect(items()[0].getAttribute('data-checked')).toBe('false');
      // Fora de uma task list, Mod-Enter continua sendo o hard break do StarterKit.
      expect(json(editor).content?.[0].content).toHaveLength(2);
   });

   it('Tab aninha o item no anterior e Shift-Tab desaninha', async () => {
      const { editor } = await mount({ doc: CHECKLIST });
      act(() => {
         editor.commands.focus('end');
      });
      act(() => {
         editor.commands.keyboardShortcut('Tab');
      });
      let list = json(editor).content![0];
      expect(list.content).toHaveLength(1);
      expect(list.content![0].content!.map((n) => n.type)).toEqual(['paragraph', 'taskList']);
      act(() => {
         editor.commands.keyboardShortcut('Shift-Tab');
      });
      list = json(editor).content![0];
      expect(list.content).toHaveLength(2);
   });

   it('colar markdown com `- [ ]`/`- [x]` vira task list; `- ` bullet; `1. ` numerada', async () => {
      const { editor, container } = await mount();
      act(() => {
         editor.commands.focus('end');
         pasteText(editor, '- [ ] comprar\n- [x] pagar\n- solto\n1. um\n2. dois');
      });
      // (pode sobrar um parágrafo vazio no fim — comportamento padrão do colar em bloco)
      const types = json(editor).content!.map((n) => n.type);
      expect(types.slice(0, 3)).toEqual(['taskList', 'bulletList', 'orderedList']);
      const items = container.querySelectorAll('ul[data-type="taskList"] > li');
      expect(items).toHaveLength(2);
      expect(items[0].getAttribute('data-checked')).toBe('false');
      expect(items[1].getAttribute('data-checked')).toBe('true');
      expect(items[1].textContent).toContain('pagar');
      expect(container.querySelectorAll('ol li')).toHaveLength(2);
   });

   it('colar do Google Docs (`☐`/`☑`, com HTML) vira task list', async () => {
      const { editor, container } = await mount();
      act(() => {
         editor.commands.focus('end');
         pasteText(
            editor,
            '☐ revisar\n☑ publicar',
            '<meta charset="utf-8"><p>☐ revisar</p><p>☑ publicar</p>'
         );
      });
      const items = container.querySelectorAll('ul[data-type="taskList"] > li');
      expect(items).toHaveLength(2);
      expect(items[1].getAttribute('data-checked')).toBe('true');
   });

   it('colar HTML do próprio editor (data-pm-slice) não passa pela conversão', async () => {
      const { editor } = await mount();
      act(() => {
         editor.commands.focus('end');
         pasteText(
            editor,
            '- [ ] não converter',
            '<p data-pm-slice="1 1 []">- [ ] não converter</p>'
         );
      });
      expect(json(editor).content?.[0].type).toBe('paragraph');
      expect(editor.getText()).toContain('- [ ] não converter');
   });

   it('texto puro sem lista segue o colar normal', async () => {
      const { editor } = await mount();
      act(() => {
         editor.commands.focus('end');
         pasteText(editor, 'linha simples');
      });
      expect(json(editor).content?.[0].type).toBe('paragraph');
      expect(editor.getText()).toBe('linha simples');
   });
});

describe('BlockEditor — task item → sub-issue (com contexto de issue)', () => {
   const CONTEXT = { issueId: 'parent-1', teamId: 'ENG', projectId: 'p1' };
   const completed = status.find((s) => s.category === 'completed')!;

   beforeEach(() => {
      vi.clearAllMocks();
      useIssuesStore.setState({ issues: [] });
      apiMocks.create.mockResolvedValue(SUB_ISSUE_DTO);
      apiMocks.get.mockResolvedValue(SUB_ISSUE_DTO);
   });

   it('sem contexto não há botão "Create sub-issue"', async () => {
      const { container } = await mount({ doc: CHECKLIST });
      expect(container.querySelector('button[aria-label="Create sub-issue"]')).toBeNull();
   });

   it('o botão cria a sub-issue com parentId, faz flush do save e troca o item pelo chip', async () => {
      const onSave = vi.fn();
      const doc = blocksToDoc([
         { type: 'checklist', items: [{ text: 'escrever testes', checked: false }] },
      ]);
      const { editor, container } = await mount({
         doc,
         context: CONTEXT,
         onSave,
         saveDelayMs: 5000,
      });
      // Edição pendente (debounce longo) — a conversão precisa descarregar antes da API.
      act(() => {
         editor.chain().focus('end').insertContent('!').run();
      });
      expect(onSave).not.toHaveBeenCalled();

      const button = container.querySelector<HTMLButtonElement>(
         'button[aria-label="Create sub-issue"]'
      )!;
      expect(button).not.toBeNull();
      await act(async () => {
         fireEvent.click(button);
      });

      expect(onSave).toHaveBeenCalledTimes(1);
      expect(apiMocks.create).toHaveBeenCalledTimes(1);
      expect(apiMocks.create.mock.calls[0][0]).toMatchObject({
         teamId: 'ENG',
         projectId: 'p1',
         parentId: 'parent-1',
         title: 'escrever testes!',
      });

      await waitFor(() => {
         const li = container.querySelector('ul[data-type="taskList"] > li')!;
         expect(li.querySelector('.issue-ref[data-identifier="ENG-9"]')).not.toBeNull();
         expect(li.textContent).not.toContain('escrever testes!');
      });
      // Sub-issue entrou no store (applyRemote) e o chip mostra o título dela.
      expect(useIssuesStore.getState().issues.map((i) => i.id)).toContain('i9');
      const docJson = json(editor);
      expect(JSON.stringify(docJson)).toContain(
         '{"type":"issueRef","attrs":{"identifier":"ENG-9"}}'
      );
      // Serialização continua sem atributo novo: `- [ ] ENG-9`.
      expect(docToText(docJson)).toBe('- [ ] ENG-9');

      // Item vinculado: check read-only, refletindo o status da sub-issue.
      const checkbox = container.querySelector<HTMLInputElement>(
         'ul[data-type="taskList"] > li input[type="checkbox"]'
      )!;
      expect(checkbox.disabled).toBe(true);
      expect(checkbox.checked).toBe(false);
      act(() => {
         useIssuesStore.setState((s) => ({
            issues: s.issues.map((i) => (i.id === 'i9' ? { ...i, status: completed } : i)),
         }));
      });
      await waitFor(() => expect(checkbox.checked).toBe(true));
      // Sem botão no item já convertido.
      expect(container.querySelector('button[aria-label="Create sub-issue"]')).toBeNull();
   });

   it('Mod-Shift-O com o cursor no item também converte', async () => {
      const { editor, container } = await mount({ doc: CHECKLIST, context: CONTEXT });
      act(() => {
         editor.commands.focus('end'); // cursor em "segunda"
      });
      await act(async () => {
         editor.commands.keyboardShortcut('Mod-Shift-o');
      });
      expect(apiMocks.create).toHaveBeenCalledTimes(1);
      expect(apiMocks.create.mock.calls[0][0]).toMatchObject({ title: 'segunda' });
      await waitFor(() => {
         const items = container.querySelectorAll('ul[data-type="taskList"] > li');
         expect(items[1].querySelector('.issue-ref[data-identifier="ENG-9"]')).not.toBeNull();
         expect(items[0].textContent).toContain('primeira');
      });
   });

   it('sub-issue concluída regrava o atributo `checked` do item vinculado (projeção acompanha)', async () => {
      const linked: EditorDoc = {
         type: 'doc',
         content: [
            {
               type: 'taskList',
               content: [
                  {
                     type: 'taskItem',
                     attrs: { checked: false },
                     content: [
                        {
                           type: 'paragraph',
                           content: [{ type: 'issueRef', attrs: { identifier: 'ENG-9' } }],
                        },
                     ],
                  },
               ],
            },
         ],
      };
      const onChange = vi.fn();
      const { editor } = await mount({ doc: linked, context: CONTEXT, onChange });
      await act(async () => {
         await useIssuesStore.getState().applyRemote(SUB_ISSUE_DTO.id);
      });
      expect(docToText(json(editor))).toBe('- [ ] ENG-9');

      act(() => {
         useIssuesStore.setState((s) => ({
            issues: s.issues.map((i) => (i.id === 'i9' ? { ...i, status: completed } : i)),
         }));
      });
      // O atributo do nó (e não só o visual) passa a ser `true` → `- [x] ENG-9`.
      await waitFor(() => expect(docToText(json(editor))).toBe('- [x] ENG-9'));
      expect(onChange).toHaveBeenCalled();

      // Editor read-only NÃO regrava o doc (documento de outra pessoa/preview).
      const readOnly = await mount({ doc: linked, context: CONTEXT, editable: false });
      await new Promise((r) => setTimeout(r, 0));
      expect(docToText(json(readOnly.editor))).toBe('- [ ] ENG-9');
   });

   it('falha da API mantém o item e mostra toast de erro', async () => {
      apiMocks.create.mockRejectedValue(new Error('boom'));
      const { container } = await mount({ doc: CHECKLIST, context: CONTEXT });
      const button = container.querySelector<HTMLButtonElement>(
         'button[aria-label="Create sub-issue"]'
      )!;
      await act(async () => {
         fireEvent.click(button);
      });
      expect(toastMocks.error).toHaveBeenCalledWith('Falha ao criar sub-issue');
      expect(container.querySelector('.issue-ref')).toBeNull();
      expect(container.querySelector('ul[data-type="taskList"] > li')!.textContent).toContain(
         'primeira'
      );
   });
});
