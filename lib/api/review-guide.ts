import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { review, reviewFile } from '@/db/schema';
import type { GuideSection } from '@/data/reviews';
import { ApiError } from './errors';
import { invokeText, MODEL_ID } from './agent';
import type { ReviewGuideDto } from './reviews';

/**
 * Guia de review gerado a partir do diff do PR (Bedrock, mesmo client/modelo do agent).
 * O modelo recebe título, repo#n, branches, a lista de arquivos com +/- e os patches
 * (com teto de bytes) e devolve JSON estrito no shape `GuideSection` da UI.
 */

/** Teto de bytes de patch enviados ao modelo; acima disso os maiores arquivos entram só pelo nome. */
export const PATCH_BUDGET_BYTES = 60 * 1024;

type Invoke = (prompt: string) => Promise<string>;

export interface GenerateGuideOptions {
   /** Substitui a chamada ao Bedrock (testes). */
   invoke?: Invoke;
}

interface GuideFile {
   path: string;
   status: string;
   additions: number;
   deletions: number;
   patch: string | null;
}

const FileRefSchema = z.object({
   name: z.string().min(1),
   path: z.string().default(''),
   stat: z.string().default(''),
});
const SectionSchema = z.object({
   title: z.string().min(1),
   paragraphs: z.array(z.string()).default([]),
   fileRefs: z.array(FileRefSchema).default([]),
   diffName: z.string().default(''),
});
const GuideSchema = z.object({ sections: z.array(SectionSchema).min(1) });

/** `src/app/x.ts` → name `x.ts`, path `src/app` (mesma convenção do adapter da UI). */
function splitPath(full: string): { name: string; path: string } {
   const idx = full.lastIndexOf('/');
   return idx === -1
      ? { name: full, path: '' }
      : { name: full.slice(idx + 1), path: full.slice(0, idx) };
}

function statOf(f: { additions: number; deletions: number }): string {
   return `+${f.additions}${f.deletions ? ` -${f.deletions}` : ''}`;
}

/**
 * Caminhos cujo patch fica de FORA do prompt: enquanto a soma passar do teto, corta o
 * maior arquivo primeiro (um arquivo gigante não deve expulsar vários pequenos).
 */
function omittedPatches(files: GuideFile[]): Set<string> {
   const withPatch = files
      .filter((f): f is GuideFile & { patch: string } => typeof f.patch === 'string')
      .sort((a, b) => b.patch.length - a.patch.length);
   let total = withPatch.reduce((acc, f) => acc + f.patch.length, 0);
   const omitted = new Set<string>();
   for (const f of withPatch) {
      if (total <= PATCH_BUDGET_BYTES) break;
      omitted.add(f.path);
      total -= f.patch.length;
   }
   return omitted;
}

export function buildGuidePrompt(
   pr: {
      title: string;
      repo: string;
      prNumber: number;
      targetBranch: string | null;
      sourceBranch: string | null;
   },
   files: GuideFile[]
): string {
   const omitted = omittedPatches(files);
   const lines: string[] = [];
   lines.push('You are writing a code review guide for the pull request below.');
   lines.push('');
   lines.push(`Title: ${pr.title}`);
   lines.push(`Pull request: ${pr.repo}#${pr.prNumber}`);
   lines.push(`Branches: ${pr.targetBranch ?? '?'} <- ${pr.sourceBranch ?? '?'}`);
   lines.push('');
   lines.push(`Files changed (${files.length}):`);
   for (const f of files) lines.push(`- ${f.path} (${f.status}, ${statOf(f)})`);
   lines.push('');
   lines.push('Diffs (unified patches as returned by GitHub):');
   for (const f of files) {
      lines.push('');
      lines.push(`### ${f.path}`);
      if (!f.patch) lines.push('(no patch available: binary or too large)');
      else if (omitted.has(f.path)) lines.push('(patch omitted from this prompt: too large)');
      else lines.push('```diff', f.patch, '```');
   }
   lines.push('');
   lines.push(
      'Write the guide a reviewer would want: what changes, why, where to look first, and risks.'
   );
   lines.push(
      'Respond in English with STRICT JSON only (no prose, no markdown fences) in this exact shape:'
   );
   lines.push(
      '{"sections":[{"title":string,"paragraphs":string[],"fileRefs":[{"name":string,"path":string,"stat":string}],"diffName":string}]}'
   );
   lines.push('Rules:');
   lines.push('- 2 to 4 sections, ordered as a reviewer should read the change.');
   lines.push('- paragraphs: 1 to 3 short paragraphs per section; wrap identifiers in backticks.');
   lines.push(
      '- fileRefs: the files the section talks about; name = file name, path = directory, stat = "+additions -deletions" from the list above.'
   );
   lines.push(
      '- diffName: the file NAME (not the directory) from the list above whose diff best illustrates the section.'
   );
   return lines.join('\n');
}

