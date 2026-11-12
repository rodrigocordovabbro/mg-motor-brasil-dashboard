# MG Motor Brasil | Segurança e acesso

> **Estado documental:** 09/11/2026
> **Escopo:** comportamento efetivamente implementado no código atual desta árvore de trabalho. Este documento não é uma certificação de segurança, não substitui revisão de infraestrutura e não descreve dados correntes do banco.

## 0. Estado da documentação, fontes e versões

### Fonte real desta revisão

A matriz e os controles abaixo foram conferidos diretamente nos arquivos de implementação atuais, principalmente [`shared/accountRoles.ts`](../shared/accountRoles.ts), [`server/routers.ts`](../server/routers.ts), [`server/v2Auth.ts`](../server/v2Auth.ts), [`server/v2Accounts.ts`](../server/v2Accounts.ts), [`server/v2Permissions.ts`](../server/v2Permissions.ts), [`server/v2LeadsExport.ts`](../server/v2LeadsExport.ts), [`server/migrateV2ClientProfiles.ts`](../server/migrateV2ClientProfiles.ts), [`server/v2Dispatch.ts`](../server/v2Dispatch.ts), [`server/v2DispatchLeads.ts`](../server/v2DispatchLeads.ts), [`server/v2AdminModelInsights.ts`](../server/v2AdminModelInsights.ts), [`client/src/pages/Home.tsx`](../client/src/pages/Home.tsx), [`client/src/components/LeadsSectionNavigation.tsx`](../client/src/components/LeadsSectionNavigation.tsx) e [`client/src/components/V2LeadsDashboard.tsx`](../client/src/components/V2LeadsDashboard.tsx). Guias antigos, V1 e repositórios antigos não são fontes desta atualização.

### Repositório e estado de entrega

| Item                            | Estado registrado                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositório canônico confirmado | `https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard`                                                                                                    |
| Visibilidade                    | **Privado**; isso não significa repositório público. O repositório também não deve receber segredos ou dados.                                                        |
| Branch de trabalho              | `dashboard-v2`                                                                                                                                                       |
| Branch de checkpoints           | `main`                                                                                                                                                               |
| Publicação automática           | `false`; publicação é uma operação separada.                                                                                                                         |
| Versão salva/checkpoint         | Consultar as referências Git e o histórico de versões da plataforma; o guia não fixa um SHA corrente. O versionamento documental é separado da revisão estática.     |
| Versão publicada                | Não verificada. Nenhuma URL, SHA de publicação, ID externo ou métrica corrente é afirmada aqui.                                                                      |
| Evidência funcional anterior    | A última suíte aprovada registrou **463 testes em 60 arquivos**. Esse número é evidência anterior fornecida para contexto; nenhum teste foi executado nesta revisão. |

Não foram lidos segredos, `.env`, configurações de conectores, planilhas, dados operacionais ou valores atuais do banco. Não há números correntes de Leads, metas, usuários, imports ou tráfego neste guia.

## 1. Limites de confiança e identidade

A API tRPC é montada em [`server/_core/index.ts`](../server/_core/index.ts) sob `/api/trpc`. O contexto comum mantém `ctx.user` nulo em [`server/_core/context.ts`](../server/_core/context.ts). As rotas do dashboard usam a sessão própria V2, lida exclusivamente do cookie `mg_v2_session` pelo middleware `v2Procedure` de [`server/routers.ts`](../server/routers.ts). Uma identidade Manus/OAuth/Bearer não funciona como atalho para essas rotas.

`auth.me`, `auth.login` e `auth.logout` são procedimentos públicos no sentido de não exigirem sessão prévia. `login` só cria uma sessão depois de validar a conta ativa e a senha; `me` apenas lê a sessão; `logout` apenas limpa o cookie. Todas as rotas de dados passam por `v2Procedure`, `adminProcedure`, `manualProcedure`, `ownerProcedure` ou por uma leitura com restrição de papel.

