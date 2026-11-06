# MG Motor Brasil | Gestão de Leads & Performance — Segurança e Acesso

> **Escopo:** comportamento efetivamente implementado no código desta cópia na raiz do repositório. Os nomes internos `v2*` permanecem nos caminhos e contratos técnicos por compatibilidade; **não** são o título público do produto.
>
> **Fontes principais:** [`server/v2Auth.ts`](../server/v2Auth.ts), [`server/v2Accounts.ts`](../server/v2Accounts.ts), [`server/v2Permissions.ts`](../server/v2Permissions.ts), [`server/routers.ts`](../server/routers.ts), [`server/_core/cookies.ts`](../server/_core/cookies.ts), [`server/_core/context.ts`](../server/_core/context.ts), [`server/_core/publicConfig.ts`](../server/_core/publicConfig.ts) e [`shared/accountRoles.ts`](../shared/accountRoles.ts).

## 1. Limites de confiança e identidade

A autenticação usada pelas rotas do produto é a sessão própria do dashboard. O `createContext` do tRPC mantém `ctx.user` nulo; a camada de procedimentos v2 lê exclusivamente o cookie `mg_v2_session` e não aceita uma identidade Manus/OAuth/Bearer como atalho para acessar essas rotas. Essa separação está explícita em [`server/_core/context.ts`](../server/_core/context.ts) e no middleware `v2Procedure` de [`server/routers.ts`](../server/routers.ts).

A API tRPC é publicada sob `/api/trpc`. A rota `auth.me` é somente uma leitura da sessão atual; `auth.login` e `auth.logout` são públicas no sentido de não exigirem uma sessão prévia, mas não concedem acesso a dados por si mesmas. Todas as demais rotas v2 passam por `v2Procedure` ou por um procedimento mais restritivo.

O banco customizado é acessado por [`server/v2Db.ts`](../server/v2Db.ts) usando `DATABASE_URL`. A tabela starter `users`, definida em [`drizzle/schema.ts`](../drizzle/schema.ts), pertence ao fluxo Drizzle/Manus legado e não substitui `v2_accounts` no login deste produto.

## 2. Sessão e token

### 2.1 Cookie

| Propriedade | Implementação atual |
|---|---|
| Nome | `mg_v2_session` |
| Escopo | `/` |
| `HttpOnly` | `true` |
| `Secure` | `true` |
| `SameSite` | `none` |
| Duração | 8 horas (`maxAge` de `28.800.000` ms no login) |
| Limpeza | `logout` usa as mesmas opções e limpa o cookie |

As opções são fixas em [`server/_core/cookies.ts`](../server/_core/cookies.ts); o request não altera `Secure` nem `SameSite`. Portanto, o navegador precisa estar em HTTPS para persistir a sessão. Em desenvolvimento local por HTTP, o cookie seguro pode não ser armazenado. Como `SameSite=None` permite envio em contexto cross-site, o ingresso de tráfego deve ser protegido por HTTPS, política de origem/CSRF na borda e controles de domínio adequados; não foi identificado um token CSRF explícito no código atual.

### 2.2 JWT

O token é assinado com HS256 em [`server/v2Auth.ts`](../server/v2Auth.ts) e contém somente os dados de sessão necessários:

| Claim | Uso |
|---|---|
| `sub` | ID numérico da conta em `v2_accounts` |
| `scope` | Deve ser exatamente `mg-dashboard-v2` |
| `appId` | Deve coincidir com `MANUS_PROJECT_ID` |
| `username` | Identificador da conta usado na leitura da sessão |
| `v` | `sessionVersion` da conta; ausente é tratado como versão `0` |
| `iat`/`exp` | Emissão e expiração; o prazo é de 8 horas |

A verificação rejeita assinatura, algoritmo, escopo, projeto, subject ou tipos inválidos. Depois da validação criptográfica, [`readV2Session`](../server/v2Auth.ts) consulta a conta pelo username normalizado, confere ID, `isActive` e `sessionVersion`, e lê o papel atual do banco. Papel ausente ou desconhecido falha fechado para `client` na representação pública.

`MANUS_JWT_SECRET` e `MANUS_PROJECT_ID` são obrigatórios para assinar/verificar tokens. Eles não devem ser registrados, copiados para a documentação, colocados no bundle ou enviados pela rota de configuração pública.

### 2.3 Senhas e tentativas

