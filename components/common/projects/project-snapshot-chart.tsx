'use client';

import type { ProjectSnapshotPoint } from '@/lib/client';
import { useState } from 'react';

interface ProjectSnapshotChartProps {
   points: ProjectSnapshotPoint[];
   /** Altura da área de plotagem, em px. */
   height?: number;
   /** Rótulo do vazio quando ainda não há 2 dias gravados. */
   emptyLabel?: string;
}

const SERIES = [
   { key: 'scope', label: 'Scope', color: 'var(--muted-foreground)' },
   { key: 'started', label: 'Started', color: 'var(--chart-4)' },
   { key: 'completed', label: 'Completed', color: 'var(--primary)' },
] as const;

/** `YYYY-MM-DD` → `Mar 5` (sem date-fns: a entrada já é ISO, não há fuso envolvido). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDay(iso: string): string {
   const month = MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7);
   return `${month} ${Number(iso.slice(8, 10))}`;
}

/**
 * Gráfico de linha do histórico de progresso (#102), em SVG próprio — sem lib de
 * chart. As coordenadas vivem num espaço virtual 0–100 esticado pelo `viewBox`
 * (`preserveAspectRatio="none"`), então o gráfico é fluido; `vector-effect`
 * mantém a espessura do traço constante apesar da escala não uniforme.
 *
 * Menos de 2 dias gravados NÃO viram gráfico: uma linha reta entre dois pontos
 * inventados seria uma tendência que não existe.
 */
export function ProjectSnapshotChart({
   points,
   height = 120,
   emptyLabel = 'Not enough history yet — the chart appears after two days.',
}: ProjectSnapshotChartProps) {
   const [hovered, setHovered] = useState<number | null>(null);

   if (points.length < 2) {
      return (
         <p
            className="py-4 text-center text-[11px] text-muted-foreground"
            data-testid="snapshot-chart-empty"
         >
            {emptyLabel}
         </p>
      );
   }

   const max = Math.max(1, ...points.map((p) => p.scope));
   // Eixo X por DATA, não por índice: os snapshots não são diários (só existem nos dias
   // em que houve acesso), e espaçar por índice espremia uma semana de silêncio no mesmo
   // passo de um dia — o gráfico mentia sobre o ritmo.
   const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
   const first = dayOf(points[0].date);
   const span = dayOf(points[points.length - 1].date) - first;
   const xOf = (index: number) =>
      span <= 0
         ? (index * 100) / (points.length - 1)
         : ((dayOf(points[index].date) - first) / span) * 100;
   const yOf = (value: number) => 100 - (value / max) * 100;
   const pathOf = (key: (typeof SERIES)[number]['key']) =>
      points
         .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xOf(index)} ${yOf(point[key])}`)
         .join(' ');

   const active = hovered === null ? null : points[hovered];

   return (
      <div className="flex flex-col gap-2" data-testid="snapshot-chart">
         <div className="relative" style={{ height }}>
            <svg
               className="absolute inset-0 h-full w-full"
               viewBox="0 0 100 100"
               preserveAspectRatio="none"
               aria-hidden="true"
            >
               {/* Linhas de grade (0%, 50%, 100% do escopo máximo) */}
               {[0, 50, 100].map((y) => (
                  <line
                     key={y}
                     x1="0"
                     x2="100"
                     y1={y}
                     y2={y}
                     stroke="var(--border)"
                     strokeWidth={1}
                     vectorEffect="non-scaling-stroke"
                  />
               ))}
               {SERIES.map((series) => (
                  <path
                     key={series.key}
                     d={pathOf(series.key)}
                     fill="none"
                     stroke={series.color}
                     strokeWidth={series.key === 'scope' ? 1.25 : 1.75}
                     strokeDasharray={series.key === 'scope' ? '4 3' : undefined}
                     strokeLinejoin="round"
                     strokeLinecap="round"
                     vectorEffect="non-scaling-stroke"
                  />
               ))}
               {hovered !== null && (
                  <line
                     x1={xOf(hovered)}
                     x2={xOf(hovered)}
                     y1="0"
                     y2="100"
                     stroke="var(--primary)"
                     strokeWidth={1}
                     vectorEffect="non-scaling-stroke"
                  />
               )}
            </svg>

            {/* Faixas de hover: uma por medição, alinhada ao X do ponto (que é por data). */}
            <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
               {points.map((point, index) => {
                  const left = index === 0 ? 0 : (xOf(index - 1) + xOf(index)) / 2;
                  const right =
                     index === points.length - 1 ? 100 : (xOf(index) + xOf(index + 1)) / 2;
                  return (
                     <button
                        key={point.date}
                        type="button"
                        aria-label={`${shortDay(point.date)}: scope ${point.scope}, started ${point.started}, completed ${point.completed}`}
                        data-testid={`snapshot-point-${point.date}`}
                        onMouseEnter={() => setHovered(index)}
                        onFocus={() => setHovered(index)}
                        onBlur={() => setHovered(null)}
                        className="absolute top-0 h-full cursor-default outline-none"
                        style={{ left: `${left}%`, width: `${right - left}%` }}
                     />
                  );
               })}
            </div>

            {active && (
               <div
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-0 rounded-md border bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md"
               >
                  <div className="font-medium">{shortDay(active.date)}</div>
                  <div className="text-muted-foreground">
                     {active.completed} / {active.scope} done · {active.started} started
                  </div>
               </div>
            )}
         </div>

         <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{shortDay(points[0].date)}</span>
            <span className="flex items-center gap-2.5">
               {SERIES.map((series) => (
                  <span key={series.key} className="inline-flex items-center gap-1">
                     <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: series.color }}
                     />
                     {series.label}
                  </span>
               ))}
            </span>
            <span>{shortDay(points[points.length - 1].date)}</span>
         </div>
      </div>
   );
}
