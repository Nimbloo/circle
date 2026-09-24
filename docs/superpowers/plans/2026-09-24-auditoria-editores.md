# Auditoria de editores, comentários e alertas — Plano

## Estado (handoff entre agentes)

- **Onde:** branch `danilo/auditoria-editores` (a partir da `develop` @ `6578284`). Frentes E, C e T
  feitas em worktrees de subagente e integradas por merge.
- **Feito:** S (segurança), E (13/13), C (15/15), T (15/15 + 3 suspeitas confirmadas). Pontas
  fechadas na integração: save adiado do editor antigo após remount do 409 (geração do editor
  no `onSave`); `new-team-button` sem erro cru de 5xx.
- **Última verificação:** 2026-09-24, claude — `pnpm test` 428 arquivos / 2.155 testes, typecheck,
  lint e build limpos; first load `/inbox` 452→240 kB, `/projects` 470→325 kB.
- **Em andamento:** transação vazia do editor quebrava Tab-aninhar e task→sub-issue em teste
  (subagente investigando a causa raiz).
- **Próximo passo:** concluído — v0.44.0 em prd (24/09). Sequência: auditoria de fluxos na v0.45.0.
- **Bloqueios:** reprodução de "Back to app" / laço após excluir time e botões "apagados" dependem
  de navegador (bypass local de E2E negado pelo modo automático; extensão do Chrome desconectada).

## Decisões

- Usuário (24/09): "não deixe nenhum débito" — todos os achados da auditoria de 23/09.
- Idioma pt/en misturado nos textos **fica como está** (decisão da rodada 4).

## Frentes

- [x] **S. Segurança:** XSS armazenado no nó de vídeo (`href`/`src` só http(s), no editor e
      sanitizado no servidor para video/image/link); reação a comentário com checagem de escopo
      e `emoji` com `max(32)`; conferir o escopo de `GET /reviews/:id/comments`.
- [x] **E. Editor de blocos:** undo sem update remoto; trava de 409 em projeto e documento de
      time; placeholder `blob:` fora do save e do flush; outline sem mexer no DOM do ProseMirror;
      eco do próprio save sem refetch (e resposta velha descartada); pré-validação de upload;
      imagem externa colada; abrir link (Ctrl/Cmd+clique); rótulo acessível e listbox dos menus;
      409 na issue preserva a digitação local; editor fora do bundle de `/projects` e `/inbox`.
- [x] **C. Comentários e feed:** respostas órfãs (raiz fora da janela); paginação "Show older";
      evento de anexo com `issueId`; anexo que falha fica no composer com retry; menção com
      pontuação final e menção nova na edição; corrida reload × otimista; eco próprio sem GET
      extra; IME no autocomplete de menção; exclusão e criação transacionais; `maxLength` na UI;
      rascunho por issue; composer autoexpansível; acessibilidade; review (confirmação ao
      excluir, foco após enviar, Escape).
- [x] **T. Toasts e diálogos:** excluir no detalhe com a issue fora do store; Undo ligado ao
      ciclo do toast e textos coerentes; duplo clique em exclusões; `errorReason` nos fluxos
      principais e fallback de 5xx sem corpo; toast certo no reenvio de webhook; Slack com estado
      de erro; toasts de autosave/label com `id`; rollback por item nos workflows; erro de
      recarga não vira erro de mutação; impacto da exclusão de time com retry; aba Subscribed
      avisa falha; `ErrorState` com id único; rótulo do botão de emoji.
- [x] Verificação completa, PR, revisão do CodeRabbit no PR de release, release, prd (v0.44.0).
