# Auditoria de editores, comentários e alertas — Plano

## Estado (handoff entre agentes)

- **Onde:** branch `danilo/auditoria-editores` (a partir da `develop` @ `6578284`, v0.43.0 em prd).
  Frentes E, C e T em worktrees de subagente a partir do commit da frente S.
- **Feito:** plano.
- **Última verificação:** —
- **Próximo passo:** frente S (segurança), depois E/C/T em paralelo.
- **Bloqueios:** nenhum.

## Decisões

- Usuário (24/09): "não deixe nenhum débito" — todos os achados da auditoria de 23/09.
- Idioma pt/en misturado nos textos **fica como está** (decisão da rodada 4).

## Frentes

- [ ] **S. Segurança:** XSS armazenado no nó de vídeo (`href`/`src` só http(s), no editor e
      sanitizado no servidor para video/image/link); reação a comentário com checagem de escopo
      e `emoji` com `max(32)`; conferir o escopo de `GET /reviews/:id/comments`.
- [ ] **E. Editor de blocos:** undo sem update remoto; trava de 409 em projeto e documento de
      time; placeholder `blob:` fora do save e do flush; outline sem mexer no DOM do ProseMirror;
      eco do próprio save sem refetch (e resposta velha descartada); pré-validação de upload;
      imagem externa colada; abrir link (Ctrl/Cmd+clique); rótulo acessível e listbox dos menus;
      409 na issue preserva a digitação local; editor fora do bundle de `/projects` e `/inbox`.
- [ ] **C. Comentários e feed:** respostas órfãs (raiz fora da janela); paginação "Show older";
      evento de anexo com `issueId`; anexo que falha fica no composer com retry; menção com
      pontuação final e menção nova na edição; corrida reload × otimista; eco próprio sem GET
      extra; IME no autocomplete de menção; exclusão e criação transacionais; `maxLength` na UI;
      rascunho por issue; composer autoexpansível; acessibilidade; review (confirmação ao
      excluir, foco após enviar, Escape).
- [ ] **T. Toasts e diálogos:** excluir no detalhe com a issue fora do store; Undo ligado ao
      ciclo do toast e textos coerentes; duplo clique em exclusões; `errorReason` nos fluxos
      principais e fallback de 5xx sem corpo; toast certo no reenvio de webhook; Slack com estado
      de erro; toasts de autosave/label com `id`; rollback por item nos workflows; erro de
      recarga não vira erro de mutação; impacto da exclusão de time com retry; aba Subscribed
      avisa falha; `ErrorState` com id único; rótulo do botão de emoji.
- [ ] Verificação completa, PR, revisão do CodeRabbit no PR de release, release, prd.