- A senha é armazenada como `scrypt$<salt>$<hash>`, com salt aleatório de 16 bytes, hash de 64 bytes e comparação em tempo constante.
- A API aceita de 8 a 200 caracteres; o username é normalizado para minúsculas e deve casar com `[a-z0-9._-]{3,64}`.
- Listagens de contas retornam apenas `id`, `username`, `role`, `isActive` e `createdAt`. Não retornam `passwordHash`.
- Auditorias de conta gravam conta, ator e ação (`create`, `update`, `reset_password` ou `assign_bbro`), sem senha, hash, token ou payload de requisição.
- O login mantém um contador **em memória do processo**, indexado por `req.socket.remoteAddress`: no máximo 10 tentativas dentro de uma janela de 15 minutos. A décima tentativa ainda é processada; a próxima é bloqueada com `TOO_MANY_REQUESTS`. Um login válido remove o contador daquele endereço.
- Esse limite não é persistente nem compartilhado entre réplicas e é perdido no reinício do processo. Não deve ser tratado como substituto de rate limiting no proxy/WAF.

## 3. Revogação de sessão e administração de contas

Alterar papel, desativar/ativar uma conta, redefinir a senha ou atribuir o papel BBRO incrementa `sessionVersion`. A sessão antiga passa a ser rejeitada mesmo antes do vencimento do JWT. A transação de alteração bloqueia os administradores ativos e impede remover o último administrador ativo.

O gerenciamento de contas é administrativo. A criação inicia a conta como ativa e usa hash scrypt; username duplicado resulta em conflito. O código não retorna credenciais em nenhuma dessas operações.

Não existe seed geral no caminho de inicialização do servidor. O runner explícito [`server/migrateV2Accounts.ts`](../server/migrateV2Accounts.ts) **não cria conta nem senha**: ele pode promover uma conta existente de username `rodrigo` e, em uma etapa separada, atribuir BBRO à conta já existente cujo username seja `bbro`, sempre com marcadores de migração. A primeira conta precisa ser provisionada por um procedimento operacional controlado; não se deve presumir que iniciar o container cria um administrador.

## 4. Perfis e matriz de permissões

Os papéis válidos são `admin`, `client` e `bbro`, definidos em [`shared/accountRoles.ts`](../shared/accountRoles.ts). A matriz abaixo descreve as rotas e as projeções públicas reais. “Leitura sanitizada” significa que o backend remove avisos/notas técnicas e, quando aplicável, aplica os rótulos de apresentação definidos em [`server/v2Permissions.ts`](../server/v2Permissions.ts); não significa que os dados sejam anônimos.

| Recurso/rota tRPC | ADMIN | BBRO | CLIENT |
|---|---|---|---|
| `auth.me`, `auth.login`, `auth.logout` | Sessão própria | Sessão própria | Sessão própria |
| `accounts.list/create/update/resetPassword` | **CRUD administrativo** | Sem acesso | Sem acesso |
| `leads.dashboard` | Leitura completa, incluindo notas e avisos técnicos | Leitura sanitizada | Leitura sanitizada |
| `leads.goal` / `leads.updateGoal` | Consultar e editar meta de Leads | Sem acesso | Sem acesso |
| `leads.salesGoal` / `leads.updateSalesGoal` | Somente se também for a conta proprietária `rodrigo` | Sem acesso | Sem acesso |
| `mediaPlan.plans` | Leitura | Leitura | Leitura |
| `mediaPlan.projections` / `updateProjections` | Somente a conta proprietária `rodrigo` | Sem acesso | Sem acesso |
| `dispatch.reports` | Lista completa | Lista de apresentação | Lista de apresentação |
| `dispatch.report` | Relatório completo | Sem acesso | Sem acesso |
| `dispatch.leadControl` | Leitura completa | Leitura sanitizada | Leitura sanitizada |
| `dispatch.setManual` / `history` / `prepareLeadControl` | Pode validar e preparar | Pode validar, consultar histórico e preparar; escopo CRM/D-1 | Sem acesso |
| `dispatch.prepareDay` / `importWorkbook` | Pode preparar e importar | Sem acesso | Sem acesso |
| `commercial.status`, previews, commits e `remove` | Pode consultar e alterar snapshots comerciais | Sem acesso | Sem acesso |

### 4.1 Restrições de proprietário

Há duas áreas deliberadamente mais restritas que “ser administrador”:

1. **Meta total mensal de vendas:** somente a conta de username exatamente `rodrigo`, com papel `admin`, passa pelo `ownerProcedure` e por `assertV2SalesGoalOwner` em [`server/v2SalesGoal.ts`](../server/v2SalesGoal.ts). A ausência de override retorna `null`; o código não copia automaticamente o total importado para a tabela de override.
2. **Projeções de Leads do plano de mídia:** somente a conta `rodrigo` com papel `admin` pode consultar ou salvar projeções em [`server/v2MediaPlanProjections.ts`](../server/v2MediaPlanProjections.ts). O serviço revalida a identidade, valida mês/plano aprovado, usa `expectedVersion` para concorrência e audita o estado anterior e o novo.

