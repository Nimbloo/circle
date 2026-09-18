/**
 * Entrada de rota do workspace. Template (não layout) remonta a cada navegação — por
 * isso fica ABAIXO do `[orgId]/layout`: DataHydrator, SSE e sidebar não remontam. Não
 * há layouts aninhados sob `[orgId]`, então nenhum estado persistente mora aqui dentro.
 * Só CSS (`.route-enter` em globals.css): sem animação de saída, sem JS.
 */
export default function OrgTemplate({ children }: { children: React.ReactNode }) {
   return <div className="route-enter h-full w-full">{children}</div>;
}
