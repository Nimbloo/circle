import { create } from 'zustand';

export interface AgentMessage {
   id: string;
   role: 'user' | 'assistant';
   content: string;
   /** True while the assistant reply is still being streamed into the UI. */
   streaming?: boolean;
   /** True if the reply failed (renders as an error, not content). */
   error?: boolean;
}

export interface AgentChat {
   id: string;
   title: string;
   messages: AgentMessage[];
}

/** Diálogo enviado ao backend: só role+content, sem a bolha de assistant ainda vazia. */
export interface AgentTurn {
   role: 'user' | 'assistant';
   content: string;
}

interface AgentChatState {
   chats: AgentChat[];
   activeChatId: string | null;
   setActiveChat: (chatId: string | null) => void;
   startNewChat: () => void;
   /**
    * Anexa a mensagem do usuário + uma bolha de assistant vazia (streaming) e
    * retorna os ids + o histórico (para o componente chamar o backend de IA real).
    */
   sendMessage: (input: string) => {
      chatId: string;
      assistantMessageId: string;
      history: AgentTurn[];
   };
   appendToMessage: (chatId: string, messageId: string, chunk: string) => void;
   finishMessage: (chatId: string, messageId: string) => void;
   failMessage: (chatId: string, messageId: string, text: string) => void;
}

let nextId = 1;
const uid = (prefix: string) => `${prefix}-${nextId++}`;

/** Título curto a partir da 1ª mensagem (primeiras palavras, sem depender de mock). */
function chatTitleFrom(input: string): string {
   const clean = input.trim().replace(/\s+/g, ' ');
   return clean.length <= 48 ? clean : `${clean.slice(0, 47)}…`;
}

/** Converte as bolhas visíveis em turnos para o backend (ignora a assistant vazia). */
function toHistory(messages: AgentMessage[]): AgentTurn[] {
   return messages
      .filter((m) => !(m.role === 'assistant' && m.content.trim() === ''))
      .map((m) => ({ role: m.role, content: m.content }));
}

/**
 * Estado do chat do Agent. As conversas vivem em memória; as respostas vêm do
 * backend de IA real (`/api/v1/agent/chat` → Bedrock/Claude com contexto do
 * workspace) e são transmitidas para a bolha pelo componente da página.
 */
export const useAgentChatStore = create<AgentChatState>((set, get) => ({
   chats: [],
   activeChatId: null,

   setActiveChat: (chatId) => set({ activeChatId: chatId }),

   startNewChat: () => set({ activeChatId: null }),

   sendMessage: (input) => {
      const state = get();
      const assistantMessageId = uid('msg');
      const userMessage: AgentMessage = { id: uid('msg'), role: 'user', content: input };
      const assistantMessage: AgentMessage = {
         id: assistantMessageId,
         role: 'assistant',
         content: '',
         streaming: true,
      };

      const active = state.chats.find((chat) => chat.id === state.activeChatId);
      if (active) {
         const history = toHistory([...active.messages, userMessage]);
         set({
            chats: state.chats.map((chat) =>
               chat.id === active.id
                  ? { ...chat, messages: [...chat.messages, userMessage, assistantMessage] }
                  : chat
            ),
         });
         return { chatId: active.id, assistantMessageId, history };
      }

      const chat: AgentChat = {
         id: uid('chat'),
         title: chatTitleFrom(input),
         messages: [userMessage, assistantMessage],
      };
      set({ chats: [chat, ...state.chats], activeChatId: chat.id });
      return { chatId: chat.id, assistantMessageId, history: toHistory([userMessage]) };
   },

   appendToMessage: (chatId, messageId, chunk) =>
      set((state) => ({
         chats: state.chats.map((chat) =>
            chat.id === chatId
               ? {
                    ...chat,
                    messages: chat.messages.map((message) =>
                       message.id === messageId
                          ? { ...message, content: message.content + chunk }
                          : message
                    ),
                 }
               : chat
         ),
      })),

   finishMessage: (chatId, messageId) =>
      set((state) => ({
         chats: state.chats.map((chat) =>
            chat.id === chatId
               ? {
                    ...chat,
                    messages: chat.messages.map((message) =>
                       message.id === messageId ? { ...message, streaming: false } : message
                    ),
                 }
               : chat
         ),
      })),

   failMessage: (chatId, messageId, text) =>
      set((state) => ({
         chats: state.chats.map((chat) =>
            chat.id === chatId
               ? {
                    ...chat,
                    messages: chat.messages.map((message) =>
                       message.id === messageId
                          ? { ...message, streaming: false, error: true, content: text }
                          : message
                    ),
                 }
               : chat
         ),
      })),
}));
