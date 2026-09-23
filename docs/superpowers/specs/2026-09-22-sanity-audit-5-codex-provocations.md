## Resultado

Auditoria somente leitura concluída. Nenhum arquivo produtivo foi alterado; os cinco probes `_probe_*` foram removidos e a árvore ficou limpa.

Li:

- [AGENTS.md](../../../AGENTS.md)
- [findings](../../../docs/superpowers/specs/2026-09-19-sanity-audit-4-findings.md)
- [plano](../../../docs/superpowers/plans/2026-09-19-sanity-audit-4.md)

Validações executadas:

- Probes descartáveis: `5 falharam, 1 passou`.
- Testes direcionados existentes: `14 arquivos, 77 testes passaram`.
- Não executei build, dev ou suíte completa.

### Falhas reproduzidas

1. Mover uma label para um grupo não remove labels conflitantes já existentes na issue.
2. Excluir um time deixa `review.resolves_identifier` apontando para uma issue apagada.
3. Undo restaura uma issue após receber `issue.deleted` de outra aba.
4. Outro membro consegue editar update de projeto de autoria alheia.
5. Migrations 0050/0051 não são idempotentes; segunda execução falha em `relation "import_job" already exists`.

A migration 0051 passou no caso de label legada com `group_id` sem grupo: ela cria o grupo placeholder.

## Cenários adversariais

### 1. Corpo de documento