/** Extrai o primeiro objeto JSON do texto do modelo (tolera prosa/fences em volta). */
function extractJson(text: string): unknown {
   const start = text.indexOf('{');
   const end = text.lastIndexOf('}');
   if (start === -1 || end <= start) throw new SyntaxError('sem objeto JSON');
   return JSON.parse(text.slice(start, end + 1));
}

/** Valida a resposta e ancora `diffName`/`fileRefs` nos arquivos reais do PR. */
export function parseGuideResponse(text: string, files: GuideFile[]): GuideSection[] {
   let raw: unknown;
   try {
      raw = extractJson(text);
   } catch {
      throw new ApiError(502, 'O modelo não devolveu um guia em JSON válido');
   }
   const parsed = GuideSchema.safeParse(raw);
   if (!parsed.success) {
      throw new ApiError(502, 'O modelo devolveu um guia fora do formato esperado');
   }
   const known = files.map((f) => ({
      ...splitPath(f.path),
      full: f.path,
      stat: statOf(f),
      hasPatch: typeof f.patch === 'string',
   }));
   const findFile = (ref: string) => {
      const r = ref.trim();
      return known.find((k) => k.full === r) ?? known.find((k) => k.name === r);
   };
   // Fallback do diffName: o primeiro arquivo que TEM diff (um binário não ilustra nada).
   const fallback = known.find((k) => k.hasPatch) ?? known[0];
   const sections: GuideSection[] = parsed.data.sections
      .map((s) => ({
         title: s.title.trim(),
         paragraphs: s.paragraphs.map((p) => p.trim()).filter(Boolean),
         fileRefs: s.fileRefs.map((ref) => {
            const real =
               findFile(ref.path ? `${ref.path}/${ref.name}` : ref.name) ?? findFile(ref.name);
            return real
               ? { name: real.name, path: real.path, stat: real.stat }
               : { name: ref.name, path: ref.path, stat: ref.stat };
         }),
         // diffName precisa apontar para um arquivo do PR; senão cai no fallback.
         diffName: findFile(s.diffName)?.name ?? fallback.name,
      }))
      // Seção sem prosa não guia ninguém — descarta em vez de renderizar título solto.
      .filter((s) => s.paragraphs.length > 0);
   if (sections.length === 0) {
      throw new ApiError(502, 'O modelo devolveu um guia sem conteúdo');
   }
   return sections;
}

/**
 * Gera e persiste o guia do review. 404 sem review; 409 sem arquivos ingeridos (não há
 * diff para narrar); 502 resposta inutilizável; 503 Bedrock indisponível/não configurado.
 */
export async function generateReviewGuide(
   db: Db,
   id: string,
   opts: GenerateGuideOptions = {}
): Promise<ReviewGuideDto> {
   const [row] = await db.select().from(review).where(eq(review.id, id)).limit(1);
   if (!row) throw new ApiError(404, `Review '${id}' não encontrado`);
   const files: GuideFile[] = await db
      .select({
         path: reviewFile.path,
         status: reviewFile.status,
         additions: reviewFile.additions,
         deletions: reviewFile.deletions,
         patch: reviewFile.patch,
      })
      .from(reviewFile)
      .where(eq(reviewFile.reviewId, id))
      .orderBy(asc(reviewFile.path));
   if (files.length === 0) {
      throw new ApiError(
         409,
         'O review ainda não tem arquivos; sincronize o PR antes de gerar o guia'
      );
   }

   const prompt = buildGuidePrompt(row, files);
   let text: string;
   try {
      text = await (opts.invoke ?? invokeText)(prompt);
   } catch (e) {
      console.warn(`[circle] guia de review falhou (${id}):`, (e as Error).message);
      throw new ApiError(
         503,
         'Geração do guia indisponível no momento (modelo não configurado ou fora do ar)'
      );
   }
   const sections = parseGuideResponse(text, files);
   const guide: ReviewGuideDto = {
      sections,
      generatedAt: new Date().toISOString(),
      model: MODEL_ID,
   };
   await db
      .update(review)
      .set({ guide: JSON.stringify(guide) })
      .where(eq(review.id, id));
   return guide;
}
