# Circle — endurecimento após auditoria de sanidade

## Objetivo

Corrigir os problemas acionáveis encontrados na auditoria de performance,
robustez, integridade de dados e UX/UI, sem quebrar os consumidores atuais da
API e sem remover o seam local de desenvolvimento.

## Escopo

### Integridade e autorização

- Uma issue só poderá apontar para pai, projeto, ciclo ou milestone compatíveis
  com o time efetivo da issue.
- Uma iniciativa só poderá ser criada ou movida para uma iniciativa pai dentro
  do escopo autorizado.
- A relação iniciativa–projeto continuará many-to-many, pois a hierarquia
  permite que um projeto participe do rollup da iniciativa mãe e da filha.
  `project.initiativeId` continuará representando a associação principal; a
  tabela de vínculo será preservada para os rollups.

### Robustez de payloads

- Importações terão limites explícitos de tamanho, linhas, colunas e células.
- `externalId` duplicado no mesmo arquivo será rejeitado antes de writes.
- Compressão respeitará `q=0` e preservará o corpo original quando a
  compressão falhar.

### Performance

- Feeds de issue/projeto terão limite padrão e paginação opcional, preservando
  a resposta atual quando nenhum parâmetro for enviado.
- Listagens de projetos aplicarão escopo e filtros no banco quando possível.
- O workspace não duplicará payloads pesados desnecessariamente.
- Busca poderá executar grupos independentes em paralelo e terá fallback
  limitado.
- Housekeeping lazy será protegido contra concorrência e não repetirá trabalho
  dentro da mesma janela temporal.

### UX/UI e acessibilidade

- O documento HTML declarará `pt-BR`.
- O viewport não bloqueará zoom.
- Textos de interface novos e existentes serão centralizados nos recursos
  pt-BR do projeto, sem introduzir uma dependência de i18n maior do que a
  necessária.
- Datas usarão locale/timezone consistentes.
- Tokens e componentes existentes continuarão sendo usados; não haverá
  reescrita visual ampla sem evidência de inconsistência.

### Entrega e hardening

- CI executará build em validações de mudança.
- Bundles serão reduzidos apenas onde houver divisão segura e mensurável.
- CSP será endurecida sem quebrar o bootstrap de tema.
- Pendências dependentes de infraestrutura externa permanecerão documentadas.

## Fora do escopo local

- Provisionamento de Bedrock, Tempo, Sentry, PAT do GitHub, imagem ARM ou
  mudanças em repositórios de infraestrutura.
- Mudança do envelope de sucesso ou do formato ProblemDetail.
- Refatoração completa dos stores ou troca da biblioteca visual.

## Critérios de aceite

- Testes de regressão cobrem todas as combinações inválidas de relações entre
  times e o caso de duplicidade de import.
- A sincronização preserva vínculos válidos de rollup e mantém a associação
  principal coerente.
- Imports grandes são rejeitados com `413` antes de materializar payloads
  excessivos.
- Typecheck, lint, testes e build passam.
- As páginas principais mantêm comportamento visual e funcional nos temas
  claro/escuro.
- O seam `CIRCLE_DEV_AUTH_EMAIL` continua ausente do histórico versionado.
