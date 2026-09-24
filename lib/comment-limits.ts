/** Tamanho máximo do corpo de um comentário de issue — a API (zod) e a UI (`maxLength`). */
export const COMMENT_MAX_LENGTH = 10000;

/** A partir daqui o composer mostra o contador `n/máximo`. */
export const COMMENT_COUNTER_FROM = Math.floor(COMMENT_MAX_LENGTH * 0.9);