**Normalização de URL não é autorização.** A UI normaliza `module` e `tab`, remove abas incompatíveis e força o perfil `client` para Leads/Overview em [`client/src/pages/Home.tsx`](../client/src/pages/Home.tsx) e [`client/src/components/V2LeadsDashboard.tsx`](../client/src/components/V2LeadsDashboard.tsx). Isso melhora a navegação, mas não protege a API. A autorização efetiva continua sendo a validação de sessão e papel no servidor; chamadas diretas às rotas não devem ser consideradas autorizadas só porque a URL foi corrigida.

## 2. Sessão, cookie e JWT

### 2.1 Cookie de sessão

As opções atuais vêm de [`server/_core/cookies.ts`](../server/_core/cookies.ts):

| Propriedade      | Implementação atual                   |
| ---------------- | ------------------------------------- |
| Nome             | `mg_v2_session`                       |
| Caminho          | `/`                                   |
| `HttpOnly`       | `true`                                |
| `Secure`         | `true`                                |
| `SameSite`       | `none`                                |
| Duração no login | 8 horas (`maxAge` de `28.800.000` ms) |
| Logout           | `clearCookie` com as mesmas opções    |

O cookie é sempre seguro e não escolhe `Secure` ou `SameSite` com base no request. Portanto, a sessão requer HTTPS no navegador. `SameSite=None` permite contexto cross-site, inclusive Preview HTTPS embutido; o ingresso público precisa de HTTPS e de controles de origem/CSRF na borda. O código lido não implementa um token CSRF explícito. Não se deve atribuir proteção CSRF que não está implementada.

### 2.2 Token

[`server/v2Auth.ts`](../server/v2Auth.ts) assina o JWT com HS256. A carga contém somente os campos de sessão necessários:

| Claim       | Uso                                           |
| ----------- | --------------------------------------------- |
| `sub`       | ID numérico da conta em `v2_accounts`         |
| `scope`     | Deve ser `mg-dashboard-v2`                    |
| `appId`     | Deve coincidir com `MANUS_PROJECT_ID`         |
| `username`  | Identificador usado na leitura da conta       |
| `v`         | `sessionVersion`; ausência é tratada como `0` |
| `iat`/`exp` | Emissão e expiração; prazo de 8 horas         |

A verificação restringe algoritmo, assinatura, escopo, projeto, subject e tipos. Depois da verificação criptográfica, `readV2Session` consulta a conta pelo username normalizado, confere ID, `isActive` e `sessionVersion`, e lê novamente o papel do banco. Conta ausente, inativa, divergente ou com versão antiga falha fechado. `MANUS_JWT_SECRET` e `MANUS_PROJECT_ID` são necessários para assinar/verificar, mas seus valores não pertencem à documentação, ao bundle ou a uma resposta pública.

### 2.3 Senhas, usernames e tentativas

- A senha é armazenada como `scrypt$<salt>$<hash>`, com salt aleatório de 16 bytes, hash de 64 bytes e comparação em tempo constante.
- A validação aceita de 8 a 200 caracteres. O username é aparado, convertido para minúsculas e limitado a `[a-z0-9._-]{3,64}`.
- Listagens de contas autorizadas ao Administrador retornam `id`, `username`, `role`, `isActive` e `createdAt`; não retornam `passwordHash` e não são uma API pública sem sessão.
- A auditoria de conta grava conta, ator e ação (`create`, `update`, `reset_password` ou `assign_bbro`), sem senha, hash, token ou payload da requisição.
- O login mantém no processo um contador por `req.socket.remoteAddress`: até 10 tentativas na janela de 15 minutos. A décima tentativa ainda é processada; a próxima é bloqueada com `TOO_MANY_REQUESTS`. Um login válido remove o contador daquele endereço.
- Esse contador não é persistente, não é compartilhado entre réplicas e é perdido no reinício. Ele não substitui rate limiting distribuído no proxy/WAF nem controles de abuso na borda.

## 3. Papéis atuais

