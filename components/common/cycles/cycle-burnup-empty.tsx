/**
 * Vazio do burn-up, fora do módulo do gráfico: ciclo sem série (upcoming, sem medição)
 * mostra isto sem baixar o recharts.
 */
export function CycleBurnupEmpty({ height }: { height: number }) {
   return (
      <div
         className="flex items-center justify-center text-xs text-muted-foreground border border-dashed rounded-md"
         style={{ height }}
      >
         No progress data yet
      </div>
   );
}
