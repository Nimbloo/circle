/**
 * Documento OpenAPI 3.1 da API pública (#101).
 *
 * Objeto ESTÁTICO tipado — sem lib de geração. O documento é pequeno e fechado (5
 * recursos), então uma dependência a mais custaria mais do que resolve; a tipagem
 * mínima abaixo já pega erro de forma em `pnpm typecheck`.
 */

interface OpenApiSchema {
   type?: string;
   format?: string;
   nullable?: boolean;
   items?: OpenApiSchema;
   properties?: Record<string, OpenApiSchema>;
   required?: string[];
   enum?: string[];
   $ref?: string;
   description?: string;
}

interface OpenApiParameter {
   name: string;
   in: 'query' | 'path' | 'header';
   required?: boolean;
   description?: string;
   schema: OpenApiSchema;
}

interface OpenApiResponse {
   description: string;
   content?: Record<string, { schema: OpenApiSchema }>;
}

interface OpenApiOperation {
   summary: string;
   operationId: string;
   tags: string[];
   security: { bearerAuth: string[] }[];
   parameters?: OpenApiParameter[];
   requestBody?: { required: boolean; content: Record<string, { schema: OpenApiSchema }> };
   responses: Record<string, OpenApiResponse>;
}

interface OpenApiDocument {
   openapi: '3.1.0';
   info: { title: string; version: string; description: string };
   servers: { url: string; description?: string }[];
   tags: { name: string; description: string }[];
   paths: Record<string, Partial<Record<'get' | 'post' | 'patch', OpenApiOperation>>>;
   components: {
      securitySchemes: Record<string, { type: string; scheme: string; description: string }>;
      schemas: Record<string, OpenApiSchema>;
   };
}

const ref = (name: string): OpenApiSchema => ({ $ref: `#/components/schemas/${name}` });
const envelope = (name: string): OpenApiSchema => ({
   type: 'object',
   properties: { data: ref(name) },
});
const listEnvelope = (name: string): OpenApiSchema => ({
   type: 'object',
   properties: { data: { type: 'array', items: ref(name) } },
});

const PROBLEM: OpenApiSchema = {
   type: 'object',
   description: 'Erro RFC 7807 (application/problem+json)',
   properties: {
      type: { type: 'string' },
      title: { type: 'string' },
      status: { type: 'integer' },
      detail: { type: 'string' },
   },
};

/** Respostas de erro compartilhadas por toda operação. */
const ERRORS: Record<string, OpenApiResponse> = {
   '401': {
      description: 'Token ausente, inválido ou revogado',
      content: { 'application/problem+json': { schema: PROBLEM } },
   },
   '403': {
      description: 'Token sem o escopo necessário, ou recurso fora do escopo do usuário',
      content: { 'application/problem+json': { schema: PROBLEM } },
   },
   '404': {
      description: 'Recurso não encontrado',
      content: { 'application/problem+json': { schema: PROBLEM } },
   },
};

const READ = [{ bearerAuth: ['read'] }];
const WRITE = [{ bearerAuth: ['write'] }];

