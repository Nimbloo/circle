# Pendências do Circle

Estado em **2026-09-01**, sobre a `develop` (v0.21.0).

> **As [issues](https://github.com/Nimbloo/circle/issues) são a fonte da verdade** sobre
> escopo. Este documento registra o que elas **não** capturam: bloqueios que vivem em
> outro repositório, decisões que dependem de você, e o estado operacional do momento.
>
> **Leia com data na mão.** A seção "Operacional" envelhece em dias; as de decisão e
> bloqueio, em semanas. Se divergir da issue, a issue vence.

---

## Operacional (envelhece rápido)

**A `develop` está 7 commits à frente da `main`.** O `package.json` já está em `0.21.0`
e a última tag é `v0.20.0`. Está parado em produção, entre outras coisas, o **conserto de
um crash**: a página de Cycles estourava `ReferenceError` porque `teamId` era usado num
seletor do zustand antes da declaração.

Para promover: PR `develop → main`. O CI cria tag e release; o ArgoCD faz o rollout.

**`AGENTS.md` e `.agents/skills/` não estão rastreados nem ignorados.** Apareceram em
01/09 09:45 — é o guia do projeto para o Codex, espelhando o `CLAUDE.md`. Enquanto ficam
soltos, estão a um `git add -A` de entrar sem querer. Decidir: versionar de propósito, ou
adicionar ao `.gitignore`.

---

## Bloqueado em outro repositório

Nada aqui avança só com código deste repo.

### Imagem ARM — [#27](https://github.com/Nimbloo/circle/issues/27)

Único item restante da issue (gate de CI, tag e release já saíram). O build é
`linux/amd64`; mudar exige trocar o `nodeSelector` para `default-arm` no chart
`circle-prd` do `nimbloo-k8s` **na mesma janela**. Publicar ARM-only sozinho derruba a
produção com `exec format error`.

Caminho seguro: publicar **multi-arch** primeiro (`linux/amd64,linux/arm64`) — o
manifesto serve as duas — e mover o chart depois, sem coordenação. Custo a medir: build
arm64 cross-compilado por QEMU é lento.

### Tracing para o Tempo — [#28](https://github.com/Nimbloo/circle/issues/28)

A metade de **logging já saiu**: 113 das 130 chamadas a `handle()` não passavam `req`,
então logavam erro sem rota e registravam `method=UNKNOWN` — 87% do tráfego invisível na
métrica. Corrigido, com guarda (`test/handle-req-guard.test.ts`).

Falta o exporter OTel, que exige **validar a ingestão no cluster**. A armadilha, já
registrada no CLAUDE.md global e vivida aqui com o Sentry: endpoint configurado sem o
reporter ativo fica _"configurado e mudo"_ — pior que não ter, porque dá impressão de
cobertura.

### Sentry — DSN

O SDK está nos três runtimes e o build já injeta `NEXT_PUBLIC_SENTRY_DSN` como build arg
(`Dockerfile` + `vars.NEXT_PUBLIC_SENTRY_DSN` no CI). Falta **criar a variável de repo**
com o DSN do projeto `circle`, e mergear o
[PR #645 no `nimbloo-k8s`](https://github.com/Nimbloo/nimbloo-k8s/pull/645) (env de
runtime, necessário para o lado servidor).

⚠️ **`NEXT_PUBLIC_*` é embutido no bundle do browser em tempo de build.** Definir o DSN só
no chart ativaria server e edge e deixaria o **cliente mudo** — foi um bug real da
implementação original, corrigido, mas a pegadinha continua valendo para qualquer
`NEXT_PUBLIC_*` novo.

---

## Decisões suas (não é falta de código)

### Datas reais em iniciativas

`target` é `varchar` livre e aceita `"Q3 2026"`. Criar `startDate`/`targetDate` como as de
project é trivial; **o que fazer com os valores já gravados** não é — não convertem para
data sem perda. Manter os dois campos, migrar o que der e descartar o resto, ou deixar
como está.

### Estratégia de snapshot para cycles — [#24](https://github.com/Nimbloo/circle/issues/24)

O `scopeDelta` real exige saber **quando a issue entrou no ciclo**, e isso não existia. A
gravação desse histórico **começou** (eventos de `cycle` e `estimate` agora registram de/
para, e o auto-add passou a emitir evento), mas o dado retroativo não existe.

Para fechar, é preciso `cycle_snapshot(cycle_id, date, scope, started, completed)` com
`UNIQUE(cycle_id, date)`. **Onde rodar o job é a decisão:** o app não tem scheduler e o
chart não tem CronJob. Ou se adiciona um CronJob, ou se faz upsert idempotente no
bootstrap — lazy, igual ao rollover, sem infra nova, com buracos em dias sem acesso
(interpoláveis).

### Editor de blocos — [#16](https://github.com/Nimbloo/circle/issues/16)

Maior item isolado do backlog. Antes de começar: escolher a biblioteca e **o formato de
storage** dos blocos. Hoje a descrição é texto plano e `textToBlocks` só emite `paragraph`.

---

## Construção de produto

Roadmap, não limpeza. Priorize por valor.

| Issue                                              | O que falta de verdade                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#19](https://github.com/Nimbloo/circle/issues/19) | **Só dois itens**: DnD no board de projetos e reschedule no timeline. Health do update, resources edit/remove e delete de milestone **já estão prontos** — a descrição original está obsoleta. O repo já tem `react-dnd`. Nota: o board agrupa por **time** por default, então "DnD muda status" precisa de revalidação do requisito. |
| [#22](https://github.com/Nimbloo/circle/issues/22) | Webhook e "For you/Created" **já saíram**. Restam: colunas para files/commits/diff (schema novo — hoje o sync busca `changed_files` e **descarta**), e `checksPassed/Total` via Checks API (as colunas existem, são hard-coded `0` nos dois caminhos de escrita).                                                                     |
| [#24](https://github.com/Nimbloo/circle/issues/24) | Cool-down (não existe em lugar nenhum do repo) e snapshots — ver decisão acima. Burn-up real **já saiu**.                                                                                                                                                                                                                             |
| [#16](https://github.com/Nimbloo/circle/issues/16) | Editor de blocos — ver decisão acima.                                                                                                                                                                                                                                                                                                 |
| [#25](https://github.com/Nimbloo/circle/issues/25) | Épico de paridade com o Linear. Serve para **fatiar**, não para executar.                                                                                                                                                                                                                                                             |

---

## O que este documento existe para lembrar

Em 31/08–01/09 foram auditadas todas as issues abertas e a leva fechada em 28/08. **Sete
issues descreviam como ausente algo que já estava construído**, e **duas foram fechadas
sem a aceitação cumprida** (#20, com 2 de 3 critérios; #24, com 1 de 3 — esta foi
reaberta).

Mais importante: os problemas que causaram estrago real **não estavam em issue nenhuma**.
Um bypass de autenticação, perda silenciosa de vínculo de projeto, membro fantasma sem
acesso, 87% da métrica HTTP cega, Sentry que reportaria pela metade, variação de escopo
de ciclo que nunca renderiza — todos pareciam prontos.

Daí os **seis guardas estruturais** no CI, que falham a build quando a classe do bug
volta:

| Guarda                          | O que impede                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| `route-auth-guard`              | Rota nova sob `/api/v1` nascer sem checagem de autenticação                 |
| `store-selector-guard`          | Assinar getter do zustand e chamá-lo fora do seletor (componente congelado) |
| `handle-req-guard`              | Chamada a `handle()` sem `req` (log sem rota, métrica `UNKNOWN`)            |
| `view-filter-parity`            | Filtro de view divergir entre servidor e cliente                            |
| `insights-matrix-parity`        | Matriz status × prioridade divergir entre servidor e cliente                |
| `no-use-before-define` (ESLint) | Usar variável antes da declaração em seletor síncrono — o crash de Cycles   |

**A régua daqui pra frente:** ao pegar uma issue, verifique no código antes de construir.
Sete vezes em dois dias a descrição estava errada.
