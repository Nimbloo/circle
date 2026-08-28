'use client';

import { InlineText } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { api } from '@/lib/client';
import { useWorkspaceStore } from '@/store/workspace-store';
import { useAgentChatStore } from '@/store/agent-chat-store';
import { ArrowUp, Bot, CalendarClock, ListTodo, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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

/** Streams the canned reply into the assistant message, word by word. */
function useStreamReply() {
   const { appendToMessage, finishMessage } = useAgentChatStore();
   const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

   useEffect(() => {
      return () => {
         if (intervalRef.current) clearInterval(intervalRef.current);
      };
   }, []);

   return (chatId: string, messageId: string, reply: string) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const words = reply.split(/(\s+)/);
      let index = 0;
      intervalRef.current = setInterval(() => {
         if (index >= words.length) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            finishMessage(chatId, messageId);
            return;
         }
         appendToMessage(chatId, messageId, words[index]);
         index += 1;
      }, 14);
   };
}

/** Aviso honesto: respostas são geradas por IA sobre dados reais e podem conter erros. */
function DemoBadge() {
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

function AgentMessageBody({ content, streaming }: { content: string; streaming?: boolean }) {
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
}

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
 * (Bedrock/Claude via `api.agent.chat`) sobre os dados vivos do workspace. A resposta
 * é transmitida palavra a palavra na bolha. As conversas vivem num store client e
 * podem ser revisitadas pelo dropdown do header.
 */
export default function AgentChat() {
   const { chats, activeChatId, sendMessage, failMessage, hydrate, loadChat, rekeyChat } =
      useAgentChatStore();
   const me = useWorkspaceStore((s) => s.me);
   const stream = useStreamReply();
   const [bannerDismissed, setBannerDismissed] = useState(false);
   const [examplesDismissed, setExamplesDismissed] = useState(false);
   const scrollRef = useRef<HTMLDivElement>(null);

   const activeChat = chats.find((chat) => chat.id === activeChatId);
   const isStreaming = activeChat?.messages.some((message) => message.streaming) ?? false;

   useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
   }, [activeChat?.messages]);

   // Carrega a lista de chats persistidos ao montar.
   useEffect(() => {
      void hydrate();
   }, [hydrate]);

   // Ao abrir um chat ainda sem mensagens carregadas, busca do servidor.
   useEffect(() => {
      if (activeChat && activeChat.messages.length === 0) void loadChat(activeChat.id);
   }, [activeChat, loadChat]);

   const handleSend = async (input: string) => {
      if (isStreaming) return;
      const wasNew = activeChatId === null;
      const { chatId, assistantMessageId } = sendMessage(input);
      try {
         // Persiste no servidor (cria o chat se for novo) e devolve a resposta.
         const res = await api.agent.send(wasNew ? null : chatId, input);
         if (wasNew) rekeyChat(chatId, res.chatId, res.title);
         stream(res.chatId, assistantMessageId, res.reply);
      } catch {
         failMessage(
            chatId,
            assistantMessageId,
            'Não consegui responder agora. Verifique a conexão e tente de novo.'
         );
      }
   };

   /* ------------------------------- Hero ------------------------------- */
   if (!activeChat) {
      return (
         <div className="w-full h-full flex flex-col items-center overflow-y-auto">
            <div className="w-full flex justify-center border-b bg-container px-4 py-2">
               <DemoBadge />
            </div>
            {!bannerDismissed && (
               <div className="mt-4 flex items-center gap-3 rounded-full border bg-container shadow-xs px-4 py-1.5 text-sm">
                  <span>Agent is now your default view</span>
                  <button
                     onClick={() => setBannerDismissed(true)}
                     className="font-medium rounded-full border px-2.5 py-0.5 hover:bg-accent transition-colors"
                  >
                     Keep
                  </button>
               </div>
            )}

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
            <DemoBadge />
         </div>
         <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
               {activeChat.messages.map((message) =>
                  message.role === 'user' ? (
                     <div key={message.id} className="flex justify-end">
                        <div className="flex items-start gap-2.5 max-w-[85%]">
                           <div className="rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm">
                              {message.content}
                           </div>
                           <Avatar className="size-6 mt-1 shrink-0">
                              <AvatarImage
                                 src={me?.avatarUrl ?? undefined}
                                 alt={me?.name ?? 'You'}
                              />
                              <AvatarFallback>{(me?.name ?? 'You')[0]}</AvatarFallback>
                           </Avatar>
                        </div>
                     </div>
                  ) : (
                     <div key={message.id} className="flex items-start gap-2.5">
                        <span className="mt-1 inline-flex size-6 items-center justify-center rounded-full border bg-container shrink-0">
                           <Bot className="size-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                           <AgentMessageBody
                              content={message.content}
                              streaming={message.streaming}
                           />
                        </div>
                     </div>
                  )
               )}
            </div>
         </div>
         <div className="shrink-0 border-t bg-container">
            <div className="max-w-2xl mx-auto px-6 py-4">
               <ChatComposer onSend={handleSend} disabled={isStreaming} />
            </div>
         </div>
      </div>
   );
}