- Abrir o mesmo documento em duas abas, editar textos diferentes e salvar quase simultaneamente. Esperado: primeira gravação vence; segunda recebe `409` e carrega a versão atual. O lock e `descriptionVersion` estão em [documents.ts:359](../../../lib/api/documents.ts#L359). O cenário sequencial equivalente passou em [document-body.test.ts:80](../../../test/document-body.test.ts#L80).

- Excluir o documento em uma aba enquanto a outra está editando. Se o evento SSE chegar, a tela vira “Document not found”. Porém, se o PATCH retornar primeiro, `saveBody` apenas exibe toast e mantém o editor em estado `ready`; não muda para `notfound` ([team-document.tsx:127](../../../components/common/teams/team-document.tsx#L127)). Suspeita de editor obsoleto.

- Limpar o nome e sair do campo. O cliente ignora silenciosamente a string vazia ([team-document.tsx:143](../../../components/common/teams/team-document.tsx#L143)); esperado seria feedback explícito ou restauração visível.

- Digitar 129–196 caracteres. O input aceita 196, mas a API aceita apenas 128 ([team-document.tsx:286](../../../components/common/teams/team-document.tsx#L286), [route.ts:31](../../../app/api/v1/documents/[id]/route.ts#L31)). O título otimista é revertido após erro; risco de UX.

- Guest membro do time pode editar o corpo; Guest de outro time recebe `403`. Teste existente passou. Metadados continuam restritos a criador/admin ([documents.ts:328](../../../lib/api/documents.ts#L328)).

- Eventos de criação, edição e exclusão carregam `teamId`; teste existente passou ([documents-joinrequests-events.test.ts:28](../../../test/documents-joinrequests-events.test.ts#L28)).

### 2. Grupos de label

- Criar ou adicionar duas labels do mesmo grupo à issue: exclusividade funciona; testes existentes passaram ([issues.ts:1718](../../../lib/api/issues.ts#L1718)).

- Criar issue com labels A e B do mesmo grupo também é validado pelo serviço.

- Criar issue com A sem grupo e B no grupo; depois editar A para o grupo de B. Esperado: conflito resolvido deterministicamente, permanecendo uma só label. Resultado real do probe: duas labels permanecem. O PATCH apenas atualiza a label ([labels.ts:137](../../../lib/api/labels.ts#L137)). Falha confirmada.

- Apagar grupo com labels: labels ficam sem grupo; teste existente passou.

- Nome duplicado com diferença de caixa/espaços: retorna `409`; teste existente passou. Ainda há risco de corrida entre duas criações, pois a unicidade é verificada na aplicação e não há índice único em `label_group`.

- Bootstrap expõe `labelGroups`; teste existente passou.

### 3. Hierarquia de times

- A → B; tentar mover A para dentro de B. Rejeitado pelo `assertTeamParent`; testes existentes passaram ([teams.ts:502](../../../lib/api/teams.ts#L502)).

- Criar árvore com quatro ou mais níveis. Não há limite de três: serviço aceita até 64 níveis e a árvore visual protege até 32 ([hierarchy.ts:15](../../../lib/api/hierarchy.ts#L15), [team-tree.ts:13](../../../lib/team-tree.ts#L13)). Sem falha observada.

- Excluir pai com filhos. Os filhos são reancorados no avô ([teams.ts:717](../../../lib/api/teams.ts#L717)); teste existente passou.

- Guest membro direto apenas do sub-time: `visibleTeamIds` inclui esse time e seus descendentes; o sub-time aparece como raiz na árvore. Comportamento coerente.

- Guest membro apenas do pai: a API inclui os sub-times no escopo, mas a sidebar renderiza somente `teams.filter(t => t.joined)` ([nav-teams.tsx:212](../../../components/layout/sidebar/nav-teams.tsx#L212)). O sub-time pode ser acessível por URL, mas não aparecer em “Your teams”. Suspeita de divergência UI/API.

### 4. Updates de projeto e initiative

- Editar update de projeto criado por outro usuário membro. O probe esperava `403`, mas a operação foi aceita. A rota verifica apenas permissão de escrita no projeto ([project-detail.ts:627](../../../lib/api/project-detail.ts#L627)); não verifica `authorId`.

- A mesma lacuna existe em initiative: a rota verifica escopo, mas `editInitiativeUpdate` não recebe ator nem verifica autoria ([initiative-detail.ts:156](../../../lib/api/initiative-detail.ts#L156), [route.ts:20](../../../app/api/v1/initiatives/[id]/updates/[uid]/route.ts#L20)).

- Excluir o último update deve retornar health para `no-update`; testes existentes passaram.

- Editar/excluir simultaneamente: há TOCTOU. O update é lido antes da transação e depois atualizado/apagado sem verificar quantidade afetada ([project-detail.ts:635](../../../lib/api/project-detail.ts#L635), [project-detail.ts:685](../../../lib/api/project-detail.ts#L685)). Uma resposta pode declarar sucesso e publicar evento após o registro já ter sido removido.

### 5. Reordenação de favoritos

- ID inexistente: ignorado; favoritos próprios omitidos são anexados depois. Testes existentes passaram ([favorites.ts:154](../../../lib/api/favorites.ts#L154)).

- ID de outro usuário: ignorado porque a lista é filtrada pelos favoritos do usuário atual. Teste passou.

- Ordem parcial: itens não enviados preservam presença e vão ao final. Teste passou.

- Ordem duplicada, por exemplo `{ order: [A, A] }`: o schema não exige unicidade ([route.ts:31](../../../app/api/v1/favorites/route.ts#L31)). Pode retornar `reordered: 2` e atribuir posição duplicada intermediária. Suspeita não coberta.

### 6. Exclusão em cascata de time

- Issue apagada é pai de issue de outro time: o pai externo é nulificado; teste passou.

- Projeto do time ligado a initiative: o vínculo do projeto removido é apagado, mas initiative e projetos de outros times permanecem; teste passou.

- Anexos de issues/comentários: linhas de banco e objetos S3 são removidos; teste passou.

- Review com `resolves_identifier = CORE-1`: após excluir o time, a issue desaparece, mas a review continua com `CORE-1` e o título antigo. Probe falhou. Não há tratamento de `review` em [teams.ts:571](../../../lib/api/teams.ts#L571).

- O modal de impacto não conta anexos, reviews nem vínculos de initiative; só conta issues, projetos, ciclos, views, pastas e documentos ([teams.ts:528](../../../lib/api/teams.ts#L528)). A confirmação subestima o impacto real.

### 7. Undo de exclusão de issue

- Excluir → desfazer → excluir novamente: a máquina de estados local parece correta; os testes básicos de Undo e `pagehide` passaram.

- Excluir duas vezes seguidas a mesma issue: a segunda chamada encontra a issue ausente e não gera novo DELETE efetivo. Não há teste específico, mas o fluxo é consistente com o código.

- Excluir localmente, receber `issue.deleted` de outra aba durante os 6 segundos e clicar Undo: esperado é não restaurar. Resultado real: a issue volta ao Zustand. `removeRemote` só remove do store ([issues-store.ts:371](../../../store/issues-store.ts#L371)); não marca o Undo como encerrado. Falha confirmada.

### 8. Cache de catálogos e LISTEN

O `subscribe` não ouve apenas eventos locais.

O caminho é:

1. `pg` recebe `notification`.
2. `runListener` faz `JSON.parse` ([events.ts:281](../../../lib/api/events.ts#L281)).
3. O listener remove `__inst` e chama `fanOutLocal` ([events.ts:339](../../../lib/api/events.ts#L339)).
4. `catalogs.ts` está inscrito e executa `resetCatalogCache` para `catalog`/`label` ([catalogs.ts:46](../../../lib/api/catalogs.ts#L46)).

Os testes unitários de listener e cache passaram. Não foi feito teste real multi-pod contra PostgreSQL; a conclusão é OK por código e cobertura do listener, não por navegador/infra real.

### 9. Migrations 0050/0051

- Reexecutar 0050 falha imediatamente em `CREATE TABLE "import_job"` sem `IF NOT EXISTS`. O probe capturou:

   `relation "import_job" already exists`

- Mesmo ultrapassando isso, 0050 também recria constraints e índices sem proteção ([0050](../../../db/migrations/0050_wealthy_sway.sql#L1)).

- 0051 também não é idempotente: recria `label_group` e adiciona `description_doc` sem `IF NOT EXISTS` ([0051](../../../db/migrations/0051_label_group_document_body.sql#L1)).

- Label legada com `group_id = 'gone'`: o `INSERT ... SELECT DISTINCT ... ON CONFLICT DO NOTHING` cria o grupo placeholder; probe passou ([0051:11](../../../db/migrations/0051_label_group_document_body.sql#L11)).

## Tabela cenário × resultado

| Cenário                                    | Resultado                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Autosave concorrente com versão antiga     | OK — teste existente                                                    |
| Documento apagado durante autosave         | Suspeita não provada no navegador; resposta pode deixar editor obsoleto |
| Nome vazio                                 | Suspeita — silenciosamente ignorado                                     |
| Nome acima de 128 caracteres               | Suspeita — limite UI/API inconsistente                                  |
| Guest membro edita corpo                   | OK — teste existente                                                    |
| Evento SSE de documento leva `teamId`      | OK — teste existente                                                    |
| Exclusividade ao criar/adicionar labels    | OK — teste existente                                                    |
| Mover label para grupo já usado na issue   | Provado por teste — falhou                                              |
| Apagar grupo libera labels                 | OK — teste existente                                                    |
| Nome duplicado de grupo                    | OK sequencialmente; corrida não provada                                 |
| Bootstrap expõe grupos                     | OK — teste existente                                                    |
| Ciclo/mover para descendente               | OK — teste existente                                                    |
| Excluir pai reancora filhos                | OK — teste existente                                                    |
| Profundidade acima de 3                    | OK por código até limites 32/64                                         |
| Guest membro direto do sub-time            | OK por código                                                           |
| Guest membro do pai vê sub-time na sidebar | Suspeita — API permite, sidebar filtra                                  |
| Editar update de outro autor               | Provado por teste — aceito indevidamente sob política autor-only        |
| Excluir último update                      | OK — teste existente                                                    |
| Corrida editar/excluir update              | Suspeita confirmada por TOCTOU no código                                |
| Favorito inexistente/estrangeiro           | OK — teste existente                                                    |
| Favoritos com ordem parcial                | OK — teste existente                                                    |
| Ordem duplicada de favoritos               | Suspeita não provada                                                    |
| Cascata de parent issue externa            | OK — teste existente                                                    |
| Projeto ligado a initiative                | OK — teste existente                                                    |
| Anexos                                     | OK — teste existente                                                    |
| Review referenciando issue apagada         | Provado por teste — falhou                                              |
| Delete → Undo → delete                     | OK por inspeção; teste direto ausente                                   |
| Delete duplicado da mesma issue            | OK por inspeção; teste direto ausente                                   |
| SSE remoto durante Undo                    | Provado por teste — falhou                                              |
| LISTEN remoto invalida catálogo            | OK por código/testes de listener                                        |
| Reexecução 0050/0051                       | Provado por teste — falhou                                              |
| `group_id` legado sem grupo                | Provado por teste — passou                                              |

## Top 10 por risco

1. **Undo restaura issue já apagada remotamente** — probe falhou; pode reintroduzir dado que o servidor já removeu.
2. **Referência quebrada em `review.resolves_identifier`** — probe falhou; review aponta para issue inexistente após exclusão de time.
3. **Violação de exclusividade de grupos de labels** — probe falhou; issue pode persistir com duas labels do mesmo grupo.
4. **Updates editáveis por terceiros** — probe falhou; project e initiative não verificam autoria.
5. **Migrations não idempotentes** — probe falhou em `import_job`; rerun manual ou recovery automatizado quebra.
6. **Editor de documento obsoleto após exclusão concorrente** — PATCH não-409 só mostra toast e mantém o editor.
7. **Corrida editar/excluir update** — leitura fora da transação e ausência de `rowCount` permitem sucesso fantasma.
8. **Modal de exclusão subestima impacto** — não conta anexos, reviews ou vínculos de initiative.
9. **Guest com escopo correto, mas navegação incompleta** — API inclui descendentes; sidebar mostra apenas `joined`.
10.   **Reordenação aceita IDs duplicados** — contrato não valida unicidade; pode gerar posições inconsistentes e contagem incorreta.