Os quatro papéis canônicos estão em [`shared/accountRoles.ts`](../shared/accountRoles.ts) e são validados também em [`server/routers.ts`](../server/routers.ts) e [`server/migrateV2Accounts.ts`](../server/migrateV2Accounts.ts):

| Código         | Rótulo        | Regra resumida                                                                                             |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| `admin`        | Administrador | Operação e administração, com restrições adicionais para o proprietário Rodrigo.                           |
| `client_admin` | ADM - Cliente | Leitura das áreas de cliente ampliado; não administra contas, não importa e não acessa análise por modelo. |
| `client`       | Cliente       | Somente o Overview agregado whitelisted; sem Leads pessoais, CSV ou módulos de negócio.                    |
| `bbro`         | BBRO          | Leitura operacional e validação do escopo CRM real; não é administrador.                                   |

Valores ausentes, desconhecidos ou malformados são normalizados para `client`, o perfil de menor privilégio. Essa normalização é uma contingência de leitura; não transforma dados em anônimos e não substitui autenticação, autorização de rota ou revisão de registros legados.

## 4. Matriz completa de autorização

A tabela descreve o procedimento atual, não apenas o que a UI mostra. “Sanitizado” significa projeção de apresentação com remoção de notas/diagnósticos ou rótulos técnicos conforme o código; **não significa anonimizado automaticamente**.

| Recurso/procedimento                                                              | `admin`                                               | `client_admin`                                           | `client`                  | `bbro`                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------- |
| `auth.me`, `auth.login`, `auth.logout`                                            | Sessão própria                                        | Sessão própria                                           | Sessão própria            | Sessão própria                                                       |
| `accounts.list/create/update/resetPassword`                                       | CRUD administrativo                                   | Negado                                                   | Negado                    | Negado                                                               |
| `leads.dashboard`                                                                 | Leitura completa                                      | Leitura das abas originais, com projeção de apresentação | Somente Overview agregado | Leitura de apresentação e escopo operacional                         |
| `leads.goal`, `leads.updateGoal`                                                  | Consultar/editar meta de Leads                        | Negado                                                   | Negado                    | Negado                                                               |
| `leads.salesGoal`, `leads.updateSalesGoal`                                        | Somente Admin cujo username seja exatamente `rodrigo` | Negado                                                   | Negado                    | Negado                                                               |
| `leads.syncConnection`, `leads.syncBase`                                          | Consultar conexão/importar base                       | Negado                                                   | Negado                    | Negado                                                               |
| `leads.modelInsights`                                                             | Exclusivo do Admin                                    | Negado                                                   | Negado                    | Negado                                                               |
| `leads.exportCSV`                                                                 | Permitido; estado de apresentação pode mascarar nomes | Permitido como leitura/exportação, sem gestão            | Negado                    | Permitido como leitura/exportação, sem gestão                        |
| `mediaPlan.plans`                                                                 | Leitura                                               | Leitura                                                  | Negado                    | Leitura                                                              |
| `mediaPlan.projections`, `mediaPlan.updateProjections`                            | Somente `admin` com username exatamente `rodrigo`     | Negado                                                   | Negado                    | Negado                                                               |
| `dispatch.reports`                                                                | Lista completa                                        | Lista de apresentação                                    | Negado                    | Lista de apresentação                                                |
| `dispatch.report`                                                                 | Relatório completo                                    | Negado                                                   | Negado                    | Negado                                                               |
| `dispatch.leadControl`                                                            | Projeção `controlForCRM`, não relatório bruto         | Projeção `controlForCRM` com redação de apresentação     | Negado                    | Projeção `controlForCRM` com escopo CRM nas operações de controle    |
| `dispatch.setManual`, `dispatch.history`                                          | Permitido                                             | Negado                                                   | Negado                    | Permitido somente para CRM/unidade de qualificação e data até D-1    |
| `dispatch.prepareLeadControl`                                                     | Preparar controle                                     | Negado                                                   | Negado                    | Preparar somente o recorte CRM (`crmOnly`) e dias encerrados até D-1 |
| `dispatch.prepareDay`, `dispatch.importWorkbook`                                  | Permitido                                             | Negado                                                   | Negado                    | Negado                                                               |
| `commercial.status`, `previewGoals`, `commitGoals`, `preview`, `commit`, `remove` | Permitido                                             | Negado                                                   | Negado                    | Negado                                                               |