const ISSUE_FILTERS: OpenApiParameter[] = [
   { name: 'team', in: 'query', schema: { type: 'string' }, description: 'Chave do time (CORE)' },
   { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Ids de status (CSV)' },
   { name: 'priority', in: 'query', schema: { type: 'string' }, description: 'Ids de prioridade' },
   { name: 'project', in: 'query', schema: { type: 'string' }, description: 'Ids de projeto' },
   { name: 'labels', in: 'query', schema: { type: 'string' }, description: 'Ids de label' },
   { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Busca no título' },
   { name: 'limit', in: 'query', schema: { type: 'integer' }, description: '1..200 (default 50)' },
   { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Rank do último item' },
];

const ID_PARAM: OpenApiParameter = {
   name: 'id',
   in: 'path',
   required: true,
   schema: { type: 'string' },
   description: 'Id interno ou identifier (CORE-12)',
};

export const OPENAPI_DOCUMENT: OpenApiDocument = {
   openapi: '3.1.0',
   info: {
      title: 'Circle Public API',
      version: '1.0.0',
      description:
         'API pública do Circle. Autenticação por token (`Authorization: Bearer circle_…`) ' +
         'criado em Settings → API tokens, com escopos `read` e `write`. Erros seguem RFC 7807. ' +
         'Sucesso vem no envelope `{ data }`.',
   },
   servers: [{ url: '/api/public/v1', description: 'Base da API pública' }],
   tags: [
      { name: 'Issues', description: 'Listar, criar e atualizar issues' },
      { name: 'Projects', description: 'Listar, criar e atualizar projetos' },
      { name: 'Catalogs', description: 'Times, status e labels (somente leitura)' },
   ],
   paths: {
      '/issues': {
         get: {
            summary: 'Lista issues',
            operationId: 'listIssues',
            tags: ['Issues'],
            security: READ,
            parameters: ISSUE_FILTERS,
            responses: {
               '200': {
                  description: 'Lista de issues',
                  content: { 'application/json': { schema: listEnvelope('Issue') } },
               },
               ...ERRORS,
            },
         },
         post: {
            summary: 'Cria uma issue',
            operationId: 'createIssue',
            tags: ['Issues'],
            security: WRITE,
            requestBody: {
               required: true,
               content: { 'application/json': { schema: ref('IssueCreate') } },
            },
            responses: {
               '200': {
                  description: 'Issue criada',
                  content: { 'application/json': { schema: envelope('Issue') } },
               },
               ...ERRORS,
            },
         },
      },
      '/issues/{id}': {
         get: {
            summary: 'Detalhe da issue',
            operationId: 'getIssue',
            tags: ['Issues'],
            security: READ,
            parameters: [ID_PARAM],
            responses: {
               '200': {
                  description: 'Issue',
                  content: { 'application/json': { schema: envelope('Issue') } },
               },
               ...ERRORS,
            },
         },
         patch: {
            summary: 'Atualiza parcialmente a issue',
            operationId: 'updateIssue',
            tags: ['Issues'],
            security: WRITE,
            parameters: [ID_PARAM],
            requestBody: {
               required: true,
               content: { 'application/json': { schema: ref('IssuePatch') } },
            },
            responses: {
               '200': {
                  description: 'Issue atualizada',
                  content: { 'application/json': { schema: envelope('Issue') } },
               },
               ...ERRORS,
            },
         },
      },
      '/projects': {
         get: {
            summary: 'Lista projetos',
            operationId: 'listProjects',
            tags: ['Projects'],
            security: READ,
            parameters: [
               { name: 'team', in: 'query', schema: { type: 'string' } },
               { name: 'initiative', in: 'query', schema: { type: 'string' } },
            ],
            responses: {
               '200': {
                  description: 'Lista de projetos',
                  content: { 'application/json': { schema: listEnvelope('Project') } },
               },
               ...ERRORS,
            },
         },
         post: {
            summary: 'Cria um projeto',
            operationId: 'createProject',
            tags: ['Projects'],
            security: WRITE,
            requestBody: {
               required: true,
               content: { 'application/json': { schema: ref('ProjectCreate') } },
            },
            responses: {
               '200': {
                  description: 'Projeto criado',
                  content: { 'application/json': { schema: envelope('Project') } },
               },
               ...ERRORS,
            },
         },
      },
      '/projects/{id}': {
         get: {
            summary: 'Detalhe do projeto',
            operationId: 'getProject',
            tags: ['Projects'],
            security: READ,
            parameters: [{ ...ID_PARAM, description: 'Id do projeto' }],
            responses: {
               '200': {
                  description: 'Projeto',
                  content: { 'application/json': { schema: envelope('Project') } },
               },
               ...ERRORS,
            },
         },
         patch: {
            summary: 'Atualiza parcialmente o projeto',
            operationId: 'updateProject',
            tags: ['Projects'],
            security: WRITE,
            parameters: [{ ...ID_PARAM, description: 'Id do projeto' }],
            requestBody: {
               required: true,
               content: { 'application/json': { schema: ref('ProjectPatch') } },
            },
            responses: {
               '200': {
                  description: 'Projeto atualizado',
                  content: { 'application/json': { schema: envelope('Project') } },
               },
               ...ERRORS,
            },
         },
      },
      '/teams': {
         get: {
            summary: 'Lista times',
            operationId: 'listTeams',
            tags: ['Catalogs'],
            security: READ,
            responses: {
               '200': {
                  description: 'Lista de times',
                  content: { 'application/json': { schema: listEnvelope('Team') } },
               },
               ...ERRORS,
            },
         },
      },
      '/statuses': {
         get: {
            summary: 'Catálogo de status',
            operationId: 'listStatuses',
            tags: ['Catalogs'],
            security: READ,
            responses: {
               '200': {
                  description: 'Lista de status',
                  content: { 'application/json': { schema: listEnvelope('Status') } },
               },
               ...ERRORS,
            },
         },
      },
      '/labels': {
         get: {
            summary: 'Catálogo de labels',
            operationId: 'listLabels',
            tags: ['Catalogs'],
            security: READ,
            responses: {
               '200': {
                  description: 'Lista de labels',
                  content: { 'application/json': { schema: listEnvelope('Label') } },
               },
               ...ERRORS,
            },
         },
      },
   },
   components: {
      securitySchemes: {
         bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Token `circle_…` criado em Settings → API tokens.',
         },
      },
      schemas: {
         Problem: PROBLEM,
         User: {
            type: 'object',
            properties: {
               id: { type: 'string' },
               slug: { type: 'string' },
               name: { type: 'string' },
               email: { type: 'string' },
               avatarUrl: { type: 'string', nullable: true },
            },
         },
         Status: {
            type: 'object',
            properties: {
               id: { type: 'string' },
               name: { type: 'string' },
               color: { type: 'string' },
               category: {
                  type: 'string',
                  enum: ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'],
               },
               position: { type: 'integer' },
            },
         },
         Label: {
            type: 'object',
            properties: {
               id: { type: 'string' },
               name: { type: 'string' },
               color: { type: 'string' },
            },
         },
         Team: {
            type: 'object',
            properties: {
               id: { type: 'string', description: 'Chave curta do time (CORE)' },
               name: { type: 'string' },
               parentId: { type: 'string', nullable: true },
            },
         },
         Issue: {
            type: 'object',
            properties: {
               id: { type: 'string' },
               identifier: { type: 'string' },
               teamId: { type: 'string' },
               title: { type: 'string' },
               status: ref('Status'),
               priority: {
                  type: 'object',
                  properties: { id: { type: 'string' }, name: { type: 'string' } },
               },
               assignee: { ...ref('User'), nullable: true },
               assignees: { type: 'array', items: ref('User') },
               labels: { type: 'array', items: ref('Label') },
               dueDate: { type: 'string', format: 'date', nullable: true },
               estimate: { type: 'integer', nullable: true },
               parentId: { type: 'string', nullable: true },
               createdAt: { type: 'string', format: 'date-time' },
               updatedAt: { type: 'string', format: 'date-time' },
            },
         },
         IssueCreate: {
            type: 'object',
            required: ['teamId', 'title'],
            properties: {
               teamId: { type: 'string' },
               title: { type: 'string' },
               statusId: { type: 'string' },
               priorityId: { type: 'string' },
               assigneeId: { type: 'string', nullable: true },
               projectId: { type: 'string', nullable: true },
               labelIds: { type: 'array', items: { type: 'string' } },
               dueDate: { type: 'string', format: 'date', nullable: true },
               estimate: { type: 'integer', nullable: true },
               description: { type: 'string', nullable: true },
               parentId: { type: 'string', nullable: true },
            },
         },
         IssuePatch: {
            type: 'object',
            properties: {
               title: { type: 'string' },
               statusId: { type: 'string' },
               priorityId: { type: 'string' },
               assigneeId: { type: 'string', nullable: true },
               projectId: { type: 'string', nullable: true },
               dueDate: { type: 'string', format: 'date', nullable: true },
               estimate: { type: 'integer', nullable: true },
               parentId: { type: 'string', nullable: true },
            },
         },
         Project: {
            type: 'object',
            properties: {
               id: { type: 'string' },
               name: { type: 'string' },
               teamId: { type: 'string' },
               status: { type: 'object', properties: { id: { type: 'string' } } },
               startDate: { type: 'string', format: 'date', nullable: true },
               targetDate: { type: 'string', format: 'date', nullable: true },
               percentComplete: { type: 'integer' },
            },
         },
         ProjectCreate: {
            type: 'object',
            required: ['name', 'teamId', 'statusId', 'priorityId', 'healthId'],
            properties: {
               name: { type: 'string' },
               teamId: { type: 'string' },
               statusId: { type: 'string' },
               priorityId: { type: 'string' },
               healthId: { type: 'string' },
               leadId: { type: 'string', nullable: true },
               startDate: { type: 'string', format: 'date', nullable: true },
               targetDate: { type: 'string', format: 'date', nullable: true },
               initiativeId: { type: 'string', nullable: true },
            },
         },
         ProjectPatch: {
            type: 'object',
            properties: {
               name: { type: 'string' },
               statusId: { type: 'string' },
               priorityId: { type: 'string' },
               healthId: { type: 'string' },
               leadId: { type: 'string', nullable: true },
               startDate: { type: 'string', format: 'date', nullable: true },
               targetDate: { type: 'string', format: 'date', nullable: true },
               initiativeId: { type: 'string', nullable: true },
            },
         },
      },
   },
};
