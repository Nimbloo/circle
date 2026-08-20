/** Erro de negócio com status HTTP (mapeado para ProblemDetail RFC 7807 no handler). */
export class ApiError extends Error {
   constructor(
      public readonly status: number,
      message: string
   ) {
      super(message);
      this.name = 'ApiError';
   }
}
