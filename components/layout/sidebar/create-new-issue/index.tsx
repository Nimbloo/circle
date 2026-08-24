import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RiEditLine } from '@remixicon/react';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Issue } from '@/data/issues';
import { usePriorities, useStatuses } from '@/store/catalog-store';
import { useIssuesStore } from '@/store/issues-store';
import { usePreferencesStore } from '@/store/preferences-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { StatusSelector } from './status-selector';
import { PrioritySelector } from './priority-selector';
import { AssigneeSelector } from './assignee-selector';
import { ProjectSelector } from './project-selector';
import { LabelSelector } from './label-selector';
import { EstimateSelector } from './estimate-selector';
import { TemplateSelector } from './template-selector';
import { LexoRank } from '@/lib/utils';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useParams } from 'next/navigation';
import { useWorkspaceStore } from '@/store/workspace-store';
import type { TemplateDto } from '@/lib/api/templates';

export function CreateNewIssue() {
   const [createMore, setCreateMore] = useState<boolean>(false);
   const { isOpen, defaultStatus, openModal, closeModal } = useCreateIssueStore();
   const addIssue = useIssuesStore((s) => s.addIssue);
   const getAllIssues = useIssuesStore((s) => s.getAllIssues);
   const status = useStatuses();
   const priorities = usePriorities();
   const params = useParams<{ teamId?: string }>();
   const teams = useWorkspaceStore((s) => s.teams);
   const me = useWorkspaceStore((s) => s.me);
   const users = useWorkspaceStore((s) => s.users);
   const autoAssignSelf = usePreferencesStore((s) => s.autoAssignSelf);
   // Time do contexto (URL /team/[teamId]/...) ou o 1º time do usuário.
   const teamId = params?.teamId ?? teams[0]?.id ?? '';

   // Usuário atual como objeto User (pro default de assignee do "Auto-assign to self").
   const selfUser = useMemo(
      () => (me ? (users.find((u) => u.id === me.id || u.email === me.email) ?? null) : null),
      [me, users]
   );

   const generateUniqueIdentifier = useCallback(() => {
      const identifiers = getAllIssues().map((issue) => issue.identifier);
      let identifier = Math.floor(Math.random() * 999)
         .toString()
         .padStart(3, '0');
      while (identifiers.includes(`LNUI-${identifier}`)) {
         identifier = Math.floor(Math.random() * 999)
            .toString()
            .padStart(3, '0');
      }
      return identifier;
   }, [getAllIssues]);

   const createDefaultData = useCallback(() => {
      const identifier = generateUniqueIdentifier();
      return {
         id: uuidv4(),
         identifier: `LNUI-${identifier}`,
         title: '',
         description: '',
         status: defaultStatus || status.find((s) => s.id === 'to-do')!,
         // "Auto-assign to self" (Preferences): já nasce atribuída ao usuário atual.
         assignee: autoAssignSelf ? selfUser : null,
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
   }, [defaultStatus, generateUniqueIdentifier, status, priorities, teamId, autoAssignSelf, selfUser]);

   const [addIssueForm, setAddIssueForm] = useState<Issue>(createDefaultData());

   // Reseta o form APENAS na transição fechado→aberto. Antes resetava a cada mudança
   // de identidade de `createDefaultData` (que muda quando catálogos/workspace hidratam,
   // ou `selfUser` vai null→user do auto-assign) → apagava o título/descrição já digitados
   // enquanto o modal estava aberto. O ref-guard preserva o que o usuário digitou.
   const wasOpen = useRef(false);
   useEffect(() => {
      if (isOpen && !wasOpen.current) setAddIssueForm(createDefaultData());
      wasOpen.current = isOpen;
   }, [isOpen, createDefaultData]);

   const [submitting, setSubmitting] = useState(false);

   const applyTemplate = (t: TemplateDto) => {
      setAddIssueForm((f) => ({
         ...f,
         title: t.title || f.title,
         description: t.description || f.description,
         status: t.statusId ? (status.find((s) => s.id === t.statusId) ?? f.status) : f.status,
         priority: t.priorityId
            ? (priorities.find((p) => p.id === t.priorityId) ?? f.priority)
            : f.priority,
      }));
      toast.success(`Template "${t.name}" aplicado`);
   };

   const createIssue = async () => {
      if (submitting) return; // guarda contra double-submit (duplo-clique)
      if (!addIssueForm.title) {
         toast.error('Title is required');
         return;
      }
      setSubmitting(true);
      try {
         // addIssue faz o set otimista e resolve só após o create + re-hydrate no servidor.
         await addIssue(addIssueForm);
         toast.success('Issue created');
         if (!createMore) {
            closeModal();
         }
         setAddIssueForm(createDefaultData());
      } catch {
         // A issue otimista já foi revertida no store; mantém o modal aberto p/ retry.
         toast.error('Falha ao criar a issue');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <Dialog open={isOpen} onOpenChange={(value) => (value ? openModal() : closeModal())}>
         <DialogTrigger asChild>
            <Button className="size-8 shrink-0" variant="secondary" size="icon">
               <RiEditLine />
            </Button>
         </DialogTrigger>
         <DialogContent className="w-full sm:max-w-2xl p-0 gap-0">
            <DialogHeader>
               <DialogTitle className="px-4 pt-4 text-base font-medium">New issue</DialogTitle>
            </DialogHeader>

            <div className="px-4 pb-0 space-y-3 w-full">
               <Input
                  className="border-none w-full shadow-none outline-none text-2xl font-semibold px-0 h-auto focus-visible:ring-0 overflow-hidden text-ellipsis whitespace-normal break-words"
                  placeholder="Issue title"
                  value={addIssueForm.title}
                  onChange={(e) => setAddIssueForm({ ...addIssueForm, title: e.target.value })}
               />

               <Textarea
                  className="border-none w-full shadow-none outline-none resize-none px-0 min-h-16 focus-visible:ring-0 break-words whitespace-normal overflow-wrap"
                  placeholder="Add description..."
                  value={addIssueForm.description}
                  onChange={(e) =>
                     setAddIssueForm({ ...addIssueForm, description: e.target.value })
                  }
               />

               <div className="w-full flex items-center justify-start gap-1.5 flex-wrap">
                  <TemplateSelector teamId={teamId} onApply={applyTemplate} />
                  <StatusSelector
                     status={addIssueForm.status}
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
                     assignee={addIssueForm.assignee}
                     onChange={(newAssignee) =>
                        setAddIssueForm({ ...addIssueForm, assignee: newAssignee })
                     }
                  />
                  <ProjectSelector
                     project={addIssueForm.project}
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
                     onChange={(newEstimate) =>
                        setAddIssueForm({ ...addIssueForm, estimate: newEstimate })
                     }
                  />
               </div>
            </div>
            <div className="flex items-center justify-between py-2.5 px-4 w-full border-t">
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
               <Button size="sm" disabled={submitting || !addIssueForm.title} onClick={createIssue}>
                  {submitting ? 'Creating…' : 'Create issue'}
               </Button>
            </div>
         </DialogContent>
      </Dialog>
   );
}