`client` ainda pode executar as operações de sessão necessárias ao login/logout; “sem mutations” neste documento significa sem mutações de negócio, importações, gestão, metas, CSV ou controle operacional.

### 4.1 O que o `client` realmente recebe

A projeção [`dashboardForOverviewClient`](../server/v2Permissions.ts) mantém o Overview agregado e a whitelist comercial de dealer: nome/UF do cadastro, Leads, metas, vendas, conversão e metas coletivas. Os grupos de meta são apresentados como `Meta coletiva da rede`/`Collective network goal` conforme a localidade da UI.

Antes de sair do servidor, essa projeção remove a análise restrita e reduz ou esvazia campos de detalhamento: não entrega linhas de Leads recentes, CRM, cidades, canais, campanhas, versões, horas ou a matriz regional detalhada. O novo `client` não recebe a aba Leads, CSV, Plano de mídia, Controle de envios ou Usuários. Na UI, [`Home.tsx`](../client/src/pages/Home.tsx) mantém esse perfil em `module=leads`, remove `tab` e renderiza somente `Visão Geral`.

O `client_admin` não é o mesmo perfil: ele conserva a leitura das quatro abas originais — `Visão Geral`, `Lojas & CRM`, `Regiões` e `Leads` — e pode ler os módulos de Plano de mídia e Controle de envios permitidos pela matriz, mas não vê Usuários, não importa, não administra contas, não altera metas, não executa a sincronização externa e não recebe Análise por modelo. A UI desse perfil usa localidade inglesa (`Overview`, `Stores & CRM`, `Regions`, `Leads`, `Model analysis`), embora a aba de análise permaneça bloqueada.

### 4.2 O que “sanitizado” não quer dizer

`dashboardForClient` remove avisos e diagnósticos técnicos, normaliza rótulos e agrupa estados; `dispatchForClient` troca título/arquivo, remove informações/notas e apresenta o revisor como `Equipe MG`. Essas projeções não são uma garantia geral de anonimização. Para `client_admin` e `bbro`, a leitura da tabela de Leads contém os campos individuais autorizados da oportunidade, inclusive nome, e-mail e telefone. O histórico de controle também retorna o username do ator que alterou a célula para os perfis autorizados.

**Atualização de 12/11/2026:** a aba Leads trata seus registros como oportunidades e mostra nome completo, e-mail, telefone e carro de interesse. Somente as linhas da página canônica recebem esses campos selecionados da proveniência pelo ID; headers, values, payloads e demais colunas privadas não saem na resposta. Dados ausentes não são inventados nem recuperados de outra pessoa de mesmo nome. O perfil `client` continua com `recent.rows=[]`, sem contatos, e as permissões de contas não mudaram.

O modo apresentação oculta nome, e-mail e telefone no texto e nos atributos da tabela. Essa máscara é visual: não modifica o papel nem promete remover os dados da resposta protegida de uma conta autorizada. O CSV preserva o contrato anterior; o PDF agregado não inclui linhas de oportunidades nem contatos.

Não declarar “dados sanitizados automaticamente anônimos”. A remoção de campos pessoais do Overview do `client` é uma regra específica de `dashboardForOverviewClient`, não uma propriedade de todo dado V2.

### 4.3 Proprietário Rodrigo e BBRO

Há restrições mais fortes do que “ser Admin”:

