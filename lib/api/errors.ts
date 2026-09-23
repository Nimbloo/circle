/** Erro de negócio com status HTTP (mapeado para ProblemDetail RFC 7807 no handler). */
export class ApiError extends Error {
   constructor(
      public readonly status: number,
      message: string,
      /** Extension members do ProblemDetail (RFC 7807), aditivos ao corpo do erro. */
      public readonly extensions?: Record<string, unknown>
   ) {
      super(message);
      this.name = 'ApiError';
   }
}
