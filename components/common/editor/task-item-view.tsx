'use client';

import { linkedIssueIdentifier, type TaskItemOptions } from '@/lib/editor-tasks';
import { cn } from '@/lib/utils';
import { useIssuesStore } from '@/store/issues-store';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { GitBranchPlus } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Task item "vivo" do editor com contexto de issue: botão "Create sub-issue" no hover
 * (`Mod-Shift-o` faz o mesmo com o cursor no item) e, quando o item já virou sub-issue
 * (conteúdo = chip `issueRef`), o check reflete o status dela (`completed`) e fica
 * read-only. Sem vínculo, o checkbox grava `checked` no nó como o NodeView padrão.
 */
export function TaskItemView({ node, editor, extension, getPos, updateAttributes }: NodeViewProps) {
   const options = extension.options as TaskItemOptions;
   const linked = linkedIssueIdentifier(node);
   const linkedIssue = useIssuesStore((s) =>
      linked ? s.issues.find((i) => i.identifier === linked) : undefined
   );
   const checked = linked
      ? linkedIssue?.status.category === 'completed'
      : Boolean(node.attrs.checked);
   const readOnly = linked !== null || !editor.isEditable;
   const canCreate = editor.isEditable && !linked && Boolean(options.onCreateSubIssue);
   const label = `Task item checkbox for ${node.textContent || 'empty task item'}`;

   // Item vinculado: o check é DERIVADO do status da sub-issue, mas o atributo do nó
   // continua sendo o que a projeção em texto (`- [x] ENG-12`) e o doc persistido leem.
   // Quando os dois divergem (a sub-issue foi concluída/reaberta em outro lugar), regrava
   // o atributo — só com o editor editável, e sem tocar na seleção (não rouba o foco).
   const attrChecked = Boolean(node.attrs.checked);
   useEffect(() => {
      if (!linked || linkedIssue === undefined || !editor.isEditable) return;
      if (attrChecked === checked) return;
      updateAttributes({ checked });
   }, [linked, linkedIssue, editor, attrChecked, checked, updateAttributes]);

   return (
      <NodeViewWrapper className="group/task" data-checked={checked}>
         <label contentEditable={false}>
            <input
               type="checkbox"
               checked={checked}
               disabled={readOnly}
               aria-label={label}
               onMouseDown={(event) => event.preventDefault()}
               onChange={(event) => {
                  if (!readOnly) updateAttributes({ checked: event.target.checked });
               }}
            />
         </label>
         <NodeViewContent as="div" />
         {canCreate ? (
            <button
               type="button"
               contentEditable={false}
               aria-label="Create sub-issue"
               title="Create sub-issue (⌘⇧O)"
               onMouseDown={(event) => event.preventDefault()}
               onClick={() => {
                  const pos = getPos();
                  if (typeof pos === 'number') options.onCreateSubIssue?.(pos);
               }}
               className={cn(
                  'ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity',
                  'opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 hover:bg-accent hover:text-foreground'
               )}
            >
               <GitBranchPlus className="size-3.5" />
            </button>
         ) : null}
      </NodeViewWrapper>
   );
}
