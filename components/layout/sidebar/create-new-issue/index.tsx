import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useState, useCallback } from 'react';
import { Issue } from '@/data/issues';
import { usePriorities, useStatuses } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { toast } from 'sonner';
import { errorReason } from '@/lib/error-reason';
import { StatusSelector } from './status-selector';
import { PrioritySelector } from './priority-selector';
import { AssigneeSelector } from './assignee-selector';
import { ProjectSelector } from './project-selector';
import { LabelSelector } from './label-selector';
import { EstimateSelector } from './estimate-selector';
import { DueDateSelector } from './due-date-selector';
import { TemplateSelector } from './template-selector';
import { TeamSelector } from './team-selector';
import { LexoRank } from '@/lib/utils';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { TemplateDto } from '@/lib/api/templates';
import { BlockEditor } from '@/components/common/editor/block-editor';
import { blocksToDoc, EMPTY_DOC } from '@/lib/editor-doc';
import { textToBlocks } from '@/lib/text-blocks';
import { ChevronRight } from 'lucide-react';
import type { GroupDropValue } from '@/components/common/issues/use-issue-drop-target';

/**
 * Aplica o campo pré-preenchido pelo "+" de uma coluna do board (is#24): antes só
 * status funcionava — coluna de assignee/priority/project abria o form em branco.
 */
function applyGroupDrop(base: Issue, drop: GroupDropValue | null): Issue {
   if (!drop) return base;
   switch (drop.field) {
      case 'status':
         return { ...base, status: drop.status };
      case 'priority':
         return { ...base, priority: drop.priority };
      case 'assignee':
         return {
            ...base,
            assignee: drop.assignee,
            assignees: drop.assignee ? [drop.assignee] : [],
         };
      case 'project':
         return { ...base, project: drop.project };
      default: {
         const exhaustive: never = drop;
         return exhaustive;
      }
   }
}

/** Mesmo teto do servidor (frente S) para o título da issue. */
const TITLE_MAX = 512;