1. `ownerProcedure` exige `role === "admin"` e username exatamente `rodrigo` para consultar/salvar o total mensal de vendas e para ler/salvar projeções do plano de mídia. Capitalização diferente não deve ser presumida como proprietário.
2. A atribuição do papel BBRO é uma operação separada e auditada em [`server/v2Accounts.ts`](../server/v2Accounts.ts): requer a conta Rodrigo como Admin e procura a conta existente cujo username seja `bbro`. Não cria conta, não define senha e incrementa a `sessionVersion` do alvo.
3. BBRO não é um Admin disfarçado. `setManual` e `history` revalidam a loja e a data; somente lojas do conjunto CRM ou a linha de qualificação e dias encerrados até D-1 passam. `prepareLeadControl` recebe `crmOnly=true` para BBRO e prepara o controle CRM, sem importar a planilha de envios.
4. A leitura de `dispatch.leadControl` passa por `controlForCRM` para Admin, ADM - Cliente e BBRO; ela reconcilia/mescla o controle e não equivale ao relatório bruto de `dispatch.report`. Há ainda redações de apresentação conforme o perfil. O código preserva linhas necessárias à conciliação e não deve ser descrito como se descartasse todo dealer não oficial; a restrição CRM mais forte está nas operações de validação/preparação.

## 5. Navegação e fronteiras de UI

[`client/src/components/LeadsSectionNavigation.tsx`](../client/src/components/LeadsSectionNavigation.tsx) define a ordem atual das abas: `Visão Geral`, `Lojas & CRM`, `Regiões`, `Leads`. `Análise por modelo` só é acrescentada quando `canManage` é verdadeiro e não há `clientView` nem `overviewOnly`; o servidor reforça isso com `adminProcedure` em `leads.modelInsights`.

O manifesto atual de rotas de página está em [`client/public/manus-routes.json`](../client/public/manus-routes.json). Ele lista módulos/abas como entradas de navegação, mas não concede acesso. Parâmetros `tab=models` ou `tab=model-analysis` para perfis não autorizados são normalizados/removidos pela UI; uma chamada direta a `leads.modelInsights` continua negada pelo servidor.

A UI de Admin também expõe o modo de apresentação. Esse modo é uma projeção de visualização, não um novo papel e não substitui a autorização do backend. O Admin é o único perfil que recebe o módulo Usuários, os uploads comerciais e a sincronização/importação externa.

## 6. Exportação CSV: máscara, antiformula e limites

A rota `leads.exportCSV` usa [`server/v2LeadsExport.ts`](../server/v2LeadsExport.ts) e é permitida para Admin, `client_admin` e BBRO; o novo `client` não alcança a rota. A exportação:

- ignora paginação e usa todos os registros do recorte aplicado, preservando filtros de período, modelo, canal, campanha, dealer e busca;
- exige que a fonte de Leads esteja pronta; fonte não configurada produz erro específico, não um CSV vazio enganoso;
- respeita a validação de período do dashboard, incluindo data final até D-1 e período máximo de três anos;
- rejeita mais de `100.000` linhas ou saída acima de `16 MiB`;
- usa BOM UTF-8, CRLF, separador `;` e escape de aspas para compatibilidade com planilhas;
- protege campos textuais contra injeção de fórmula quando há controles iniciais ou prefixos `=`, `+`, `-` ou `@`, incluindo o caso com espaços/controles antes do caractere; a hora numérica não passa por esse caminho;
- mascara o nome somente quando o input `clientMode` é verdadeiro, retornando `nameMasked` para conferência da UI; agrupa UF para não-Admin;
- na UI, confirma que o período da resposta corresponde ao recorte solicitado e, quando solicitado, que a resposta informou nome mascarado.

**Limitação importante:** `clientMode` é uma flag de apresentação do request, não uma autorização por papel. O servidor não força máscara de nome apenas por o papel ser `client_admin` ou `bbro`; a UI desses perfis passa atualmente `clientMode=false`. Portanto, não documentar “CSV sempre mascarado” sem uma mudança de código que imponha essa regra no backend.

### 6.1 Resumo PDF da Overview — 10/11/2026

