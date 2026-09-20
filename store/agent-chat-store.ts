import { create } from 'zustand';
import { api } from '@/lib/client';

export interface AgentMessage {
   id: string;
   role: 'user' | 'assistant';
   content: string;
   /** True enquanto a resposta do assistente ainda não chegou (bolha "pensando"). */
   streaming?: boolean;
   /** True if the reply failed (renders as an error, not content). */
   error?: boolean;
}

export interface AgentChat {
   id: string;
   title: string;
   messages: AgentMessage[];
   /**
    * Existe no servidor. Um chat novo nasce local (id provisório) e só vira persistido
    * quando a 1ª resposta chega — se ela falhar, o próximo envio ainda cria o chat.
    */
   persisted?: boolean;
   /** Carga das mensagens de um chat persistido (sob demanda, ao abrir). */
   loadState?: 'loading' | 'ready' | 'error';
}

interface AgentChatState {
   chats: AgentChat[];
   activeChatId: string | null;
   /**
    * Carrega a lista de chats persistidos, mesclando com o estado local: não descarta
    * chat em voo nem mensagens já carregadas (#50).
    */
   hydrate: () => Promise<void>;
   /** Carrega as mensagens de um chat do servidor. */
   loadChat: (chatId: string) => Promise<void>;
   /** Troca o id local pelo id do servidor após criar o chat na 1ª mensagem. */
   rekeyChat: (oldId: string, newId: string, title: string) => void;
   setActiveChat: (chatId: string | null) => void;
   startNewChat: () => void;
   /** Anexa a mensagem do usuário + uma bolha de assistant pendente e retorna os ids. */
   sendMessage: (input: string) => { chatId: string; assistantMessageId: string };
   /** Mostra a resposta inteira de uma vez (sem digitação simulada — Co#11). */
   resolveMessage: (chatId: string, messageId: string, content: string) => void;
   failMessage: (chatId: string, messageId: string, text: string) => void;
}

let nextId = 1;
const uid = (prefix: string) => `${prefix}-${nextId++}`;

/** Título curto a partir da 1ª mensagem (primeiras palavras, sem depender de mock). */
function chatTitleFrom(input: string): string {
   const clean = input.trim().replace(/\s+/g, ' ');
   return clean.length <= 48 ? clean : `${clean.slice(0, 47)}…`;
}

function patchMessage(
   chats: AgentChat[],
   chatId: string,
   messageId: string,
   patch: Partial<AgentMessage>
): AgentChat[] {
   return chats.map((chat) =>
      chat.id === chatId
         ? {
              ...chat,
              messages: chat.messages.map((message) =>
                 message.id === messageId ? { ...message, ...patch } : message
              ),
           }
         : chat
   );
}

/**
 * Estado do chat do Agent. As respostas vêm do backend de IA real
 * (`/api/v1/agent/chats` → Bedrock/Claude com contexto do workspace).
 */
export const useAgentChatStore = create<AgentChatState>((set) => ({
   chats: [],
   activeChatId: null,

   hydrate: async () => {
      try {
         const list = await api.agent.chats();
         set((state) => {
            const local = new Map(state.chats.map((c) => [c.id, c]));
            const serverIds = new Set(list.map((c) => c.id));
            // Chats locais ainda não persistidos (em voo ou com falha) ficam no topo.
            const unsaved = state.chats.filter((c) => !c.persisted && !serverIds.has(c.id));
            const fromServer = list.map((c): AgentChat => {
               const prev = local.get(c.id);
               return prev
                  ? { ...prev, title: c.title, persisted: true }
                  : { id: c.id, title: c.title, messages: [], persisted: true };
            });
            return { chats: [...unsaved, ...fromServer] };
         });
      } catch {
         // degrada gracioso — mantém o estado atual
      }
   },

   loadChat: async (chatId) => {
      set((state) => ({
         chats: state.chats.map((c) => (c.id === chatId ? { ...c, loadState: 'loading' } : c)),
      }));
      try {
         const chat = await api.agent.getChat(chatId);
         set((state) => ({
            chats: state.chats.map((c) => {
               if (c.id !== chatId) return c;
               // Um envio começou enquanto carregava: não apaga a conversa em voo.
               if (c.messages.length > 0) return { ...c, loadState: 'ready' };
               return {
                  ...c,
                  title: chat.title,
                  loadState: 'ready',
                  messages: chat.messages.map((m, i) => ({
                     id: `${chatId}-${i}`,
                     role: m.role,
                     content: m.content,
                  })),
               };
            }),
         }));
      } catch {
         set((state) => ({
            chats: state.chats.map((c) => (c.id === chatId ? { ...c, loadState: 'error' } : c)),
         }));
      }
   },

   rekeyChat: (oldId, newId, title) =>
      set((state) => ({
         chats: state.chats.map((c) =>
            c.id === oldId ? { ...c, id: newId, title, persisted: true, loadState: 'ready' } : c
         ),
         activeChatId: state.activeChatId === oldId ? newId : state.activeChatId,
      })),

   setActiveChat: (chatId) => set({ activeChatId: chatId }),

   startNewChat: () => set({ activeChatId: null }),

   sendMessage: (input) => {
      const assistantMessageId = uid('msg');
      const userMessage: AgentMessage = { id: uid('msg'), role: 'user', content: input };
      const assistantMessage: AgentMessage = {
         id: assistantMessageId,
         role: 'assistant',
         content: '',
         streaming: true,
      };
      let chatId = '';
      set((state) => {
         const active = state.chats.find((chat) => chat.id === state.activeChatId);
         if (active) {
            chatId = active.id;
            return {
               chats: state.chats.map((chat) =>
                  chat.id === active.id
                     ? { ...chat, messages: [...chat.messages, userMessage, assistantMessage] }
                     : chat
               ),
            };
         }
         const chat: AgentChat = {
            id: uid('chat'),
            title: chatTitleFrom(input),
            messages: [userMessage, assistantMessage],
            persisted: false,
         };
         chatId = chat.id;
         return { chats: [chat, ...state.chats], activeChatId: chat.id };
      });
      return { chatId, assistantMessageId };
   },

   resolveMessage: (chatId, messageId, content) =>
      set((state) => ({
         chats: patchMessage(state.chats, chatId, messageId, { content, streaming: false }),
      })),

   failMessage: (chatId, messageId, text) =>
      set((state) => ({
         chats: patchMessage(state.chats, chatId, messageId, {
            streaming: false,
            error: true,
            content: text,
         }),
      })),
}));
