/**
 * Checklist do editor de blocos com paridade Linear: `TaskList`/`TaskItem` do Tiptap
 * estendidos com os atalhos (`Mod-Shift-7` alterna a lista, `Alt-Enter`/`Mod-Enter`
 * alternam o check do item, `Mod-Shift-o` converte o item em sub-issue) e o gancho
 * `onCreateSubIssue`, que o cliente preenche quando o editor conhece a issue.
 *
 * Sem React — o módulo entra no schema do servidor. O NodeView React (botão "Create
 * sub-issue", check derivado da sub-issue) é acoplado pelo `BlockEditor` via
 * `TaskItemExt.extend({ addNodeView })`, como o `IssueRef`.
 */
import type { Node as PmNode } from '@tiptap/pm/model';
import {
   TaskItem,
   TaskList,
   type TaskItemOptions as BaseTaskItemOptions,
} from '@tiptap/extension-list';

declare module '@tiptap/core' {
   interface Commands<ReturnType> {
      taskItemExt: {
         /** Alterna o `checked` do task item que contém a seleção. */
         toggleTaskItemChecked: () => ReturnType;
      };
   }
}

export interface TaskItemOptions extends BaseTaskItemOptions {
   /**
    * Converte o item na posição `pos` em sub-issue (atalho `Mod-Shift-o` e botão do
    * NodeView). Ausente = editor sem contexto de issue; o atalho é ignorado.
    */
   onCreateSubIssue?: (pos: number) => void;
}

/**
 * Identifier da sub-issue vinculada ao item: o primeiro parágrafo contém SÓ um chip
 * `issueRef` (espaços à parte). Nada de atributo novo no nó — `docToText` continua
 * serializando `- [ ] ENG-12` sem mudança.
 */
export function linkedIssueIdentifier(item: PmNode): string | null {
   const paragraph = item.firstChild;
   if (!paragraph || !paragraph.isTextblock) return null;
   let identifier: string | null = null;
   let other = false;
   paragraph.forEach((child) => {
      if (child.type.name === 'issueRef' && identifier === null) {
         identifier = String(child.attrs.identifier ?? '') || null;
      } else if (!(child.isText && !(child.text ?? '').trim())) {
         other = true;
      }
   });
   return other ? null : identifier;
}

export const TaskListExt = TaskList.extend({
   // `Mod-Shift-7` é o atalho do Linear para checklist; no Tiptap ele pertence à lista
   // numerada (prioridade 100) — acima dela, a task list vence.
   priority: 1000,

   addKeyboardShortcuts() {
      return {
         ...this.parent?.(),
         'Mod-Shift-7': () => this.editor.commands.toggleTaskList(),
      };
   },
});

export const TaskItemExt = TaskItem.extend<TaskItemOptions>({
   // Acima do HardBreak (que também escuta `Mod-Enter`): fora de um task item o
   // comando devolve false e o atalho segue para o próximo handler.
   priority: 1000,

   addOptions() {
      return {
         ...this.parent?.(),
         nested: true,
         onCreateSubIssue: undefined,
      } as TaskItemOptions;
   },

   addCommands() {
      return {
         ...this.parent?.(),
         toggleTaskItemChecked:
            () =>
            ({ state, tr, dispatch }) => {
               const { $from } = state.selection;
               for (let depth = $from.depth; depth > 0; depth -= 1) {
                  const node = $from.node(depth);
                  if (node.type.name !== this.name) continue;
                  if (dispatch) {
                     tr.setNodeMarkup($from.before(depth), undefined, {
                        ...node.attrs,
                        checked: !node.attrs.checked,
                     });
                  }
                  return true;
               }
               return false;
            },
      };
   },

   addKeyboardShortcuts() {
      const toggle = () => this.editor.commands.toggleTaskItemChecked();
      return {
         ...this.parent?.(),
         'Alt-Enter': toggle,
         'Mod-Enter': toggle,
         'Mod-Shift-o': () => {
            const create = this.options.onCreateSubIssue;
            if (!create) return false;
            const { $from } = this.editor.state.selection;
            for (let depth = $from.depth; depth > 0; depth -= 1) {
               if ($from.node(depth).type.name === this.name) {
                  create($from.before(depth));
                  return true;
               }
            }
            return false;
         },
      };
   },
});
