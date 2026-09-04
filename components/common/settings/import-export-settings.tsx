'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/client';
import type {
   ImportField,
   ImportMapping,
   ImportPreviewDto,
   ImportResultDto,
   ImportSource,
} from '@/lib/api/import';
import { useWorkspaceStore } from '@/store/workspace-store';
import { AlertTriangle, CheckCircle2, Download, FileUp, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

/**
 * Settings → Import/Export (#101).
 *
 * Import em wizard de 4 passos (upload → mapeamento → resumo → resultado), como no
 * Linear: nada é escrito antes do passo "Resumo"; o preview só lê o arquivo. Export
 * reaproveita `/issues/export` (CSV e JSON) via download direto do navegador.
 */

const SOURCE_LABEL: Record<ImportSource, string> = {
   csv: 'CSV genérico',
   linear: 'Export do Linear',
   jira: 'Export do Jira',
};

const FIELD_LABEL: Record<ImportField, string> = {
   externalId: 'Id externo',
   title: 'Título',
   description: 'Descrição',
   status: 'Status',
   priority: 'Prioridade',
   assignee: 'Responsável',
   labels: 'Labels',
   estimate: 'Estimativa',
   dueDate: 'Data de entrega',
   parent: 'Issue-pai',
};

const FIELDS = Object.keys(FIELD_LABEL) as ImportField[];
/** Valor sentinela do select — o Radix não aceita `value=""` num SelectItem. */
const NONE = '__none__';

type Step = 'upload' | 'mapping' | 'result';

function Warnings({ items }: { items: string[] }) {
   if (items.length === 0) return null;
   return (
      <ul className="flex flex-col gap-1 rounded-[10px] bg-muted/40 p-3 text-[13px] leading-4 text-muted-foreground">
         {items.map((w) => (
            <li key={w} className="flex items-start gap-2">
               <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
               <span>{w}</span>
            </li>
         ))}
      </ul>
   );
}

export default function ImportExportSettings() {
   const teams = useWorkspaceStore((s) => s.teams);

   const [step, setStep] = useState<Step>('upload');
   const [source, setSource] = useState<ImportSource>('csv');
   const [fileName, setFileName] = useState('');
   const [csv, setCsv] = useState('');
   const [preview, setPreview] = useState<ImportPreviewDto | null>(null);
   const [mapping, setMapping] = useState<ImportMapping>({});
   const [teamId, setTeamId] = useState('');
   const [createLabels, setCreateLabels] = useState(false);
   const [result, setResult] = useState<ImportResultDto | null>(null);
   const [busy, setBusy] = useState(false);
   const inputRef = useRef<HTMLInputElement>(null);

   const [exportTeam, setExportTeam] = useState('');

   const reset = () => {
      setStep('upload');
      setFileName('');
      setCsv('');
      setPreview(null);
      setMapping({});
      setResult(null);
   };

   const pick = async (file: File | undefined) => {
      if (!file || busy) return;
      setBusy(true);
      try {
         const dto = await api.importIssues.preview(file, source);
         setFileName(file.name);
         setCsv(await file.text());
         setPreview(dto);
         setMapping(dto.mapping);
         setTeamId((current) => current || teams[0]?.id || '');
         setStep('mapping');
      } catch {
         toast.error('Não foi possível ler o arquivo (é um CSV válido?)');
      } finally {
         setBusy(false);
         if (inputRef.current) inputRef.current.value = '';
      }
   };

   const runImport = async () => {
      if (!preview || !teamId || busy) return;
      setBusy(true);
      try {
         const dto = await api.importIssues.commit({
            // A origem do commit é a do preview (o servidor a ecoa), não o select — o
            // mapeamento confirmado foi calculado para ela.
            source: preview.source,
            csv,
            teamId,
            mapping,
            createMissingLabels: createLabels,
         });
         setResult(dto);
         setStep('result');
         toast.success(`${dto.created} criada(s), ${dto.updated} atualizada(s)`);
      } catch {
         toast.error('Não foi possível importar as issues');
      } finally {
         setBusy(false);
      }
   };

   const download = (format: 'csv' | 'json') => {
      const sp = new URLSearchParams();
      if (exportTeam) sp.set('team', exportTeam);
      if (format === 'json') sp.set('format', 'json');
      const qs = sp.toString();
      window.location.href = `/api/v1/issues/export${qs ? `?${qs}` : ''}`;
   };

   return (
      <SettingsShell
         title="Import / Export"
         description="Traga issues de outra ferramenta por CSV e leve as suas embora quando quiser."
      >
         <SettingsSection
            title="Importar issues"
            description="Nada é gravado antes de você confirmar o mapeamento."
            action={
               step !== 'upload' ? (
                  <Button variant="ghost" size="sm" onClick={reset}>
                     Recomeçar
                  </Button>
               ) : undefined
            }
         >
            {step === 'upload' && (
               <SettingsCard>
                  <SettingsRow
                     icon={<FileUp className="size-4" />}
                     title="Origem do arquivo"
                     description="Define os nomes de coluna esperados no mapeamento automático."
                     trailing={
                        <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
                           <SelectTrigger aria-label="Origem do import" className="h-[30px] w-52">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              {(Object.keys(SOURCE_LABEL) as ImportSource[]).map((s) => (
                                 <SelectItem key={s} value={s}>
                                    {SOURCE_LABEL[s]}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     }
                  />
                  <SettingsRow
                     icon={<Upload className="size-4" />}
                     title="Arquivo CSV"
                     description={fileName || 'Selecione o arquivo exportado da outra ferramenta'}
                     trailing={
                        <>
                           <input
                              ref={inputRef}
                              type="file"
                              accept=".csv,text/csv"
                              className="hidden"
                              aria-label="Arquivo CSV"
                              onChange={(e) => void pick(e.target.files?.[0])}
                           />
                           <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => inputRef.current?.click()}
                           >
                              Escolher arquivo
                           </Button>
                        </>
                     }
                  />
               </SettingsCard>
            )}

            {step === 'mapping' && preview && (
               <div className="flex flex-col gap-3">
                  <Warnings items={preview.warnings} />
                  <SettingsCard>
                     <SettingsRow
                        title="Time de destino"
                        description="As issues importadas entram neste time."
                        trailing={
                           <Select value={teamId} onValueChange={setTeamId}>
                              <SelectTrigger aria-label="Time de destino" className="h-[30px] w-52">
                                 <SelectValue placeholder="Escolha o time" />
                              </SelectTrigger>
                              <SelectContent>
                                 {teams.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                       {t.name}
                                    </SelectItem>
                                 ))}
                              </SelectContent>
                           </Select>
                        }
                     />
                     {FIELDS.map((field) => (
                        <SettingsRow
                           key={field}
                           title={FIELD_LABEL[field]}
                           description={field === 'title' ? 'Obrigatório' : undefined}
                           trailing={
                              <Select
                                 value={mapping[field] ?? NONE}
                                 onValueChange={(v) =>
                                    setMapping((m) => ({ ...m, [field]: v === NONE ? null : v }))
                                 }
                              >
                                 <SelectTrigger
                                    aria-label={`Coluna para ${FIELD_LABEL[field]}`}
                                    className="h-[30px] w-52"
                                 >
                                    <SelectValue placeholder="Não importar" />
                                 </SelectTrigger>
                                 <SelectContent>
                                    <SelectItem value={NONE}>Não importar</SelectItem>
                                    {preview.columns.map((c) => (
                                       <SelectItem key={c} value={c}>
                                          {c}
                                       </SelectItem>
                                    ))}
                                 </SelectContent>
                              </Select>
                           }
                        />
                     ))}
                     <SettingsRow
                        title="Criar labels que não existem"
                        description="Sem isto, labels sem correspondência no catálogo são ignoradas."
                        trailing={
                           <Checkbox
                              aria-label="Criar labels que não existem"
                              checked={createLabels}
                              onCheckedChange={(v) => setCreateLabels(v === true)}
                           />
                        }
                     />
                  </SettingsCard>

                  <div className="rounded-[10px] bg-card p-4">
                     <h3 className="text-[13px] font-medium">
                        Amostra ({preview.sample.length} de {preview.totalRows} linha(s))
                     </h3>
                     <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-left text-[13px]">
                           <thead className="text-muted-foreground">
                              <tr>
                                 <th className="pb-2 pr-4 font-normal">Título</th>
                                 <th className="pb-2 pr-4 font-normal">Status</th>
                                 <th className="pb-2 pr-4 font-normal">Prioridade</th>
                                 <th className="pb-2 font-normal">Ação</th>
                              </tr>
                           </thead>
                           <tbody>
                              {preview.sample.map((row, i) => (
                                 <tr key={`${row.externalId ?? 'row'}-${i}`} className="align-top">
                                    <td className="py-1 pr-4">{row.title || '—'}</td>
                                    <td className="py-1 pr-4 text-muted-foreground">
                                       {row.statusRaw ?? '—'}
                                    </td>
                                    <td className="py-1 pr-4 text-muted-foreground">
                                       {row.priorityRaw ?? '—'}
                                    </td>
                                    <td className="py-1 text-muted-foreground">
                                       {row.existing ? 'Atualizar' : 'Criar'}
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>

                  <div className="flex justify-end gap-2">
                     <Button variant="ghost" onClick={reset}>
                        Cancelar
                     </Button>
                     <Button disabled={!mapping.title || !teamId || busy} onClick={runImport}>
                        Importar {preview.totalRows} linha(s)
                     </Button>
                  </div>
               </div>
            )}

            {step === 'result' && result && (
               <div className="flex flex-col gap-3">
                  <SettingsCard>
                     <SettingsRow
                        icon={<CheckCircle2 className="size-4" />}
                        title="Import concluído"
                        description={`${result.created} criada(s) · ${result.updated} atualizada(s) · ${result.skipped} ignorada(s)`}
                     />
                  </SettingsCard>
                  <Warnings items={result.errors.map((e) => `Linha ${e.row}: ${e.message}`)} />
                  <div className="flex justify-end">
                     <Button variant="ghost" onClick={reset}>
                        Importar outro arquivo
                     </Button>
                  </div>
               </div>
            )}
         </SettingsSection>

         <SettingsSection
            title="Exportar issues"
            description="CSV para planilha; JSON preserva labels, responsáveis, pai e comentários."
         >
            <SettingsCard>
               <SettingsRow
                  title="Time"
                  description="Vazio exporta o workspace inteiro."
                  trailing={
                     <Select
                        value={exportTeam || NONE}
                        onValueChange={(v) => setExportTeam(v === NONE ? '' : v)}
                     >
                        <SelectTrigger aria-label="Time do export" className="h-[30px] w-52">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           <SelectItem value={NONE}>Todos os times</SelectItem>
                           {teams.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                 {t.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  }
               />
               <SettingsRow
                  icon={<Download className="size-4" />}
                  title="Baixar"
                  description="O arquivo é gerado na hora, respeitando o time escolhido."
                  trailing={
                     <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => download('csv')}>
                           CSV
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => download('json')}>
                           JSON
                        </Button>
                     </div>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