export function CreateNewIssue() {
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultDrop, openModal, closeModal } = useCreateIssueStore();
   const addIssue = useIssuesStore((s) => s.addIssue);
   const status = useStatuses();
   const priorities = usePriorities();
   const params = useParams<{ teamId?: string; issueId?: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   // Time do contexto (is#6): a rota /team/[teamId]/…, ou o time da issue aberta
   // (/issue/[issueId]) — antes caía no 1º time do workspace; senão o 1º time do usuário.
   const contextIssueTeam = useIssuesStore((s) =>
      params?.issueId
         ? s.issues.find((i) => i.identifier === params.issueId || i.id === params.issueId)?.teamId
         : undefined
   );
   const joinedTeams = teams.filter((t) => t.joined);
   const pickable = joinedTeams.length > 0 ? joinedTeams : teams;
   const teamId = params?.teamId ?? contextIssueTeam ?? pickable[0]?.id ?? '';
   // Preferência "Auto-assign to self": a issue nova já vem com o usuário corrente como
   // responsável (removível no seletor); o "+" de uma coluna de assignee tem precedência.
   const autoAssignSelf = usePreferencesStore((s) => s.autoAssignSelf);
   const meUser = useWorkspaceStore((s) =>
      s.me ? s.users.find((u) => u.id === s.me?.id) : undefined
   );

   const createDefaultData = useCallback(() => {
      const base: Issue = {
         id: crypto.randomUUID(),
         // Sem identifier inventado (Is#17): a issue otimista não tem link até o servidor
         // devolver o real — antes o "LNUI-123" levava a um 404.
         identifier: '',
         title: '',
         description: '',
         descriptionDoc: null,
         // 1º status "unstarted" do catálogo (Is#17), não um id fixo que pode não existir.
         status: status.find((s) => s.category === 'unstarted') || status[0],
         assignee: autoAssignSelf && meUser ? meUser : null,
         assignees: autoAssignSelf && meUser ? [meUser] : [],
         priority: priorities.find((p) => p.id === 'no-priority')!,
         labels: [],
         createdAt: new Date().toISOString(),
         cycleId: '',
         project: undefined,
         // Time do contexto (rota /team/[teamId]/...): sem isto a issue caía no time do
         // projeto ou no 1º time do workspace → criada no time errado silenciosamente.
         teamId,
         subissues: [],
         // Rank otimista; o servidor reatribui o rank real no re-hydrate após o POST.
         rank: new LexoRank('a3c').toString(),
      };
      return applyGroupDrop(base, defaultDrop);
   }, [defaultDrop, status, priorities, teamId, autoAssignSelf, meUser]);

   const [addIssueForm, setAddIssueForm] = useState<Issue>(createDefaultData);

   // Ao abrir (false→true): rascunho vazio vira formulário novo; rascunho com conteúdo é
   // preservado (Is#17, como o Linear) — o "+" de uma coluna só aplica o status dela.
   // Resetar por troca de referência do catálogo apagava o que estava sendo digitado a
   // cada evento remoto que re-hidrata o workspace; o reset real é após criar.
   const [wasOpen, setWasOpen] = useState(isOpen);
   if (isOpen !== wasOpen) {
      setWasOpen(isOpen);
      if (isOpen) {
         const pristine = !addIssueForm.title && !addIssueForm.descriptionDoc;
         if (pristine) setAddIssueForm(createDefaultData());
         else if (defaultDrop) setAddIssueForm((f) => applyGroupDrop(f, defaultDrop));
      }
   }

   const [submitting, setSubmitting] = useState(false);
   // Remonta o editor quando o formulário é trocado por fora (template, reset pós-create).
   const [editorKey, setEditorKey] = useState(0);

   const applyTemplate = (t: TemplateDto) => {
      setAddIssueForm((f) => ({
         ...f,
         title: t.title || f.title,
         // Template em texto → doc do editor (`blocksToDoc`), como na abertura da issue.
         descriptionDoc: t.description
            ? blocksToDoc(textToBlocks(t.description))
            : f.descriptionDoc,
         status: t.statusId ? (status.find((s) => s.id === t.statusId) ?? f.status) : f.status,
         priority: t.priorityId
            ? (priorities.find((p) => p.id === t.priorityId) ?? f.priority)
            : f.priority,
      }));
      setEditorKey((k) => k + 1);
      toast.success(`Template "${t.name}" aplicado`);
   };

   // is#5: título só com espaços não conta; o enviado vai sem espaços nas pontas.
   const title = addIssueForm.title.trim();
   const formTeamId = addIssueForm.teamId || teamId;

   const changeTeam = (next: string) => {
      if (next === formTeamId) return;
      // Projeto e estimativa são do time: trocar de time limpa os dois (o servidor
      // recusaria o projeto de outro time).
      setAddIssueForm((f) => ({ ...f, teamId: next, project: undefined, estimate: undefined }));
   };

   const createIssue = async () => {
      if (submitting) return; // guarda contra double-submit (duplo-clique)
      if (!title) {
         toast.error('Title is required');
         return;
      }
      setSubmitting(true);
      try {
         // addIssue faz o set otimista e resolve só após o create + re-hydrate no servidor.
         await addIssue({ ...addIssueForm, title, teamId: formTeamId });
         toast.success('Issue created');
         if (!createMore) {
            closeModal();
         }
         setAddIssueForm(createDefaultData());
         setEditorKey((k) => k + 1);
      } catch (e) {
         // A issue otimista já foi revertida no store; mantém o modal aberto p/ retry.
         toast.error(errorReason(e, 'Falha ao criar a issue'));
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <Dialog open={isOpen} onOpenChange={(value) => (value ? openModal() : closeModal())}>
         {/* is#4: ancorado no topo (sem translate-y de centralização) e com altura máxima —
             descrição longa rola dentro do corpo e o rodapé segue visível. */}
         <DialogContent
            className="top-[12vh] flex max-h-[76vh] w-full translate-y-0 flex-col gap-0 p-0 sm:max-w-[750px]"
            onKeyDown={(e) => {
               // ⌘Enter / Ctrl+Enter cria de qualquer campo (Is#17, atalho do Linear).
               if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void createIssue();
               }
            }}
         >
            <DialogHeader className="shrink-0 px-4 pt-3.5 pb-1">
               <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TeamSelector teams={pickable} value={formTeamId} onChange={changeTeam} />
                  <ChevronRight className="size-3" />
                  <DialogTitle className="text-xs font-medium text-foreground">
                     New issue
                  </DialogTitle>
               </div>
            </DialogHeader>

            <div
               data-slot="create-issue-body"
               className="min-h-0 w-full flex-1 space-y-3 overflow-y-auto px-4 pb-3"
            >
               <Input
                  className="border-none w-full shadow-none outline-none text-2xl font-medium px-0 h-auto focus-visible:ring-0 overflow-hidden text-ellipsis whitespace-normal break-words"
                  placeholder="Título da issue"
                  maxLength={TITLE_MAX}
                  value={addIssueForm.title}
                  onChange={(e) => setAddIssueForm({ ...addIssueForm, title: e.target.value })}
               />

               <BlockEditor
                  key={editorKey}
                  variant="compact"
                  doc={addIssueForm.descriptionDoc ?? EMPTY_DOC}
                  placeholder="Adicione uma descrição…"
                  onChange={(doc) => setAddIssueForm((f) => ({ ...f, descriptionDoc: doc }))}
               />

               <div className="w-full flex items-center justify-start gap-1.5 flex-wrap">
                  <TemplateSelector teamId={formTeamId} onApply={applyTemplate} />
                  <StatusSelector
                     status={addIssueForm.status}
                     teamId={formTeamId}
                     onChange={(newStatus) =>
                        setAddIssueForm({ ...addIssueForm, status: newStatus })
                     }
                  />
                  <PrioritySelector
                     priority={addIssueForm.priority}
                     onChange={(newPriority) =>
                        setAddIssueForm({ ...addIssueForm, priority: newPriority })
                     }
                  />
                  <AssigneeSelector
                     assignees={addIssueForm.assignees}
                     onChange={(assignees) =>
                        setAddIssueForm({
                           ...addIssueForm,
                           assignees,
                           assignee: assignees[0] ?? null,
                        })
                     }
                  />
                  <ProjectSelector
                     project={addIssueForm.project}
                     teamId={formTeamId}
                     onChange={(newProject) =>
                        setAddIssueForm({ ...addIssueForm, project: newProject })
                     }
                  />
                  <LabelSelector
                     selectedLabels={addIssueForm.labels}
                     onChange={(newLabels) =>
                        setAddIssueForm({ ...addIssueForm, labels: newLabels })
                     }
                  />
                  <EstimateSelector
                     estimate={addIssueForm.estimate}
                     teamId={formTeamId}
                     onChange={(newEstimate) =>
                        setAddIssueForm({ ...addIssueForm, estimate: newEstimate })
                     }
                  />
                  <DueDateSelector
                     dueDate={addIssueForm.dueDate}
                     onChange={(newDueDate) =>
                        setAddIssueForm({ ...addIssueForm, dueDate: newDueDate })
                     }
                  />
               </div>
            </div>
            <div className="flex w-full shrink-0 items-center justify-between border-t px-4 py-2.5">
               <div className="flex items-center gap-2">
                  <div className="flex items-center space-x-2">
                     <Switch
                        id="create-more"
                        checked={createMore}
                        onCheckedChange={setCreateMore}
                     />
                     <Label htmlFor="create-more">Create more</Label>
                  </div>
               </div>
               <Button size="sm" disabled={submitting || !title} onClick={createIssue}>
                  {submitting ? 'Criando…' : 'Criar issue'}
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
