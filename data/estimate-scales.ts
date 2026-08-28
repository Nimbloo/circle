/**
 * Escalas de estimate por time (paridade Linear). O valor persistido na issue é
 * sempre um NÚMERO (pontos); a escala define quais valores o picker oferece e como
 * são rotulados (t-shirt mapeia números → XS/S/M/L/XL).
 */
export type EstimateScale = 'fibonacci' | 'exponential' | 'linear' | 'tshirt';

export interface EstimateOption {
   value: number;
   label: string;
}

export const ESTIMATE_SCALES: Record<EstimateScale, EstimateOption[]> = {
   fibonacci: [1, 2, 3, 5, 8].map((v) => ({ value: v, label: String(v) })),
   exponential: [1, 2, 4, 8, 16].map((v) => ({ value: v, label: String(v) })),
   linear: [1, 2, 3, 4, 5].map((v) => ({ value: v, label: String(v) })),
   tshirt: [
      { value: 1, label: 'XS' },
      { value: 2, label: 'S' },
      { value: 3, label: 'M' },
      { value: 5, label: 'L' },
      { value: 8, label: 'XL' },
   ],
};

export const ESTIMATE_SCALE_META: Record<EstimateScale, string> = {
   fibonacci: 'Fibonacci (1, 2, 3, 5, 8)',
   exponential: 'Exponential (1, 2, 4, 8, 16)',
   linear: 'Linear (1, 2, 3, 4, 5)',
   tshirt: 'T-shirt (XS, S, M, L, XL)',
};

export function normalizeScale(raw: string | undefined | null): EstimateScale {
   return raw === 'exponential' || raw === 'linear' || raw === 'tshirt' ? raw : 'fibonacci';
}

/** Rótulo de um valor de estimate na escala do time (número → label; t-shirt → XS…). */
export function estimateLabel(value: number, scale: EstimateScale): string {
   const opt = ESTIMATE_SCALES[scale].find((o) => o.value === value);
   return opt ? opt.label : String(value);
}
