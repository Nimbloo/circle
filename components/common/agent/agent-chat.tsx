'use client';

import { InlineText } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useAgentChatStore, type AgentMessage } from '@/store/agent-chat-store';
import { ArrowUp, Bot, CalendarClock, ListTodo, Sparkles, X } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LoadingArea } from '@/components/common/loading-area';
import { AGENT_MESSAGE_MAX_LENGTH } from '@/lib/agent-limits';

/** Status HTTP de um erro do cliente da API (sem depender da classe em runtime). */
function httpStatusOf(error: unknown): number | undefined {
   if (!(error instanceof Error) || error.name !== 'ApiError') return undefined;
   const status = (error as { status?: unknown }).status;
   return typeof status === 'number' ? status : undefined;
}

/**
 * Mensagem de falha do Agent (co#12): provedor fora do ar (503) e erro do servidor não
 * podem culpar a conexão do usuário — só a falha de rede fala de conexão.
 */
export function agentErrorMessage(error: unknown): string {
   const status = httpStatusOf(error);
   if (status !== undefined) {
      if (status === 503)
         return 'O Agent está indisponível agora (o provedor não respondeu). Tente de novo em instantes.';
      if (status >= 500) return 'O Agent falhou ao responder. Tente de novo em instantes.';
      return (error as Error).message || 'Não consegui responder agora.';
   }
   return 'Não consegui responder agora. Verifique a conexão e tente de novo.';
}

/** Prompts de exemplo — perguntas reais que o Agent responde consultando o workspace. */
const agentExamples = [
   {
      id: 'in-progress',
      icon: ListTodo,
      title: 'O que está em andamento?',
      description: 'Lista as issues em progresso de um time.',
      prompt: 'Quais issues estão em "In Progress" no time ENG?',
   },
   {
      id: 'my-issues',
      icon: Sparkles,
      title: 'Minhas issues',
      description: 'Resume as suas issues em aberto por status.',
      prompt: 'Quais são as minhas issues em aberto? Agrupe por status.',
   },
   {
      id: 'cycles',
      icon: CalendarClock,
      title: 'Ciclos do time',
      description: 'Mostra os ciclos e suas datas.',
      prompt: 'Quais ciclos existem no time ENG e quais as datas?',
   },
];

/** Aviso honesto: respostas são geradas por IA sobre dados reais e podem conter erros. */
function AiNotice() {
   return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
         <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-medium text-primary">
            <Sparkles className="size-3" />
            IA
         </span>
         <span>Respostas geradas por IA sobre os seus dados — confira o que for crítico.</span>
      </div>
   );
}

