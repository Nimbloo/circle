/**
 * @menções em texto de comentário — mesma regra no servidor (quem notificar) e no
 * cliente (autocomplete). O slug aceita `.`, `_` e `-` no meio (`danilo.simei`), mas não
 * no fim: `@danilo.` no fim da frase é a menção a `danilo` seguida de pontuação.
 */
const MENTION_RE = /@([a-z0-9._-]+)/gi;

/** Tira a pontuação final (`.`, `_`, `-`) de um slug digitado. */
export function trimMentionSlug(slug: string): string {
   return slug.replace(/[._-]+$/, '');
}

/**
 * Slugs candidatos citados no corpo (minúsculos, sem repetição): o token cru e o token
 * sem a pontuação final — um slug que termina em `_` de verdade continua casando.
 */
export function mentionSlugs(body: string): string[] {
   const out = new Set<string>();
   for (const m of body.matchAll(MENTION_RE)) {
      const raw = m[1].toLowerCase();
      out.add(raw);
      const trimmed = trimMentionSlug(raw);
      if (trimmed) out.add(trimmed);
   }
   return [...out];
}
