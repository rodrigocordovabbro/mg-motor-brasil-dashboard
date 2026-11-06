# MG Motor Brasil | Gestão de Leads & Performance — Operação e Deploy

> **Escopo:** operação da cópia de código na raiz do repositório, com referências ao código-fonte real. Os nomes `v2_*` são nomes técnicos de tabelas e módulos; não são o título público do produto.
>
> O código mantido aqui é uma cópia somente de código. O projeto canônico permanece no Manus; serviços gerenciados, credenciais, bases e configurações de plataforma não são transferidos por este guia. A publicação pública do código é uma escolha de distribuição e não deve ser confundida com uma autorização para compartilhar segredos ou usar o banco de outro ambiente.

## 1. Arquitetura executável

| Camada | Implementação observada |
|---|---|
| Runtime | Node.js 22 (`node:22-bookworm-slim` no [`Dockerfile`](../Dockerfile)) |
| Gerenciador | pnpm 10.18.0 (`packageManager` e `devDependency` em [`package.json`](../package.json)) |
| HTTP | Express + servidor HTTP nativo em [`server/_core/index.ts`](../server/_core/index.ts) |
| API | tRPC sob `/api/trpc`, com roteador em [`server/routers.ts`](../server/routers.ts) |
| Frontend | Vite + React; desenvolvimento com HMR em [`server/_core/vite.ts`](../server/_core/vite.ts) |
| Banco | MySQL/TiDB compatível via `mysql2`; camada customizada em [`server/v2Db.ts`](../server/v2Db.ts) |
| Build | `vite build` do cliente e bundle esbuild do servidor em `dist/index.js` |
| Conteúdo persistente | Base de Leads, snapshots comerciais, dispatch, contas e overrides/auditorias customizados |

O processo escuta em `0.0.0.0`. O endpoint `GET /api/health` retorna JSON com `status: "ok"`, produto `MG Motor Brasil` e `environment: "homologacao"`. Esse endpoint é uma sonda HTTP de processo; ele não testa banco, tabelas, migrações nem serviços externos. O Dockerfile expõe a porta 3000, mas não declara um `HEALTHCHECK` nativo: o orquestrador deve configurar a chamada HTTP separadamente.

## 2. Variáveis de ambiente e segredos

O entrypoint importa `dotenv/config` em [`server/_core/index.ts`](../server/_core/index.ts), portanto `pnpm dev` e o processo de aplicação carregam `.env` local automaticamente. `.env` e variantes são ignorados pelo Git e pelo Docker; [`../.env.example`](../.env.example) contém somente nomes e orientações, nunca valores para copiar para produção.

| Variável | Obrigatória | Uso real |
|---|---:|---|
| `DATABASE_URL` | Sim para dados v2 e comandos Drizzle | DSN MySQL/TiDB usada por `mysql2` e pelo `drizzle-kit`; não deve ser impressa nem incluída na imagem/documentação |
| `MANUS_PROJECT_ID` | Sim para sessão v2 | Vincula o JWT à aplicação e é comparado na verificação; o identificador é o único valor dessa família permitido na configuração pública |
| `MANUS_JWT_SECRET` | Sim para login/verificação v2 | Chave privada HS256; permanece somente no ambiente do servidor |
| `NODE_ENV` | Sim para seleção explícita de produção | `development` habilita Vite/HMR; qualquer execução de produção deve usar `production` |
| `PORT` | Não | Padrão 3000; o servidor valida intervalo 1–65535; o container define `PORT=3000` |

A whitelist de [`server/_core/publicConfig.ts`](../server/_core/publicConfig.ts) pode enviar ao navegador `MANUS_PROJECT_ID`, URLs públicas da plataforma e `MANUS_API_BROWSER_KEY`. Ela não serializa o ambiente inteiro. `MANUS_JWT_SECRET`, `DATABASE_URL` e chaves de servidor não devem aparecer em HTML, logs, artefatos, tickets ou comandos copiados para chat.

Os runners de migração customizados não importam o entrypoint HTTP; ao executá-los como processos avulsos, assegure que a variável necessária esteja no ambiente do processo. Não presuma que o carregamento de `.env` do servidor ocorreu antes de um `pnpm exec tsx server/migrateV2*.ts`.

## 3. Instalação, validação e execução

