import { NextResponse } from 'next/server';

/** Envelope de sucesso {data, meta?}. */
export function ok<T>(data: T, meta?: unknown) {
   return NextResponse.json(meta === undefined ? { data } : { data, meta });
}

/** Erro RFC 7807 (application/problem+json). */
export function problem(
   status: number,
   title: string,
   detail?: string,
   extra?: Record<string, unknown>
) {
   return NextResponse.json(
      { type: 'about:blank', title, status, ...(detail ? { detail } : {}), ...extra },
      { status, headers: { 'content-type': 'application/problem+json' } }
   );
}

export const notFound = (detail?: string) => problem(404, 'Not Found', detail);
export const badRequest = (detail?: string) => problem(400, 'Bad Request', detail);
export const unauthorized = (detail?: string) => problem(401, 'Unauthorized', detail);