O botão [`V2OverviewPdfButton.tsx`](../client/src/components/V2OverviewPdfButton.tsx) está disponível na Overview de todos os perfis autenticados, inclusive `client`. Não chama `leads.exportCSV` e não libera qualquer outra rota ou aba. No clique, relê somente `leads.dashboard` com os filtros e a autorização vigentes, sem importar arquivos ou chamar `syncBase`. [`overviewPdf.ts`](../client/src/lib/overviewPdf.ts) verifica a versão agregada correspondente, clona exclusivamente a raiz marcada da Overview já autorizada e prepara um documento local isolado de quatro páginas para a impressão nativa/Salvar como PDF. Não faz upload público ou envio a terceiros.

A clonagem remove controles, importação, diagnósticos/notas da fonte, metadados privados de arquivos e tooltips. Filtros textuais de busca não aparecem com o conteúdo original. A exportação conserva gráficos/valores do snapshot carregado, idioma, período e D-1 São Paulo; recorte inválido/futuro é rejeitado e o botão permanece bloqueado enquanto os dados estão atualizando. Os Top 10 e Bottom 10 usam apenas as unidades com conversão comparável no agregado autorizado; sem contato pessoal, preenchimento fictício, rateio de coletivos ou unidades EM BREVE. Alteração de layout para impressão ocorre no clone, não no dashboard.

Depois de salvo pelo usuário, o PDF contém informação comercial agregada: cabe a quem compartilha escolher destinatários autorizados. Resumo em PDF não equivale a anonimização ou a autorização pública dos dados.

## 7. Diagnóstico administrativo agregado

`leads.modelInsights`, implementado em [`server/v2AdminModelInsights.ts`](../server/v2AdminModelInsights.ts), é exclusivo do Admin e só é carregado pela UI quando a aba de análise é autorizada e a fonte está pronta. O retorno contém agregados de modelo, versão, estado, canal, dealer e campanha, matrizes, séries diárias, cobertura da fonte, comparação com janela anterior, gaps de qualidade e oportunidades de mix.

O módulo não seleciona nem retorna campos de nome de Lead, e-mail ou telefone; suas linhas de diagnóstico são contagens, percentuais, rótulos comerciais normalizados e mensagens de qualidade. Isso documenta a forma efetivamente retornada por esse diagnóstico e não equivale a prometer anonimização de toda a fonte, do banco ou de outros endpoints. Os rótulos passam por `safeDiagnosticLabel`; a ausência de PII no diagnóstico não elimina a necessidade de restringir o acesso ao Admin.

Os limites de análise são de comportamento do código: amostra baixa abaixo de 30, gap de mix a partir de 5 pontos percentuais, no máximo 50 insights e 100 oportunidades; matrizes não são truncadas. Esses números são limites de processamento, não métricas correntes do negócio.

## 8. Revogação de sessão, contas e migrações legadas

Alterar papel ou status, redefinir senha, atribuir BBRO e migrar um cliente legado incrementa `sessionVersion`. A sessão antiga falha em `readV2Session` mesmo antes do vencimento do JWT. Alterações administrativas usam transação e lock para impedir a remoção do último Admin ativo.

A migração [`server/migrateV2ClientProfiles.ts`](../server/migrateV2ClientProfiles.ts) é finita, explícita e idempotente. Ela:

- exige um `actorId` de Administrador ativo para auditoria;
- converte somente contas já existentes com `role='client'` para `client_admin`;
- incrementa a `sessionVersion` e registra auditoria do ator;
- não seleciona nem altera `passwordHash` ou `isActive`;
- não cria conta ou senha nem concede papel de Administrador; restaura a leitura ampliada dos Clientes legados e registra um marcador em `v2_user_migrations`.

A migração de contas em [`server/migrateV2Accounts.ts`](../server/migrateV2Accounts.ts) também é runner explícito, não bootstrap: atualiza apenas contas existentes, promove a conta `rodrigo` já existente quando aplicável e tenta atribuir BBRO à conta existente `bbro`. Nenhuma dessas rotinas deve ser descrita como seed automático de conta ou senha. O processo de inicialização do servidor não executa seed, import, ETL ou migration.

## 9. Minimização pública e limites observados