Os comandos abaixo são os scripts existentes em [`package.json`](../package.json). Executá-los contra uma instalação local ou ambiente controlado é responsabilidade operacional; nenhum deles foi executado durante a produção desta documentação.

### 3.1 Instalação reprodutível

A partir da raiz do repositório:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
```

O [`Dockerfile`](../Dockerfile) repete essa política com `CI=1 pnpm install --frozen-lockfile` e aplica o patch declarado em [`pnpm-workspace.yaml`](../pnpm-workspace.yaml).

### 3.2 Verificações sem escrita no banco

```bash
pnpm check
pnpm test
```

`pnpm check` executa `tsc --noEmit`. `pnpm test` executa `vitest run` para os testes em `server/**/*.test.ts`, `server/**/*.spec.ts` e `server/**/*.test.tsx`, com ambiente Node conforme [`vitest.config.ts`](../vitest.config.ts). As fixtures de teste são seguras quando executadas isoladas; não aponte `DATABASE_URL` de produção para testes que tenham integração de banco.

`pnpm format` existe, mas reescreve arquivos do projeto inteiro. Não o use como passo automático de deploy sem revisão do diff.

### 3.3 Desenvolvimento com API

```bash
pnpm dev
```

O script define `NODE_ENV=development` e executa `tsx watch server/_core/index.ts`. O Express monta a API, o Vite é acoplado em middleware e o HMR usa o mesmo servidor HTTP. O listener continua em `0.0.0.0`; ajuste `PORT` no ambiente se a máquina tiver outra necessidade.

Há também `pnpm dev:static` e `pnpm build:static`, que são comandos Vite estáticos. O modo estático não substitui o processo Express para as rotas tRPC, autenticação e `/api/health`.

### 3.4 Build e produção

```bash
pnpm build
pnpm start
```

`pnpm build` executa o build Vite e empacota [`server/_core/index.ts`](../server/_core/index.ts) com esbuild em `dist/index.js`. `pnpm start` define `NODE_ENV=production` e executa `node dist/index.js`; o diretório `dist` precisa existir. O servidor serve `dist/public` em produção por [`server/_core/vite.ts`](../server/_core/vite.ts).

O caminho de container é equivalente:

```bash
docker build -t mgmotorsv2:local .
docker run --rm -p 3000:3000 --env-file .env mgmotorsv2:local
```

Use um arquivo de ambiente controlado, nunca coloque valores na linha de comando registrada ou na imagem. O exemplo acima é operacional e não deve ser usado para apontar testes para o banco de produção.

## 4. Health check e exposição de rede

Após iniciar uma instância, o probe HTTP esperado é:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

O ingresso externo deve terminar em HTTPS antes de encaminhar para o processo, porque o cookie da sessão é sempre `Secure` e `SameSite=None` (detalhes em [`docs/SEGURANCA_E_ACESSO.md`](./SEGURANCA_E_ACESSO.md)). A porta interna padrão é 3000 e o listener é `0.0.0.0:3000` no container.

O status 200 do endpoint não comprova que `DATABASE_URL` está acessível. Para uma readiness check real, a infraestrutura deve adicionar verificação controlada e não invasiva de dependências; isso não está implementado no código atual. Não há healthcheck Docker automático no [`Dockerfile`](../Dockerfile).

## 5. Banco: duas camadas que não devem ser confundidas

### 5.1 Starter Drizzle

O [`drizzle.config.ts`](../drizzle.config.ts) aponta o `drizzle-kit` para `drizzle/schema.ts`, dialeto MySQL e a mesma `DATABASE_URL`. O journal atual do Drizzle registra apenas a migração starter `0000_initial_users`; ela cria a tabela `users` descrita em [`drizzle/0000_initial_users.sql`](../drizzle/0000_initial_users.sql).

Os scripts existentes são:

```bash
pnpm db:migrate
pnpm db:push
```

`pnpm db:migrate` chama `drizzle-kit migrate`. `pnpm db:push` chama `drizzle-kit generate && drizzle-kit migrate`. Ambos podem escrever no banco; `db:push` também pode gerar mudança de esquema. Esses comandos pertencem ao esquema Drizzle starter e **não são o procedimento para criar ou evoluir as tabelas técnicas `v2_*`**.

### 5.2 Banco customizado do produto

O login e os dados do produto usam `v2_accounts` e as tabelas customizadas lidas por [`server/v2Db.ts`](../server/v2Db.ts). Não há um comando npm que aplique todos os SQL v2. Os arquivos e runners são intencionalmente explícitos e não são importados pelo startup da aplicação.

A regra operacional é: revisar o SQL, obter aprovação, fazer backup, executar em banco isolado ou janela controlada e validar o resultado. **Não use `pnpm db:push` cegamente para o esquema v2.**

## 6. Banco novo: pré-requisitos e ordem de migração

Esta seção descreve a ordem derivada das dependências reais, especialmente foreign keys e `SHOW COLUMNS`. Ela não é um runner automático; cada etapa é manual, revisável e não foi executada nesta tarefa.

### 6.1 Pré-requisitos da base

1. Disponibilize uma instância MySQL/TiDB vazia e separada de desenvolvimento/homologação/produção.
2. Configure `DATABASE_URL` somente no ambiente do processo autorizado.
3. Se o fluxo starter `users` também for necessário, aplique a migração Drizzle com aprovação:

   ```bash
   pnpm db:migrate
   ```

   Isso não cria contas `v2_accounts`.

4. Em um cliente SQL aprovado, execute integralmente, nesta ordem, os dois DDLs base:

   - [`drizzle/v2-base.sql`](../drizzle/v2-base.sql): cria `v2_accounts`, fontes, Leads, metas de Leads e auditoria de metas.
   - [`drizzle/v2-dispatch.sql`](../drizzle/v2-dispatch.sql): cria relatórios, linhas, células, checks e auditoria de checks; suas foreign keys exigem `v2_accounts`.

   Esses arquivos são SQL para execução controlada, não scripts do `package.json`. Não copie DSN, senha ou token para o comando, editor ou log do cliente SQL.

### 6.2 Runners customizados

Depois de `v2-base.sql` e `v2-dispatch.sql`, execute **um processo por vez**, na ordem abaixo, a partir da raiz do repositório:

```bash
pnpm exec tsx server/migrateV2Accounts.ts
pnpm exec tsx server/migrateV2Commercial.ts
pnpm exec tsx server/migrateV2Registration.ts
pnpm exec tsx server/migrateV2CommercialLifecycle.ts
pnpm exec tsx server/migrateV2DealerRegistry.ts
pnpm exec tsx server/migrateV2DispatchDaily.ts
pnpm exec tsx server/migrateV2SalesGoal.ts
pnpm exec tsx server/migrateV2MediaPlanProjections.ts
```

O motivo e o efeito esperado de cada runner são:

| Ordem | Runner | Dependência/efeito observado |
|---:|---|---|
| 1 | [`server/migrateV2Accounts.ts`](../server/migrateV2Accounts.ts) | Adiciona/ajusta `role`, `sessionVersion`, auditoria e marcadores em `v2_accounts`; pode promover uma conta existente `rodrigo`, mas não cria conta nem senha. A atribuição BBRO é separada e condicionada à conta existente `bbro`. |
| 2 | [`server/migrateV2Commercial.ts`](../server/migrateV2Commercial.ts) | Cria snapshots comerciais que referenciam `v2_accounts` e garante `sourceWeek`. |
| 3 | [`server/migrateV2Registration.ts`](../server/migrateV2Registration.ts) | Adiciona, se ausentes, `registrationMtd` e `registrationAsOf` em `v2_commercial_imports`; por isso vem depois do runner comercial. |
| 4 | [`server/migrateV2CommercialLifecycle.ts`](../server/migrateV2CommercialLifecycle.ts) | Cria estado/auditoria do ciclo comercial e adiciona proveniência às metas; lê `v2_commercial_imports` e `v2_lead_goals`. |
| 5 | [`server/migrateV2DealerRegistry.ts`](../server/migrateV2DealerRegistry.ts) | Cria o registro persistido de dealers descobertos; não importa linhas por conta própria. |
| 6 | [`server/migrateV2DispatchDaily.ts`](../server/migrateV2DispatchDaily.ts) | Exige `v2_dispatch_cells`, torna `volume` anulável, adiciona `sourcePending` e cria `v2_dispatch_imports`. |
| 7 | [`server/migrateV2SalesGoal.ts`](../server/migrateV2SalesGoal.ts) | Cria tabelas de override, auditoria e mutex da meta total de vendas; não semeia valor. |
| 8 | [`server/migrateV2MediaPlanProjections.ts`](../server/migrateV2MediaPlanProjections.ts) | Cria versões, overrides e auditoria de projeções; executa três DDLs independentes e não semeia projeções. |

Os runners são aditivos em sua intenção, mas alguns executam `ALTER TABLE` e o lifecycle pode vincular com segurança dados legados quando os encontra. Por isso o backup e a revisão de ambiente vêm antes da execução. Não existe rollback SQL automático ou um comando único de “migrate all”.

### 6.3 O que não acontece no bootstrap

- O entrypoint não importa nenhum `migrateV2*.ts`.
- Não há seed geral de conta, senha, meta, override, projeção ou import.
- `v2-sales-goal.sql` e `v2-media-projections.sql` criam estruturas vazias; não copiam valores importados.
- Não há ETL, sincronização automática ou importação de planilha no `pnpm start`.
- Importações comerciais e de dispatch são ações autenticadas e administrativas, com prévia/commit conforme [`server/routers.ts`](../server/routers.ts).

## 7. Runbook de deploy

### 7.1 Antes da mudança

1. **Bloqueio obrigatório:** nunca compartilhe o banco gerenciado de desenvolvimento/homologação com produção e nunca use o banco de produção em testes, fixtures, previews ou migrações experimentais. Identifique o ambiente e confirme que o banco é o correto; desenvolvimento, homologação e produção devem usar bancos distintos.
2. Confirme o artefato/commit de código autorizado. A cópia pública não deve conter notas internas, identificadores de fontes, DSNs ou segredos; o código canônico continua no Manus.
3. Valide que `DATABASE_URL`, `MANUS_PROJECT_ID` e `MANUS_JWT_SECRET` foram injetados pelo gerenciador de segredos, sem aparecerem em logs ou argumentos.
4. Faça o backup lógico descrito na seção seguinte.
5. Em ambiente não produtivo, rode `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test` e `pnpm build`.
6. Revise qualquer DDL ou runner necessário. Não execute migração apenas porque o container iniciou.

### 7.2 Publicação

1. Construa uma imagem imutável com o [`Dockerfile`](../Dockerfile). A imagem instala Node 22/pnpm 10.18, copia o código e executa `pnpm build`.
2. Injete as variáveis no runtime, não durante a criação da imagem.
3. Suba o processo com `node dist/index.js` e porta interna 3000.
4. Configure o ingresso HTTPS e o probe `GET /api/health`.
5. Confirme o status HTTP, logs de inicialização e disponibilidade das rotas sem imprimir cabeçalhos de cookie ou valores de ambiente.
6. Faça smoke test com uma conta de teste do ambiente correto. Não suponha que exista um administrador inicial: o startup não cria um.
7. Habilite tráfego gradualmente e monitore erros de banco, autenticação e conflito de versão. Não existe CI/CD ou publicação automática prometida por este repositório.

### 7.3 Pós-publicação

- Verifique que a aplicação está ouvindo em `0.0.0.0:3000` e que o HTTPS chega ao processo.
- Confirme `auth.me` após login, logout e nova leitura da sessão.
- Confirme uma leitura de dashboard e uma rota de baixo risco com a permissão correspondente.
- Para alterações de conta, confirme que o incremento de `sessionVersion` invalida sessões antigas.
- Para projeções, confirme `expectedVersion`, auditoria e preservação do plano importado.
- Para uploads, confirme que a prévia não grava e que apenas o commit autorizado altera snapshots.

## 8. Backup e restauração — procedimento manual

O projeto não implementa serviço de backup, restore ou rollback automático. Use a ferramenta SQL/backup aprovada pela organização e mantenha os valores de conexão fora deste documento.

### 8.1 Backup antes de DDL, deploy sensível ou importação

1. Coloque a aplicação em janela de manutenção ou bloqueie mutações administrativas; registre o horário e o ambiente.
2. Pela ferramenta SQL aprovada, faça um backup lógico consistente da tabela starter `users` quando ela for utilizada e de todas as tabelas `v2_*`, incluindo tabelas de auditoria, estado, locks e snapshots.
3. Trate o arquivo como material sensível: ele pode conter hashes de senha, dados de Leads, snapshots comerciais e auditorias. Criptografe, restrinja acesso e armazene fora do repositório.
4. Registre apenas metadados operacionais não secretos: ambiente, hora, escopo, versão do artefato e identificador/hash do backup. Nunca registre DSN, senha ou token.
5. Valide que o arquivo pode ser lido em uma restauração isolada antes de uma mudança irreversível.

### 8.2 Restauração controlada

1. Interrompa ou coloque em manutenção as escritas da aplicação.
2. Restaure o backup em uma base isolada primeiro. Compare contagens, chaves, tabelas de auditoria e estado dos snapshots.
3. Após aprovação, restaure a base alvo usando a ferramenta SQL/backup, seguindo a política de transação e lock da própria ferramenta.
4. Aponte uma instância controlada para a base restaurada; não altere produção diretamente para “testar”.
5. Execute o probe HTTP, faça leitura autenticada e verifique logs sem dados sensíveis.
6. Se o rollback for aprovado, mantenha o artefato de aplicação compatível com o esquema restaurado. Não existe migração de downgrade automática; a compatibilidade deve ser revisada manualmente.

## 9. Rollback operacional manual

O rollback é uma decisão e execução de operador, não uma feature automática:

1. Pare o tráfego de escrita e capture um backup do estado atual para preservar evidência.
2. Se o problema for de código, volte a uma imagem/artefato previamente validado.
3. Se o problema for de banco, restaure o backup aprovado em base isolada, valide e somente então faça a troca controlada.
4. Refaça o `/api/health`, login, leitura de dashboard e verificações de permissão.
5. Mantenha a aplicação em manutenção até confirmar que o código e o esquema são compatíveis.
6. Reabra escrita manualmente e registre causa, horário, artefato e backup usados.

Não remova tabelas, não execute `db:push` para “corrigir” produção e não apague snapshots/auditorias como forma de rollback. As fontes comerciais são snapshots imutáveis; a remoção de uma fonte usa estado/auditoria, e as versões anteriores devem permanecer preservadas.

## 10. Pontos de atenção conhecidos

- O health check informa sempre `environment: "homologacao"` e não testa a disponibilidade do banco; trate-o como liveness até que a infraestrutura complemente a readiness.
- O [`Dockerfile`](../Dockerfile) não tem instrução `HEALTHCHECK`; a sonda deve ser configurada no orquestrador.
- O limite de login é em memória e por processo; ele não substitui um rate limit distribuído no ingress.
- O cookie exige HTTPS mesmo em desenvolvimento e `SameSite=None` requer revisão de proteção de origem/CSRF.
- A ausência de `DATABASE_URL`, `MANUS_PROJECT_ID` ou `MANUS_JWT_SECRET` pode só aparecer quando uma rota usar o recurso; o processo pode escutar antes disso.
- Não há bootstrap automático de administrador, ETL periódico, importação automática, serviço gerenciado transferido ou pipeline de publicação garantido pelo código lido.

## 11. Referências operacionais

- [Scripts e versões — `package.json`](../package.json)
- [Imagem e processo — `Dockerfile`](../Dockerfile)
- [Entrypoint Express/tRPC — `server/_core/index.ts`](../server/_core/index.ts)
- [Vite, arquivos estáticos e servidor — `server/_core/vite.ts`](../server/_core/vite.ts)
- [Configuração Vite — `vite.config.ts`](../vite.config.ts)
- [Configuração Drizzle — `drizzle.config.ts`](../drizzle.config.ts)
- [Journal starter — `drizzle/meta/_journal.json`](../drizzle/meta/_journal.json)
- [Schema starter — `drizzle/schema.ts`](../drizzle/schema.ts)
- [Banco customizado — `server/v2Db.ts`](../server/v2Db.ts)
- [Roteadores, autorização e uploads — `server/routers.ts`](../server/routers.ts)
- [Base customizada — `drizzle/v2-base.sql`](../drizzle/v2-base.sql)
- [Controle de dispatch — `drizzle/v2-dispatch.sql`](../drizzle/v2-dispatch.sql)
- [Runners customizados — diretório `server/`](../server/)
- [Segurança e matriz de acesso — `docs/SEGURANCA_E_ACESSO.md`](./SEGURANCA_E_ACESSO.md)