/** Memoizada: a resposta chega inteira e só a bolha que mudou re-renderiza. */
const AgentMessageBody = memo(function AgentMessageBody({
   content,
   streaming,
}: {
   content: string;
   streaming?: boolean;
}) {
   const lines = content.split('\n');
   return (
      <div className="text-sm leading-relaxed flex flex-col gap-1">
         {lines.map((line, index) => {
            const trimmed = line.trim();
            if (trimmed === '') return <span key={index} className="h-1.5" />;
            if (trimmed.startsWith('- ')) {
               return (
                  <span key={index} className="flex gap-2">
                     <span className="text-muted-foreground mt-[7px] size-1 rounded-full bg-muted-foreground shrink-0" />
                     <span>
                        <InlineText text={trimmed.slice(2)} />
                     </span>
                  </span>
               );
            }
            const numbered = trimmed.match(/^(\d+)\.\s+(.*)$/);
            if (numbered) {
               return (
                  <span key={index} className="flex gap-2">
                     <span className="text-muted-foreground tabular-nums">{numbered[1]}.</span>
                     <span>
                        <InlineText text={numbered[2]} />
                     </span>
                  </span>
               );
            }
            return (
               <span key={index}>
                  <InlineText text={trimmed} />
               </span>
            );
         })}
         {streaming && <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse" />}
      </div>
   );
});

/** Uma bolha do chat; memoizada pela referência da mensagem (o store preserva as demais). */
const ChatMessage = memo(function ChatMessage({
   message,
   onRetry,
}: {
   message: AgentMessage;
   /** Presente só na bolha de erro: reenvia a pergunta que falhou. */
   onRetry?: () => void;
}) {
   const avatarUrl = useWorkspaceStore((s) => s.me?.avatarUrl);
   const name = useWorkspaceStore((s) => s.me?.name) ?? 'You';

   if (message.role === 'user') {
      return (
         <div className="content-enter flex justify-end">
            <div className="flex items-start gap-2.5 max-w-[85%]">
               <div className="rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm">
                  {message.content}
               </div>
               <Avatar className="size-6 mt-1 shrink-0">
                  <AvatarImage src={avatarUrl ?? undefined} alt={name} />
                  <AvatarFallback>{name[0]}</AvatarFallback>
               </Avatar>
            </div>
         </div>
      );
   }
   return (
      <div className="content-enter flex items-start gap-2.5">
         <span className="mt-1 inline-flex size-6 items-center justify-center rounded-full border bg-container shrink-0">
            <Bot className="size-3.5" />
         </span>
         <div className={cn('min-w-0 flex-1', message.error && 'text-destructive')}>
            <AgentMessageBody content={message.content} streaming={message.streaming} />
            {message.error && onRetry && (
               <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
                  Tentar de novo
               </Button>
            )}
         </div>
      </div>
   );
});

/** Distância (px) do fim abaixo da qual o chat segue a resposta rolando sozinho. */
const STICK_TO_BOTTOM_PX = 80;

function ChatComposer({
   onSend,
   autoFocus,
   large,
   disabled,
}: {
   onSend: (input: string) => void;
   autoFocus?: boolean;
   large?: boolean;
   disabled?: boolean;
}) {
   const [value, setValue] = useState('');

   const submit = () => {
      if (disabled || value.trim() === '') return;
      onSend(value.trim());
      setValue('');
   };

   return (
      <div className="w-full border rounded-xl bg-container shadow-xs">
         <textarea
            value={value}
            autoFocus={autoFocus}
            disabled={disabled}
            maxLength={AGENT_MESSAGE_MAX_LENGTH}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
               if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
               }
            }}
            placeholder="Ask the agent…"
            className={cn(
               'w-full resize-none bg-transparent px-4 pt-3.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60',
               large ? 'min-h-16' : 'min-h-12'
            )}
         />
         <div className="flex items-center justify-end px-2.5 pb-2.5">
            <Button
               size="icon"
               className="size-7 rounded-full"
               onClick={submit}
               disabled={disabled || value.trim() === ''}
               aria-label="Send"
            >
               <ArrowUp className="size-4" />
            </Button>
         </div>
      </div>
   );
}

/**
 * Página do Agent: pergunte qualquer coisa e obtenha uma resposta de IA REAL
 * (Bedrock/Claude via `api.agent.send`) sobre os dados vivos do workspace. A resposta
 * aparece inteira quando chega. As conversas são persistidas e podem ser revisitadas
 * pelo dropdown do header.
 */
