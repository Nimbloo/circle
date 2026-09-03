# Produto — restos do editor, comentários de review, board por time, fatiamento do épico

**Data:** 2026-09-03

**Status:** em execução (3 grupos em paralelo + fatiamento do #25, integrados na branch
`danilo/produto-restos`)

Pedido: "faz os produtos". Restos conscientes registrados em `docs/PENDENCIAS.md`. Decisões
de produto são minhas e ficam aqui. O Linear é o benchmark.

## Contratos compartilhados

- Código em inglês, comentários/commits em pt-BR, Conventional Commits, sem referência a IA.
- Cores por token; toast de sucesso só após a API; splice/rollback (`apply*` do
  `workspace-store`, `issues-store`).
- Migrations: gerar com `pnpm db:generate`; na integração eu consolido numa só.
- Não editar `docs/PENDENCIAS.md` nem o plano.

## Grupo 1 — Editor completo (#16, restante)

- **Imagens:** `@tiptap/extension-image` (bloco, `max-width: 100%`, `alt`), com upload por
  arraste/colar/botão do menu "/": rota `POST /api/v1/uploads` (JSON `{ dataUrl, contentType,
fileName }`, `image/*` até 5 MB, mesmo `lib/api/s3-assets.ts` e CDN dos avatares/emojis,
  chave `uploads/<uuid>.<ext>`), devolve `{ url }`. Enquanto sobe, placeholder com opacidade
  reduzida; erro → toast e remoção do nó. `docToText` → `![alt](url)`.
- **Vídeo:** nó `video` (atom, `src`, `provider`): colar/inserir URL do YouTube, Vimeo, Loom
  vira `iframe` responsivo (16:9, `allowfullscreen`, sem autoplay); URL direta `.mp4/.webm`
  vira `<video controls>`. Item "Video" no menu "/" pede a URL. `docToText` → a URL.
- **Referência a issue:** `@tiptap/extension-mention` com gatilho `#` (e reconhecimento ao
  colar `ENG-12`): sugestões do `issues-store` (identifier + título, filtro por prefixo/texto,
  até 8), nó inline `issueRef { identifier }` renderizado como chip com ícone de status e
  título (dados vivos do store; se a issue sumiu, mostra só o identifier) linkando para
  `/<org>/issue/<identifier>`. `docToText` → `ENG-12`.
- **Modais de criação:** `components/layout/sidebar/create-new-issue/index.tsx` e
  `components/common/projects/create-project-dialog.tsx` trocam o textarea de descrição pelo
  `BlockEditor` (variante compacta, altura mínima menor) e enviam `descriptionDoc` no create
  (`CreateIssueInput`/`UpdateDetailInput` ganham `descriptionDoc?`; servidor deriva
  `description` como no PATCH). Templates que preenchem descrição em texto continuam
  funcionando (`blocksToDoc`).
- Testes: `test/block-editor.test.tsx` (inserir imagem via `onUpload` mockado, nó de vídeo a
  partir de URL, menção `#ENG` mostra sugestões e insere `issueRef`), `test/editor-doc.test.ts`
  (serialização dos três nós), PGlite da rota de upload (S3 mockado) e do create com
  `descriptionDoc`.

## Grupo 2 — Comentários e veredito de review (#22, restante)

- Tabela `review_comment(id, review_id fk cascade, author_id fk app_user, path varchar(512)
nullable, line integer nullable, kind varchar(16) 'comment'|'approve'|'request_changes',
body text, created_at, updated_at)`; índice por `review_id`.
- API: `GET/POST /api/v1/reviews/{id}/comments`, `PATCH/DELETE
/api/v1/reviews/{id}/comments/{commentId}` (edição/exclusão só do autor; admin exclui).
  DTO com autor (`id, name, avatarUrl`). Evento realtime `review_comment` (novo
  `CircleEntity`) publicado em create/update/delete; `use-live-sync` recarrega o review aberto.
- UI: aba **Overview** ganha a seção "Comments" (thread cronológica, composer no fim, editar/
  excluir do próprio, `kind` como badge "Approved"/"Changes requested") e o cabeçalho do
  detalhe mostra o último veredito. Aba **Diff**: cada `DiffView` ganha "Add comment" no
  cabeçalho (comentário do arquivo) e clique na numeração de linha abre um composer inline
  ancorado à linha (`path` + `line`); comentários ancorados aparecem sob a linha. Botões
  "Approve" / "Request changes" no cabeçalho do review criam comentário com `kind`.
- Testes PGlite (CRUD, permissão de autor, admin exclui, evento publicado) e renderizado da
  thread e do composer inline.

## Grupo 3 — Board de projetos por time (#19, resto) — contrato aditivo

- `PATCH /api/v1/projects/{id}` aceita `teamId` (valida time existente; registra activity
  "changed team"); `updateProject` move; issues do projeto NÃO mudam de time.
- Display de projetos: grouping ganha `'status'` (padrão do board) além de `'team'` e `'none'`;
  o board usa o grouping: colunas por status (drop → `statusId`) ou por time (drop →
  `teamId`). Lista continua honrando o grouping como hoje.
- Testes: PGlite do PATCH `teamId` (válido, inválido 400) e renderizado do board por time
  com drop chamando `api.projects.update` com `teamId`.

## Fatiamento do épico #25 (integrador)

Uma issue por tema, em pt-BR e linguagem de produto, label `feature`, com "Por quê", "Escopo",
"Fora do escopo" e "Aceitação"; o épico ganha checklist com os links e continua aberto.

## Aceitação

Cada grupo: `pnpm typecheck`, `pnpm lint`, `pnpm test` verdes, commits por entrega, sem dev
seam. Integração: merge, migration consolidada, suíte + build, smoke no Chrome (imagem,
vídeo, menção, comentário inline, board por time), PR para `develop`, release.
