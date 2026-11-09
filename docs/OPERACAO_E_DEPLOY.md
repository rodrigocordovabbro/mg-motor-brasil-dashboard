# MG Motor Brasil | Operação e Deploy

> **Estado documental registrado em 09/11/2026.** Este guia foi revisado somente contra os arquivos de código/configuração listados em [Fontes reais](#11-fontes-reais), além das decisões canônicas confirmadas para este projeto. Os comandos operacionais abaixo são referência e **não foram executados nesta revisão**.
>
> O produto público continua sendo MG Motor Brasil. Os nomes `v2_*` identificam módulos e tabelas técnicas; não são um título público.

## 1. Estado canônico e limites desta documentação

| Item                                    | Estado confirmado                                                                                                                | O que não deve ser inferido                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Repositório canônico                    | [GitHub privado `rodrigocordovabbro/mg-motor-brasil-dashboard`](https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard) | Não é repositório público e não é um destino antigo.                                 |
| Branch de trabalho                      | `dashboard-v2`                                                                                                                   | Um commit nessa branch ainda não é checkpoint em `main`.                             |
| Checkpoints                             | `main` é a branch usada para checkpoints                                                                                         | Salvar checkpoint e publicar são operações distintas.                                |
| Publicação automática                   | Desativada (`false`)                                                                                                             | Não há CI/CD ou publicação automática prometida por este repositório.                |
| Publicação                              | Separada do checkpoint e deve ser autorizada/confirmada à parte                                                                  | Uma versão salva não é automaticamente a versão servida.                             |
| Banco no ambiente Manus                 | Desenvolvimento e publicação compartilham o banco gerenciado atual                                                               | Não documentar esses dois ambientes como bancos separados sem uma decisão nova.      |
| Instalações/testes experimentais        | Devem usar banco separado, com credencial própria                                                                                | Nunca apontar fixtures, testes ou DDL experimental para o banco compartilhado atual. |
| Código antigo/V1 e repositórios antigos | Não são destinos atuais                                                                                                          | Não copiar, migrar ou publicar a partir deles.                                       |

O repositório GitHub privado é o canônico atual; não o descreva como “cópia independente do Manus”. Banco gerenciado, segredos, contas, dados e arquivos operacionais não são transportados pelo Git. Não copie `.env`, dumps, planilhas, credenciais, logs operacionais ou tokens para o repositório, uma imagem, um ticket ou um comando registrado.

### 1.1 Fontes reais, valores ausentes e versões

As afirmações técnicas deste guia vêm do código atual, não de guias antigos. A lista completa está em [Fontes reais](#11-fontes-reais). O seguinte permanece deliberadamente sem valor fixo:

- SHA atual da branch `dashboard-v2`, SHA efetivamente salvo em `main`, versão/commit publicado, URL publicada e status corrente do serviço;
- contagem atual de Leads, data da última importação, cobertura por fonte, estado de migrações no banco e existência/acesso da planilha-base;
- IDs externos da planilha, JSON da conta de serviço, DSNs, tokens, senhas e qualquer outro segredo;
- ocorrência atual de HTTP 503, OOM ou publicação antiga servindo tráfego.

A suíte funcional anteriormente aprovada registrou **463 testes em 60 arquivos**. Isso é evidência anterior, não um teste executado nesta revisão. A revisão estática não executou instalação, migração, importação, teste funcional ou publicação; o versionamento Git da documentação é uma etapa separada.

Sempre separe:

1. **Versão de trabalho:** commit em `dashboard-v2`.
2. **Versão salva:** commit aceito em `main` e confirmado como checkpoint pela plataforma.
3. **Versão publicada:** versão/commit que o serviço realmente está servindo após uma publicação separada e confirmada.

Não chame a versão publicada de “nova” apenas porque existe um commit novo na branch de trabalho. Não chame um checkpoint de publicação bem-sucedida sem confirmação própria.

## 2. Arquitetura executável observada

| Camada               | Implementação no código atual                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Runtime              | Node.js 22, imagem `node:22-bookworm-slim`                                                                                         |
| Gerenciador          | pnpm 10.18.0, declarado em `packageManager` e `devDependency`                                                                      |
| HTTP                 | Express sobre servidor HTTP nativo                                                                                                 |
| API                  | tRPC em `/api/trpc`, roteador em [`server/routers.ts`](../server/routers.ts)                                                       |
| Frontend             | React + Vite; desenvolvimento com HMR no mesmo servidor                                                                            |
| Banco                | MySQL/TiDB compatível via `mysql2`, camada customizada em [`server/v2Db.ts`](../server/v2Db.ts)                                    |
| Build                | `vite build` produz o cliente em `dist/public`; esbuild empacota o servidor em `dist/index.js`                                     |
| Listener             | `0.0.0.0`, com `PORT` validado entre 1 e 65535; padrão 3000                                                                        |
| Conteúdo persistente | Contas, Leads, snapshots comerciais, dispatch, projeções, overrides, auditorias e proveniência privada conforme o esquema aplicado |

O entrypoint em [`server/_core/index.ts`](../server/_core/index.ts) monta JSON/URL-encoded com limite de 2 MiB, expõe `/api/health`, monta tRPC e escolhe Vite em `NODE_ENV=development` ou arquivos estáticos em qualquer outro modo. O servidor não importa nenhum `migrateV2*.ts`, não faz seed e não importa planilha ao iniciar.

O endpoint `GET /api/health` devolve `status: "ok"`, o produto e `environment: "homologacao"`. Ele é **somente liveness**: não testa banco, tabelas, migrações, Google Sheets ou outros serviços. O [`Dockerfile`](../Dockerfile) não declara `HEALTHCHECK`; se a infraestrutura usar uma sonda HTTP, ela deve chamar esse endpoint sem transformá-lo em readiness.

A sessão usa cookie HTTP-only com `Secure`, `SameSite=None` e caminho `/`, conforme [`server/_core/cookies.ts`](../server/_core/cookies.ts). O ingresso externo deve terminar em HTTPS. A versão da sessão é consultada no banco; mudanças de papel, status ou senha incrementam `sessionVersion` e tornam tokens antigos inválidos.

## 3. Instalação, scripts e container

### 3.1 Instalação reprodutível

A partir da raiz do repositório, em uma instalação controlada:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
```

O mesmo pin é usado no [`Dockerfile`](../Dockerfile), que copia `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` e `patches` antes de executar `CI=1 pnpm install --frozen-lockfile`. O arquivo [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) declara o patch do `wouter`, o override de `nanoid` e os pacotes que podem executar build nativo.

Não registre a saída com DSNs ou segredos. Não inclua `.env` ou variantes no Git. O Dockerfile usa `COPY . .`; portanto, o contexto de build deve ser controlado para não carregar arquivos secretos ou operacionais. Variáveis privadas entram somente em runtime pelo mecanismo de segredos apropriado.

### 3.2 Scripts existentes

| Script              | Efeito observado                                                       | Cuidados                                                                       |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`          | Define `NODE_ENV=development` e roda `tsx watch server/_core/index.ts` | Usa Vite/HMR e o mesmo servidor HTTP.                                          |
| `pnpm build`        | Executa Vite e esbuild, gerando `dist/public` e `dist/index.js`        | É o build usado pelo container.                                                |
| `pnpm start`        | Define `NODE_ENV=production` e roda `node dist/index.js`               | Não cria esquema, conta, seed ou import.                                       |
| `pnpm check`        | `tsc --noEmit`                                                         | Não é migração nem teste de banco.                                             |
| `pnpm test`         | `vitest run`                                                           | Não aponte testes de integração para o banco Manus compartilhado.              |
| `pnpm dev:static`   | Vite estático em `0.0.0.0` usando `PORT` ou 3000                       | Não fornece Express, tRPC, autenticação nem `/api/health`.                     |
| `pnpm build:static` | `vite build`                                                           | Gera somente o cliente; não substitui o bundle do servidor.                    |
| `pnpm db:migrate`   | `drizzle-kit migrate`                                                  | Atua no starter Drizzle e pode escrever no banco.                              |
| `pnpm db:push`      | `drizzle-kit generate && drizzle-kit migrate`                          | Pode gerar e aplicar mudança de esquema; não é procedimento do esquema `v2_*`. |
| `pnpm format`       | Reescreve arquivos com Prettier                                        | Não use como etapa automática de deploy.                                       |

Uma execução controlada de `pnpm build` deve preceder `pnpm start` quando não houver `dist`. A ausência de `DATABASE_URL`, `MANUS_PROJECT_ID` ou `MANUS_JWT_SECRET` pode aparecer somente ao usar uma rota; o processo ainda pode começar a escutar antes disso.

### 3.3 Imagem e processo

O container atual:

1. parte de Node 22 Bookworm Slim;
2. ativa pnpm 10.18.0;
3. instala o lockfile congelado;
4. copia o projeto e executa `pnpm build` durante a criação da imagem;
5. define `NODE_ENV=production` e `PORT=3000`;
6. expõe 3000 e inicia `node dist/index.js`.

Referência de execução local com um arquivo controlado, sem colocar valores na linha de comando:

```bash
docker build -t mgmotorsv2:local .
docker run --rm -p 3000:3000 --env-file <arquivo-de-ambiente-controlado> mgmotorsv2:local
```

Esses exemplos não foram executados nesta revisão. O arquivo controlado não pode apontar testes para o banco compartilhado ou de produção. Dados duráveis pertencem ao banco/armazenamento apropriado; não grave segredos ou dados de Leads na imagem.

## 4. Variáveis de ambiente e segredos

Os nomes abaixo foram observados no código atual. Valores não pertencem a este documento.

| Variável                                                           | Obrigatoriedade/alcance observado                       | Uso real                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                     | Necessária para a camada `v2` e para comandos Drizzle   | DSN consumida por `mysql2` e `drizzle-kit`; somente no processo autorizado.                                                                                                                   |
| `MANUS_PROJECT_ID`                                                 | Necessária para criar/verificar sessão V2               | Participa do claim `appId`; também pode ser enviado como configuração pública do navegador.                                                                                                   |
| `MANUS_JWT_SECRET`                                                 | Necessária para login/verificação V2                    | Chave HS256 exclusiva do servidor; nunca vai para HTML, logs ou Git.                                                                                                                          |
| `NODE_ENV`                                                         | Seleção explícita de execução                           | `development` liga Vite/HMR; `production` é usado pelo script de produção.                                                                                                                    |
| `PORT`                                                             | Opcional                                                | Padrão 3000; o entrypoint rejeita valores fora de 1–65535.                                                                                                                                    |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`                               | Necessária somente para sync Google                     | JSON de conta de serviço com `client_email` e `private_key`; segredo somente do servidor.                                                                                                     |
| `GOOGLE_SHEETS_SPREADSHEET_ID`                                     | Opcional para resolver a fonte                          | Quando presente, é usado como fonte configurada; quando ausente, o código consulta a fonte canônica registrada no banco. O valor nunca deve ser exposto neste guia.                           |
| `MG_MIGRATION_ACTOR_ID`                                            | Somente na execução direta de `migrateV2ClientProfiles` | Identifica o Administrador ativo que audita a mudança de papel; não é valor para fixar ou compartilhar.                                                                                       |
| `MG_SYNC_DIAGNOSTICS`                                              | Opt-in                                                  | Só quando exatamente `1`, registra amostras de uso de memória do sync; não ativa importação, não altera a lógica e não mede SLA.                                                              |
| `MANUS_OAUTH_PORTAL_URL`, `MANUS_API_URL`, `MANUS_API_BROWSER_KEY` | Configuração pública opcional                           | [`server/_core/publicConfig.ts`](../server/_core/publicConfig.ts) envia somente esses valores e `MANUS_PROJECT_ID` ao navegador. Não confundir valores browser-safe com segredos de servidor. |

A whitelist pública não serializa `process.env` inteiro. Em particular, não exponha `DATABASE_URL`, `MANUS_JWT_SECRET`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`, tokens, senhas ou IDs externos da planilha.

## 5. Banco e migrações

### 5.1 Ambientes

No projeto Manus atual, desenvolvimento e publicação **compartilham o banco gerenciado atual**. Isso significa que uma escrita, deleção, migração, importação ou teste que alcance essa base pode afetar o serviço publicado. Não use o banco compartilhado para experimentação.

Para uma instalação nova, laboratório, fixture, teste de integração ou reprodução de falha, use uma instância MySQL/TiDB separada e uma `DATABASE_URL` separada. Essa separação experimental não deve ser descrita como uma característica do banco Manus atual.

O starter Drizzle é configurado por [`drizzle.config.ts`](../drizzle.config.ts), aponta para [`drizzle/schema.ts`](../drizzle/schema.ts), usa dialeto MySQL e exige `DATABASE_URL`. Seus comandos (`db:migrate`/`db:push`) não criam nem evoluem todas as tabelas `v2_*`. Não use `db:push` cegamente para “corrigir” o esquema V2.

### 5.2 Pré-requisitos e ordem manual

A ordem abaixo deriva das foreign keys, colunas e verificações efetivamente observadas. Ela é um runbook manual, não um “migrate all”. Faça revisão, aprovação e backup antes de cada mudança de esquema ou papel. Execute um processo por vez; **não copie os executáveis para um loop automático** e não os importe no startup.

1. **Base V2:** executar, em cliente SQL aprovado, [`drizzle/v2-base.sql`](../drizzle/v2-base.sql). Cria/garante contas, fonte, Leads, metas de Leads e auditoria de metas.
2. **Dispatch base:** executar [`drizzle/v2-dispatch.sql`](../drizzle/v2-dispatch.sql). Cria relatórios, linhas, células, checks e auditoria de checks; suas foreign keys exigem contas V2.
3. **Contas:** executar `pnpm exec tsx server/migrateV2Accounts.ts`. Garante o enum aditivo `admin`, `client`, `client_admin`, `bbro`, `sessionVersion`, tabelas de auditoria e marcadores. Promove somente uma conta existente com username `rodrigo` para `admin`; não cria conta, senha ou hash. A etapa de BBRO atua somente sobre a conta existente `bbro`, quando encontrada, pela autorização da conta Rodrigo; ao atribuir o papel, incrementa a versão da sessão.
4. **Perfis de cliente:** executar `MG_MIGRATION_ACTOR_ID=<id-interno-de-admin-ativo> pnpm exec tsx server/migrateV2ClientProfiles.ts`. O runner valida, antes da mudança, que o ator é um Administrador ativo. Converte somente contas existentes com papel `client` para `client_admin`, incrementa `sessionVersion` e grava auditoria. Não seleciona nem altera `passwordHash` ou `isActive`, não converte `admin`/`bbro` e não cria conta. A marca de migração torna a execução idempotente.
5. **Comercial:** executar `pnpm exec tsx server/migrateV2Commercial.ts`. Garante snapshots comerciais e `sourceWeek`, preservando snapshots antigos.
6. **Registration:** executar `pnpm exec tsx server/migrateV2Registration.ts`. Adiciona `registrationMtd` e `registrationAsOf` como colunas nulas, sem backfill de snapshots antigos.
7. **Retail:** executar `pnpm exec tsx server/migrateV2Retail.ts`. Adiciona `retailMtd` e `retailAsOf` como colunas nulas depois das colunas de Registration; preserva snapshots antigos e não faz backfill.
8. **Lifecycle comercial:** executar `pnpm exec tsx server/migrateV2CommercialLifecycle.ts`. Cria estado/auditoria do ciclo, adiciona proveniência às metas e somente vincula metas legadas quando valor, horários, ator e auditoria conferem exatamente; incertezas permanecem manuais.
9. **Registry de dealers:** executar `pnpm exec tsx server/migrateV2DealerRegistry.ts`. Cria o registro com chave normalizada; não importa linhas de dealers por conta própria.
10. **Dispatch diário:** executar `pnpm exec tsx server/migrateV2DispatchDaily.ts`. Torna `volume` anulável, adiciona `sourcePending` e cria a tabela de imports de dispatch; preserva dados e checks existentes.
11. **Meta total de vendas:** executar `pnpm exec tsx server/migrateV2SalesGoal.ts`. Cria tabelas de meta, auditoria e locks; não semeia nem reescreve valor importado.
12. **Projeções de mídia:** executar `pnpm exec tsx server/migrateV2MediaPlanProjections.ts`. Cria versões, overrides e auditoria em três DDLs independentes; não semeia, reseta ou reescreve projeção aprovada.
13. **Proveniência de Leads:** executar `pnpm exec tsx server/migrateV2LeadsSync.ts`. Cria somente `v2_lead_imports`, `v2_lead_sync_rows` e `v2_lead_sync_history`; não contém `ALTER`, `DROP`, `DELETE` nem backfill.

Os nomes dos comandos acima são scripts avulsos reais, não comandos a serem concatenados. Os runners podem executar `ALTER TABLE`, criar locks ou atualizar proveniência; não há rollback SQL automático nem comando único de downgrade. Se uma etapa falhar, pare, preserve o erro seguro, revise o backup e a compatibilidade antes de tentar novamente.

### 5.3 Configuração inicial de fonte: limite conhecido

O sync exige o registro interno de fonte já configurado, e o dashboard usa `importedAt` como sinal de importação. No DDL atual, `v2_sources.importedAt` é `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`. Criar uma linha vazia com esse padrão pode anunciar `READY` e permitir exportação sem uma importação concluída; a preparação do schema não comprova presença de dados.

**Não criar um timestamp, hash ou total fictício para contornar a falta de bootstrap.** Uma instalação realmente vazia precisa de procedimento de inicialização/evolução de fonte aprovado e compatível com esse marcador; ele não é fornecido por um seed automático no código atual. Tornar a data anulável e definir o estado pré-importação seria uma mudança de schema/código com revisão e backup próprios, não algo aplicado por esta revisão documental. Em instalações existentes, preservar os metadados da importação real e não resetar a fonte.

### 5.4 O que não acontece no startup

- O entrypoint não importa nenhum `migrateV2*.ts`.
- `pnpm start` não executa DDL, seed, criação de conta, definição de senha, importação de planilha ou ETL.
- Não há cron, agendamento ou sync Google automático no código lido.
- O botão de Leads é uma ação autenticada e administrativa; clientes e BBRO não executam a importação.
- Migrações e importações reais não são testes de Prévia. A Prévia não recebe automaticamente segredos configurados somente para publicação.

## 6. Backup, aprovação e restauração

O código não implementa serviço automático de backup, restore ou rollback. Use a ferramenta SQL/backup aprovada, mantendo conexão e dados fora deste documento e do Git.

Antes de DDL, mudança de papel, deploy sensível ou importação real:

1. confirme o ambiente, a versão de trabalho/checkpoint e o banco correto;
2. obtenha aprovação explícita para a mudança;
3. bloqueie mutações administrativas ou agende janela controlada quando necessário;
4. faça backup lógico consistente de `users` se usado e das tabelas `v2_*`, incluindo auditorias, locks, snapshots e proveniência;
5. criptografe e restrinja o arquivo fora do repositório;
6. valide a leitura do backup em restauração isolada sem apontar a aplicação de produção;
7. registre apenas metadados não secretos (ambiente, horário, escopo, versão e identificador interno do backup).

Não registre DSN, senha, token, valor de `GOOGLE_SHEETS_SPREADSHEET_ID` ou conteúdo de Leads. Não apague snapshots/auditorias para fazer rollback. Para restaurar, use primeiro uma base isolada, compare estrutura/contagens/estado e só depois faça uma troca controlada. O artefato de aplicação precisa ser compatível com o esquema restaurado; não há downgrade automático.

## 7. Runbook de deploy e checkpoint

### 7.1 Antes da publicação

1. Trabalhe na branch `dashboard-v2` do repositório GitHub privado canônico.
2. Revise somente os arquivos autorizados para o commit e não inclua banco, segredos, dados, planilhas, dumps ou arquivos operacionais.
3. Em ambiente experimental, use banco separado. No Manus atual, lembre que desenvolvimento e publicação compartilham o banco gerenciado.
4. Faça backup/aprovação antes de qualquer DDL ou mudança de papel.
5. Monte o container a partir do commit autorizado e injete variáveis privadas no runtime; não dependa de segredo durante a compilação.
6. Confirme que `dist/index.js` e `dist/public` existem na imagem e que o listener usa `PORT`.
7. Use `GET /api/health` somente para verificar liveness. Ele não comprova banco pronto nem migrações aplicadas.
8. Não execute migrações, seed ou importação como efeito colateral de subir o container.

### 7.2 Checkpoint, publicação e verificação de versão

- Um checkpoint válido é o commit aceito em `main` e confirmado pela plataforma como versão salva.
- A publicação é uma operação separada; a configuração canônica de publicação automática permanece `false`.
- A versão em `dashboard-v2`, a versão salva em `main` e a versão servida devem ser registradas separadamente.
- Só declare publicação concluída após confirmação da própria publicação, não por saída de um comando Git ou por existir um novo commit.
- Não há promessa de CI/CD, webhook ou publicação automática neste projeto.

Se uma publicação for autorizada, confirme também o commit/versão que o serviço realmente serve, o HTTP observado e os logs sem expor cookies ou ambiente. O estado publicado atual não foi consultado nesta revisão.

### 7.3 Pós-publicação

Faça, no ambiente correto e sob autorização, verificações de baixo risco:

- liveness em `/api/health`;
- login, `auth.me`, logout e nova leitura da sessão;
- leitura do dashboard com a permissão correspondente;
- mudança de conta somente quando aprovada, confirmando auditoria e invalidação de sessões antigas;
- prévia e commit de importações sem confundir prévia com gravação;
- após importação de Leads, confirmação da resposta do sync, data/cobertura e contagem canônica retornadas.

Não transforme um status 200 de liveness em uma afirmação de readiness ou de integridade do banco.

## 8. Sincronização manual REAL da base de Leads

### 8.1 Origem, credencial e alcance

O procedimento real é a mutation administrativa `leads.syncBase`. O servidor obtém um snapshot do Google Sheets por conta de serviço própria, usando JWT para token e o escopo oficial `spreadsheets.readonly`. A credencial é `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`, somente no servidor, com `client_email` e `private_key`; nunca deve chegar ao navegador, Git, chat, planilha pública ou linha de comando registrada.

O acesso Google deve ser concedido como **Leitor** à conta de serviço. A planilha não deve ser tornada pública. O código chama os endpoints oficiais de metadados e `values:batchGet`; não escreve na planilha e não usa token OAuth de conector da sessão.

A fonte é resolvida pelo registro canônico de fonte no banco, salvo quando `GOOGLE_SHEETS_SPREADSHEET_ID` é fornecido explicitamente. O código valida que o snapshot recebido corresponde à fonte autorizada. Este guia não imprime nem fixa o ID externo da planilha. O identificador interno da fonte é uma relação de banco, não um ID de plataforma ou de planilha a ser exibido.

As abas aceitas pelo código são exatamente: `Site`, `Meta`, `Tiktok - Live`, `Tikok`, `Weebmotors`, `Uol`, `Mercado Livre` e `Interlagos`. `Página10` é excluída. Abas não autorizadas, repetidas, sem cabeçalho válido, sem cabeçalho de data ou com data inválida rejeitam o snapshot antes da gravação.

A identidade física de uma ocorrência é **aba + número da linha**. O ID externo que eventualmente exista em uma célula é apenas campo de proveniência; não deduplica linhas. Duplicidades manuais autorizadas permanecem como ocorrências separadas. Os valores brutos, cabeçalhos, timestamp, modelo, dealer e payload ficam em proveniência privada; APIs públicas do dashboard não selecionam esses payloads.

### 8.2 Transação, idempotência e contagem canônica

O mapper prepara e valida o snapshot completo antes de abrir a transação. Dentro da transação, o serviço:

1. bloqueia a fonte canônica e confirma que o identificador recebido corresponde a ela;
2. calcula o hash SHA-256 canônico do snapshot e serializa somente a representação necessária;
3. se o hash atual for igual ao importado anteriormente, confirma a transação sem escrita de linhas e retorna `changed: false`;
4. se houver mudança, registra o import, faz UPSERT por `(sourceSheet, sourceRow)`, preserva IDs físicos, registra histórico somente para inserções/alterações e atualiza a proveniência atual;
5. calcula a contagem **física persistida** com `COUNT(*)` de `v2_leads`, a data física mais recente e contagens por origem;
6. atualiza a fonte com horário, contagem, erros de data e hash e só então faz `COMMIT`.

Linhas ausentes em uma nova fotografia não são apagadas. Por isso, `totalRows` é a contagem física persistida de `v2_leads`, e não uma promessa de que a planilha recebida contém exatamente esse número de linhas. O total analítico do dashboard é calculado separadamente pelo contador canônico com datas/identidade/ciclo de canais; os dois totais não precisam coincidir. Carga idêntica é no-op e não altera o horário da última importação. Falha de validação, fonte incorreta, credencial ausente ou erro dentro da transação faz rollback e preserva a base anterior.

A resposta dinâmica pode conter `changed`, `importedAt`, `totalRows`, `inserted`, `updated`, `sourceCounts` e `latestLeadDate`. Não grave nenhum desses valores como constante no guia.

**Limite atual de cobertura:** `latestLeadDate` e datas por origem da resposta do sync ainda são físicas. O dashboard anuncia limites físicos e considera disponibilidade diária pelo limite superior, sem aplicar o início da cobertura; a análise administrativa usa `readV2LeadCoverage` do contador canônico. Antes do primeiro histórico ou quando a regra corrige datas, zero/data física não comprova cobertura analítica. Unificar esses limites é uma pendência técnica, não uma correção executada nesta documentação.

### 8.3 Fluxo do popup e versão confirmada

O fluxo operacional da interface administrativa deve ser tratado nesta ordem:

1. abrir o popup de importação e iniciar `leads.syncBase`;
2. aguardar a resposta do servidor; o clique, por si só, não confirma gravação;
3. somente após o commit/no-op confirmado, invalidar as leituras de Leads, modelos e CRM e refazer a consulta do dashboard;
4. comparar `fresh.source.importedAt` e `fresh.source.totalRows` com a versão retornada pelo sync; se não conferir, emitir `LEADS_RELOAD_VERSION_NOT_CONFIRMED`;
5. mostrar no popup o resultado da consulta confirmada e os metadados/alterações da importação, mantendo separados total físico e analítico;
6. concluir sucesso somente após a confirmação. Erro dentro da transação implica rollback; erro de transporte ou da consulta posterior não prova rollback, pois a importação pode já ter sido gravada. Nesses casos, não anunciar sucesso nem reenviar cegamente: verificar a versão observada com leitura segura.

Esse botão não cria cron, não publica o site, não altera contas/metas/projeções/checks e não substitui uma operação de checkpoint/publicação.

## 9. Diagnóstico de publicação antiga, HTTP 503 e OOM

### 9.1 Publicado antigo versus commit novo

Quando uma alteração parece não estar no site, primeiro separe as três versões: commit em `dashboard-v2`, checkpoint confirmado em `main` e versão realmente publicada. Confirme o SHA/versão servido por evidência da publicação e compare com o checkpoint; não conclua que o serviço está novo por causa de um push ou build local. A versão publicada corrente não foi confirmada nesta revisão.

### 9.2 HTTP 503

`/api/health` é liveness e o processo escuta em `0.0.0.0`; o Dockerfile expõe 3000, mas não instala uma readiness probe. Um HTTP 503 pode vir do ingresso, do orquestrador, de uma instância que não iniciou ou de uma versão publicada antiga. Verifique, em sequência controlada, a versão servida, o estado do container/orquestrador, os logs seguros, a porta/`PORT` e a resposta de liveness. Não declare o banco pronto apenas pelo health 200.

### 9.3 OOM e memória do sync

O sync já limita a resposta Google a 32 MiB, lê o corpo por chunks quando `response.body` permite, faz UPSERT/histórico em lotes de 300 linhas e usa hashing canônico incremental. Isso reduz picos, mas não transforma o processamento inteiro em memória constante: o snapshot/JSON validado ainda precisa ser materializado para validação e importação.

`MG_SYNC_DIAGNOSTICS=1` é **opt-in somente para memória**. O código registra amostras de `rss`, heap, memória externa e buffers em fases como preparação do snapshot, leitura de texto Google, parse JSON e leitura do snapshot. Não registra payloads, credenciais, IDs externos ou conteúdo da planilha e não habilita nenhuma operação adicional.

Uma correção importante foi reutilizar `Intl.DateTimeFormat` em [`shared/dashboardDates.ts`](../shared/dashboardDates.ts) e [`server/v2Mapper.ts`](../server/v2Mapper.ts), evitando criar instâncias nativas ICU por timestamp de Lead. A leitura analítica usa streaming/backpressure, e o mapper/hashing reduz cópias de payload. Essas proteções têm perfis de memória diferentes; use as amostras para comparar uma execução controlada, sem prometer duração, throughput ou um tempo fixo de conclusão. Se houver OOM, compare a versão publicada com o checkpoint, reduza o escopo/concorrência conforme a política de infraestrutura e preserve logs sem dados sensíveis antes de alterar código ou banco.

## 10. Pontos de atenção permanentes

- Health é liveness, não readiness.
- Startup do site não faz migração, seed, importação nem sincronização.
- Desenvolvimento e publicação Manus compartilham o banco gerenciado atual; instalações/testes experimentais usam banco separado.
- DDL e mudança de papel exigem backup, aprovação e execução manual, um runner por vez.
- `migrateV2ClientProfiles` exige Administrador ativo validado, registra auditoria e revoga sessões dos clientes convertidos via `sessionVersion`.
- Não use `pnpm db:push` como migração V2.
- Não há conta, senha, administrador, cron, ETL ou CI/CD criados automaticamente pelo startup/código lido.
- Limite de login é em memória e por processo; não substitui rate limit distribuído no ingresso.
- Cookies de sessão exigem HTTPS e `SameSite=None`; revise proteção de origem/CSRF na infraestrutura.
- Banco, segredos, dados, imagens, planilhas e arquivos operacionais não são artefatos de Git/deploy.

## 11. Fontes reais

As referências abaixo são arquivos do código atual usados nesta revisão:

- Scripts e versões: [`package.json`](../package.json), [`pnpm-workspace.yaml`](../pnpm-workspace.yaml), [`pnpm-lock.yaml`](../pnpm-lock.yaml).
- Imagem e processo: [`Dockerfile`](../Dockerfile), [`server/_core/index.ts`](../server/_core/index.ts), [`server/_core/vite.ts`](../server/_core/vite.ts).
- Configuração pública e cookies: [`server/_core/publicConfig.ts`](../server/_core/publicConfig.ts), [`server/_core/cookies.ts`](../server/_core/cookies.ts), [`vite.config.ts`](../vite.config.ts).
- API e acesso: [`server/routers.ts`](../server/routers.ts), [`server/v2Db.ts`](../server/v2Db.ts), [`server/v2Accounts.ts`](../server/v2Accounts.ts), [`server/v2Auth.ts`](../server/v2Auth.ts).
- Banco starter: [`drizzle.config.ts`](../drizzle.config.ts), [`drizzle/schema.ts`](../drizzle/schema.ts), [`drizzle/meta/_journal.json`](../drizzle/meta/_journal.json).
- DDL base: [`drizzle/v2-base.sql`](../drizzle/v2-base.sql), [`drizzle/v2-dispatch.sql`](../drizzle/v2-dispatch.sql), [`drizzle/v2-commercial.sql`](../drizzle/v2-commercial.sql), [`drizzle/v2-accounts.sql`](../drizzle/v2-accounts.sql), [`drizzle/v2-client-profiles.sql`](../drizzle/v2-client-profiles.sql), [`drizzle/v2-retail.sql`](../drizzle/v2-retail.sql).
- Runners: [`server/migrateV2Accounts.ts`](../server/migrateV2Accounts.ts), [`server/migrateV2ClientProfiles.ts`](../server/migrateV2ClientProfiles.ts), [`server/migrateV2Commercial.ts`](../server/migrateV2Commercial.ts), [`server/migrateV2Registration.ts`](../server/migrateV2Registration.ts), [`server/migrateV2Retail.ts`](../server/migrateV2Retail.ts), [`server/migrateV2CommercialLifecycle.ts`](../server/migrateV2CommercialLifecycle.ts), [`server/migrateV2DealerRegistry.ts`](../server/migrateV2DealerRegistry.ts), [`server/migrateV2DispatchDaily.ts`](../server/migrateV2DispatchDaily.ts), [`server/migrateV2SalesGoal.ts`](../server/migrateV2SalesGoal.ts), [`server/migrateV2MediaPlanProjections.ts`](../server/migrateV2MediaPlanProjections.ts), [`server/migrateV2LeadsSync.ts`](../server/migrateV2LeadsSync.ts).
- Sync real de Leads: [`shared/leadsSync.ts`](../shared/leadsSync.ts), [`server/v2LeadsSync.ts`](../server/v2LeadsSync.ts), [`server/v2LeadsSyncMapper.ts`](../server/v2LeadsSyncMapper.ts), [`drizzle/v2-leads-sync.sql`](../drizzle/v2-leads-sync.sql).

### Alertas de fatos ainda não confirmados

1. Não foi confirmado nesta revisão qual SHA está em `dashboard-v2`, qual checkpoint está registrado em `main` ou qual versão/commit está publicado.
2. Não foi confirmado o estado corrente do banco, das migrações, da conta de serviço, do acesso de Leitor, da planilha-base ou das contagens de Leads.
3. Não foi confirmado se existe atualmente HTTP 503, OOM ou uma publicação antiga servindo tráfego; a seção de diagnóstico é preventiva.
4. A suíte de 463 testes em 60 arquivos é evidência anterior; nenhum teste foi executado para esta revisão.