A rota `/api/platform/config.js` usa a whitelist de [`server/_core/publicConfig.ts`](../server/_core/publicConfig.ts). Podem chegar ao navegador apenas `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL` e `MANUS_API_BROWSER_KEY`. O código não serializa `process.env` inteiro; `DATABASE_URL`, `MANUS_JWT_SECRET` e `MANUS_API_KEY` não fazem parte dessa resposta. Valores browser-safe não devem ser confundidos com segredos.

Limitações verificadas no código atual:

1. `/api/health` retorna `status: "ok"`, produto e `environment: "homologacao"`; não testa banco, tabelas, migrations ou dependências externas. É uma sonda HTTP de processo.
2. [`Dockerfile`](../Dockerfile) não declara `HEALTHCHECK` nativo.
3. A proteção de login é por processo e endereço de socket; reinícios, réplicas e proxies que não preservem a origem reduzem sua efetividade.
4. O cookie cross-site seguro não é acompanhado de token CSRF explícito; a borda precisa definir origem, CSRF e política de domínio antes de exposição pública.
5. A ausência de configuração de banco ou assinatura pode aparecer somente quando uma rota autenticada tenta usá-la; o processo pode iniciar antes de uma operação falhar.
6. A UI oculta módulos e abas por papel, mas isso não é a fronteira de segurança. A fronteira é a checagem de sessão/papel nas procedures e as validações de escopo dentro dos serviços.
7. O repositório canônico é privado, mas ainda assim não é local adequado para segredos, hashes, cookies, dados pessoais, planilhas ou IDs externos. Privacidade do repositório não torna esses materiais aceitáveis.

## 10. Referências de implementação

- [Papéis, normalização e capacidades — `shared/accountRoles.ts`](../shared/accountRoles.ts)
- [Procedimentos e matriz de rotas — `server/routers.ts`](../server/routers.ts)
- [JWT, sessão, hash e rate limit — `server/v2Auth.ts`](../server/v2Auth.ts)
- [Contas, auditoria e invalidação — `server/v2Accounts.ts`](../server/v2Accounts.ts)
- [Projeções de permissão e apresentação — `server/v2Permissions.ts`](../server/v2Permissions.ts)
- [Cookie de sessão — `server/_core/cookies.ts`](../server/_core/cookies.ts)
- [Contexto tRPC — `server/_core/context.ts`](../server/_core/context.ts)
- [Montagem HTTP, health e `/api/trpc` — `server/_core/index.ts`](../server/_core/index.ts)
- [Whitelist pública — `server/_core/publicConfig.ts`](../server/_core/publicConfig.ts)
- [CSV, máscara e limites — `server/v2LeadsExport.ts`](../server/v2LeadsExport.ts)
- [Schema do input/resultado CSV — `shared/leadsExport.ts`](../shared/leadsExport.ts)
- [Diagnóstico agregado Admin — `server/v2AdminModelInsights.ts`](../server/v2AdminModelInsights.ts)
- [Controle CRM e escopo BBRO — `server/v2Dispatch.ts`](../server/v2Dispatch.ts)
- [Preparação do controle CRM/D-1 — `server/v2DispatchLeads.ts`](../server/v2DispatchLeads.ts)
- [Migração de perfis legados — `server/migrateV2ClientProfiles.ts`](../server/migrateV2ClientProfiles.ts)
- [Migração de papéis/contas — `server/migrateV2Accounts.ts`](../server/migrateV2Accounts.ts)
- [Shell da UI e módulos por papel — `client/src/pages/Home.tsx`](../client/src/pages/Home.tsx)
- [Abas e análise por modelo — `client/src/components/LeadsSectionNavigation.tsx`](../client/src/components/LeadsSectionNavigation.tsx)
- [Dashboard, projeções e consultas — `client/src/components/V2LeadsDashboard.tsx`](../client/src/components/V2LeadsDashboard.tsx)
- [Exportação na UI — `client/src/components/V2LeadsExportButton.tsx`](../client/src/components/V2LeadsExportButton.tsx)
- [Manifesto de rotas de página — `client/public/manus-routes.json`](../client/public/manus-routes.json)
