import { embedTexts } from './agent';
import type { SearchItem, SearchResult } from './search';

/**
 * Reordenação SEMÂNTICA opcional dos resultados léxicos (#99).
 *
 * Desligada por padrão: só roda com `CIRCLE_SEARCH_SEMANTIC=1`. Em produção o Bedrock
 * está bloqueado, então qualquer erro (credencial, modelo sem acesso, timeout) devolve
 * a ordem léxica intacta — a busca nunca depende disto para funcionar.
 */

const MAX_RERANK = 50;
const CACHE_MAX = 5000;

/** Cache LRU simples por texto: `Map` preserva a ordem de inserção. */
const cache = new Map<string, number[]>();

function cacheGet(key: string): number[] | undefined {
   const v = cache.get(key);
   if (v) {
      cache.delete(key);
      cache.set(key, v);
   }
   return v;
}

function cacheSet(key: string, value: number[]): void {
   if (cache.has(key)) cache.delete(key);
   cache.set(key, value);
   while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
   }
}

/** Apenas para testes: zera o cache entre casos. */
export function __clearEmbedCache(): void {
   cache.clear();
}

export function isSemanticSearchEnabled(): boolean {
   return process.env.CIRCLE_SEARCH_SEMANTIC === '1';
}

function cosine(a: number[], b: number[]): number {
   let dot = 0;
   let na = 0;
   let nb = 0;
   const n = Math.min(a.length, b.length);
   for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
   }
   if (na === 0 || nb === 0) return 0;
   return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Texto representativo do item para o embedding (título já carrega o essencial). */
function itemText(item: SearchItem): string {
   return item.title.slice(0, 512);
}

/** Embeddings com cache: só o que falta vai ao Bedrock. */
async function embedCached(texts: string[]): Promise<Map<string, number[]>> {
   const out = new Map<string, number[]>();
   const missing: string[] = [];
   for (const t of texts) {
      const hit = cacheGet(t);
      if (hit) out.set(t, hit);
      else if (!missing.includes(t)) missing.push(t);
   }
   if (missing.length > 0) {
      const vectors = await embedTexts(missing);
      missing.forEach((t, i) => {
         const v = vectors[i];
         if (v?.length) {
            cacheSet(t, v);
            out.set(t, v);
         }
      });
   }
   return out;
}

/**
 * Reordena os primeiros {@link MAX_RERANK} itens de cada grupo por similaridade com a
 * query. Sem a flag, ou em qualquer falha, devolve o resultado como veio.
 */
export async function rerankSemantic(result: SearchResult): Promise<SearchResult> {
   if (!isSemanticSearchEnabled() || !result.query) return result;
   const head = result.groups.flatMap((g) => g.items.slice(0, MAX_RERANK));
   if (head.length < 2) return result;

   try {
      const texts = [result.query, ...head.map(itemText)];
      const vectors = await embedCached(texts);
      const queryVector = vectors.get(result.query);
      if (!queryVector) return result;

      const score = new Map<string, number>();
      for (const item of head) {
         const v = vectors.get(itemText(item));
         score.set(item.id, v ? cosine(queryVector, v) : -1);
      }

      const groups = result.groups.map((g) => {
         const top = g.items.slice(0, MAX_RERANK);
         const rest = g.items.slice(MAX_RERANK);
         // Ordem estável: empate mantém o ranking léxico original.
         const ordered = top
            .map((item, i) => ({ item, i }))
            .sort((a, b) => {
               const d = (score.get(b.item.id) ?? -1) - (score.get(a.item.id) ?? -1);
               return d !== 0 ? d : a.i - b.i;
            })
            .map((e) => e.item);
         return { ...g, items: [...ordered, ...rest] };
      });
      return { ...result, groups, semantic: true };
   } catch {
      // Bedrock indisponível/bloqueado: a busca léxica já é o resultado.
      return result;
   }
}