export default function AgentChat() {
   // Seletores estreitos: `find` devolve a referência guardada (estável entre updates de
   // outros chats); ações têm referência fixa.
   const activeChat = useAgentChatStore((s) => s.chats.find((chat) => chat.id === s.activeChatId));
   const activeChatId = useAgentChatStore((s) => s.activeChatId);
   const resolveMessage = useAgentChatStore((s) => s.resolveMessage);
   const failMessage = useAgentChatStore((s) => s.failMessage);
   const hydrate = useAgentChatStore((s) => s.hydrate);
   const loadChat = useAgentChatStore((s) => s.loadChat);
   const rekeyChat = useAgentChatStore((s) => s.rekeyChat);
   const [examplesDismissed, setExamplesDismissed] = useState(false);
   const scrollRef = useRef<HTMLDivElement>(null);
   // Segue o fim só se o usuário já estava lá (não arranca quem rolou para ler acima).
   const stickToBottom = useRef(true);

   const messages = activeChat?.messages;
   const isStreaming = messages?.some((message) => message.streaming) ?? false;
   const messageCount = messages?.length ?? 0;

   // Mensagem nova (envio/troca de chat): sempre vai para o fim.
   useLayoutEffect(() => {
      stickToBottom.current = true;
   }, [messageCount, activeChatId]);

   useEffect(() => {
      const el = scrollRef.current;
      if (el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight });
   }, [messages]);

   // Carrega a lista de chats persistidos ao montar.
   useEffect(() => {
      void hydrate();
   }, [hydrate]);

   // Ao abrir um chat persistido ainda não carregado, busca as mensagens do servidor.
   const needsLoad =
      !!activeChat?.persisted && !activeChat.loadState && activeChat.messages.length === 0;
   useEffect(() => {
      if (needsLoad && activeChatId) void loadChat(activeChatId);
   }, [needsLoad, activeChatId, loadChat]);

   const handleSend = async (input: string) => {
      if (isStreaming) return;
      // Chat ainda não gravado (novo, ou cuja 1ª resposta falhou): o servidor cria.
      const persisted = activeChat?.persisted ?? false;
      // Ação que devolve os ids criados: lida no handler, não assinada no render.
      const { chatId, assistantMessageId } = useAgentChatStore.getState().sendMessage(input);
      try {
         // Persiste no servidor (cria o chat se for novo) e devolve a resposta.
         const res = await api.agent.send(persisted ? chatId : null, input);
         if (!persisted) rekeyChat(chatId, res.chatId, res.title);
         resolveMessage(res.chatId, assistantMessageId, res.reply);
      } catch (error) {
         // 1º envio que falhou depois de o servidor gravar o chat: adota o id dele, senão
         // o retry mandaria `chatId: null` e criaria um segundo chat.
         const saved = (error as { problem?: { chatId?: unknown; title?: unknown } }).problem;
         const failedChatId =
            !persisted && typeof saved?.chatId === 'string' ? saved.chatId : chatId;
         if (failedChatId !== chatId)
            rekeyChat(chatId, failedChatId, typeof saved?.title === 'string' ? saved.title : '');
         failMessage(failedChatId, assistantMessageId, agentErrorMessage(error));
      }
   };

   /* ------------------------------- Hero ------------------------------- */
   if (!activeChat) {
      return (
         <div className="w-full h-full flex flex-col items-center overflow-y-auto">
            <div className="w-full flex justify-center border-b bg-container px-4 py-2">
               <AiNotice />
            </div>

            <div className="flex-1 w-full max-w-2xl px-6 flex flex-col justify-center pb-24">
               <div className="flex justify-center mb-8 text-muted-foreground/30">
                  <Bot className="size-24" strokeWidth={1} />
               </div>
               <ChatComposer onSend={handleSend} autoFocus large disabled={isStreaming} />

               {!examplesDismissed && (
                  <div className="mt-6">
                     <div className="flex items-center justify-between mb-3">
                        <span className="text-sm text-muted-foreground">
                           Get started with some examples
                        </span>
                        <button
                           onClick={() => setExamplesDismissed(true)}
                           className="text-muted-foreground hover:text-foreground transition-colors"
                           aria-label="Dismiss examples"
                        >
                           <X className="size-4" />
                        </button>
                     </div>
                     <div className="grid sm:grid-cols-3 gap-3">
                        {agentExamples.map((example) => (
                           <button
                              key={example.id}
                              type="button"
                              onClick={() => handleSend(example.prompt)}
                              className="border rounded-lg p-4 text-left hover:bg-accent/40 transition-colors"
                           >
                              <example.icon className="size-4 text-muted-foreground" />
                              <p className="mt-6 text-sm font-medium">{example.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                 {example.description}
                              </p>
                           </button>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </div>
      );
   }

   /* --------------------------- Conversation --------------------------- */
   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="shrink-0 border-b bg-container px-4 py-2">
            <AiNotice />
         </div>
         <div
            ref={scrollRef}
            onScroll={(event) => {
               const el = event.currentTarget;
               stickToBottom.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
            }}
            className="flex-1 min-h-0 overflow-y-auto"
         >
            <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
               {activeChat.messages.length === 0 && activeChat.loadState === 'loading' && (
                  <LoadingArea rows={3} label="Carregando conversa…" />
               )}
               {activeChat.messages.length === 0 && activeChat.loadState === 'error' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                     <span>Não foi possível carregar a conversa.</span>
                     <Button variant="outline" size="sm" onClick={() => loadChat(activeChat.id)}>
                        Tentar de novo
                     </Button>
                  </div>
               )}
               {activeChat.messages.map((message, index) => (
                  <ChatMessage
                     key={message.id}
                     message={message}
                     onRetry={
                        // Só o erro mais recente: um antigo reenviaria uma pergunta já respondida.
                        message.error && index === activeChat.messages.length - 1
                           ? () => {
                                const lastUser = [...activeChat.messages.slice(0, index)]
                                   .reverse()
                                   .find((m) => m.role === 'user');
                                if (lastUser) void handleSend(lastUser.content);
                             }
                           : undefined
                     }
                  />
               ))}
            </div>
         </div>
         <div className="shrink-0 border-t bg-container">
            <div className="max-w-2xl mx-auto px-6 py-4">
               {/* `key`: força remontar ao trocar de chat — senão o texto ainda não
                   enviado do chat anterior sobrevivia à troca e ia pro chat errado. */}
               <ChatComposer key={activeChat.id} onSend={handleSend} disabled={isStreaming} />
            </div>
         </div>
      </div>
   );
}