O teste do proprietário na rota exige o username retornado exatamente como `rodrigo`. Contas históricas com capitalização diferente devem ser revisadas antes de serem consideradas proprietárias, mesmo que alguma consulta SQL use comparação case-insensitive.

### 4.2 Escopo BBRO no controle CRM

BBRO não é administrador. Ao alterar um check Manual ou consultar seu histórico, o serviço verifica novamente a unidade e a data: somente concessionárias do conjunto CRM e dias encerrados até D-1 são aceitos. O papel não pode importar planilhas, administrar contas, editar metas ou acessar o relatório administrativo completo.

## 5. Minimização e exposição pública

A rota `/api/platform/config.js` é gerada por [`server/_core/publicConfig.ts`](../server/_core/publicConfig.ts) a partir de uma whitelist. Podem chegar ao navegador `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL` e `MANUS_API_BROWSER_KEY`. O código não serializa `process.env` inteiro; `DATABASE_URL`, `MANUS_JWT_SECRET` e `MANUS_API_KEY` não fazem parte dessa resposta.

A conta pública nunca recebe hash de senha. As projeções retornam somente contexto numérico esparso, sem metadados do ator. Os overrides de projeção e metas são separados das fontes importadas, têm auditoria e não alteram orçamento, investimento ou fonte aprovada.

Em desenvolvimento, o plugin do Vite pode gravar logs de console, rede e replay em `.manus-logs`, com corte de 1 MiB por arquivo. Trate esses arquivos como potencialmente sensíveis, não os envie ao repositório e não habilite o coletor como se fosse observabilidade de produção; o plugin não é injetado quando `NODE_ENV=production`.

## 6. Controles obrigatórios para operação

1. Use `DATABASE_URL`, `MANUS_PROJECT_ID` e `MANUS_JWT_SECRET` de ambiente separado por instalação; nunca publique DSN, segredo, hash ou cookie.
2. Mantenha HTTPS no ingresso. O cookie é sempre `Secure` e `SameSite=None`.
3. Coloque rate limiting por origem no proxy/WAF; o contador local de login não é distribuído.
4. Restrinja a atribuição de `admin` e o provisionamento inicial. Não desative o último administrador ativo.
5. Faça backup antes de qualquer DDL ou migração customizada. Os arquivos de backup contêm hashes de credenciais e devem ter controle de acesso e criptografia.
6. Teste mudanças em banco isolado. Nunca aponte testes ou fixtures para o banco de produção.
7. Revise a origem dos uploads comerciais e de dispatch; eles são mutações administrativas e não são executados automaticamente pelo startup.

## 7. Limitações verificadas no código atual

- `GET /api/health` retorna `status: "ok"`, produto e `environment: "homologacao"`, mas não testa `DATABASE_URL`, tabelas, migrações ou dependências externas. É uma sonda de processo HTTP, não uma readiness check de banco. O [`Dockerfile`](../Dockerfile) também não declara `HEALTHCHECK` nativo.
- A proteção de login é por processo e endereço de socket; reinício, múltiplas réplicas ou proxies sem preservação de origem reduzem sua efetividade.
- O cookie cross-site seguro não vem acompanhado de mecanismo CSRF explícito no código lido; a proteção de origem deve ser definida na infraestrutura antes de uma exposição pública.
- A configuração ausente de banco ou assinatura pode ser percebida apenas quando uma rota tenta usá-la; o processo pode iniciar e somente depois falhar uma operação autenticada.
- O servidor V2 não executa seed de administrador, import, ETL ou runner de migração no bootstrap. Provisionamento e evolução do banco são responsabilidades operacionais explícitas.

## 8. Referências de implementação

- [Autenticação, JWT, hash e rate limit — `server/v2Auth.ts`](../server/v2Auth.ts)
- [Contas, auditoria e invalidação — `server/v2Accounts.ts`](../server/v2Accounts.ts)
- [Permissões e sanitização — `server/v2Permissions.ts`](../server/v2Permissions.ts)
- [Procedimentos e matriz de rotas — `server/routers.ts`](../server/routers.ts)
- [Cookie de sessão — `server/_core/cookies.ts`](../server/_core/cookies.ts)
- [Contexto tRPC — `server/_core/context.ts`](../server/_core/context.ts)
- [Whitelist pública — `server/_core/publicConfig.ts`](../server/_core/publicConfig.ts)
- [Papéis — `shared/accountRoles.ts`](../shared/accountRoles.ts)
- [Meta total de vendas — `server/v2SalesGoal.ts`](../server/v2SalesGoal.ts)
- [Projeções de mídia — `server/v2MediaPlanProjections.ts`](../server/v2MediaPlanProjections.ts)
- [Esquema starter de usuários — `drizzle/schema.ts`](../drizzle/schema.ts)
