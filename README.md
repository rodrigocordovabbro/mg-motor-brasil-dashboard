# MG Motor Brasil

## Gestão de Leads & Performance

Painel comercial para acompanhar Leads, metas, vendas, distribuição regional, operação de CRM e planejamento de mídia. A interface diferencia informações realizadas, metas, projeções e fontes indisponíveis.

**Stack:** React 19 · TypeScript 5.9 · Vite 7 · Express 4 · tRPC 11 · MySQL · Tailwind CSS 4 · Recharts · ExcelJS.

> **Escopo:** código-fonte e documentação. A cópia GitHub não transfere banco, contas, contatos de Leads, checks salvos, credenciais ou recursos gerenciados pelo Manus. Não há senha padrão ou seed de produção neste repositório.

## Guias

| Documento | Conteúdo |
| --- | --- |
| [Arquitetura](docs/ARQUITETURA.md) | Camadas, componentes, contratos e fluxo de dados |
| [Regras de negócio](docs/REGRAS_DE_NEGOCIO.md) | Períodos, KPIs, metas, dealers e arquivos |
| [Segurança e acesso](docs/SEGURANCA_E_ACESSO.md) | Perfis, sessões e proteção de informações |
| [Operação e deploy](docs/OPERACAO_E_DEPLOY.md) | Ambiente, banco, migrations, execução e diagnóstico |
| [Contribuição](CONTRIBUTING.md) | Fluxo de alterações, testes e revisão |
| [Registro de entregas](CHANGELOG.md) | Resumo da versão exportada |

## Funcionalidades

| Área | Recursos |
| --- | --- |
| Visão Geral | Pacing mensal, metas, vendas, conversão comparativa e distribuição por modelo |
| Regiões | UF, macrorregião e matriz de modelos |
| Lojas & CRM | Grade diária por dealer, volume da base geral e check Manual auditável |
| Leads | Consulta autenticada, busca e filtros de período, origem, modelo, UF e loja |
| Plano de Mídia | Planejamento aprovado e edição mensal de projeções com recálculo de CPL |
| Usuários | Gestão administrativa dos perfis Administrador, Cliente e BBRO |
| Metas comerciais | XLSX único, prévia dos dois totais e confirmação transacional |
| Vendas | FUP separado: WEEKLY_REG por loja e MTD Registration no agregado |

A ação **Atualizar base de Leads** relê o banco já importado. Não há sincronização automática com Google Sheets ou CRM externo.

## Desenvolvimento

Use **Node.js 22**, alinhado ao Dockerfile, e **pnpm 10.18.0**, fixado em `packageManager`. Configure um banco MySQL de desenvolvimento separado da produção.

```bash
git clone --branch dashboard-v2 https://github.com/digocordova83-cyber/v2-mgmotor.git
cd v2-mgmotor
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

No PowerShell, a cópia do exemplo é `Copy-Item .env.example .env`. Os scripts `dev` e `start` usam a sintaxe POSIX de variáveis de ambiente: no Windows, prefira WSL; para execução nativa, defina `$env:NODE_ENV="development"` e rode `pnpm exec tsx watch server/_core/index.ts`.

Preencha `.env` localmente. As variáveis essenciais são `DATABASE_URL`, `MANUS_PROJECT_ID` e `MANUS_JWT_SECRET`; o servidor também utiliza `PORT` e `NODE_ENV`. Nunca faça commit de segredos.

**Antes de usar o login:** provisione as tabelas de aplicação e uma conta ativa de forma segura. Não há cadastro público nem bootstrap de conta executado automaticamente. Leia o [guia de operação](docs/OPERACAO_E_DEPLOY.md) antes de rodar migrations.

```bash
pnpm dev
```

O servidor usa `3000` por padrão e atende frontend e API no mesmo processo. As variáveis privadas são carregadas por `dotenv/config`.

### Verificação

```bash
pnpm check
pnpm test
pnpm build
```

Na revisão funcional de 06/11/2026, **218 testes em 33 arquivos** passaram, junto com TypeScript e build. Esse resultado é uma referência da entrega; alterações futuras precisam de nova validação. Testes com fixtures e mocks não substituem o diagnóstico de uma instalação com banco próprio.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `pnpm dev` | Desenvolvimento fullstack com recarga |
| `pnpm check` | Verificação de tipos, sem emissão |
| `pnpm test` | Suíte Vitest |
| `pnpm build` | Frontend em `dist/public` e servidor em `dist/index.js` |
| `pnpm start` | Execução do build em produção |
| `pnpm format` | Prettier; revisar o diff antes de salvar |
| `pnpm db:migrate` | Migrations do schema Drizzle do template |
| `pnpm db:push` | Gera e aplica migrations Drizzle; não usar indiscriminadamente |

As tabelas customizadas `v2_*` têm SQL e runners próprios. **Os comandos Drizzle não provisionam automaticamente toda a aplicação.** Consulte a ordem e os pré-requisitos no [guia de banco](docs/OPERACAO_E_DEPLOY.md).

## Produção e Docker

```bash
pnpm build
pnpm start
```

Ou use o Dockerfile fornecido:

```bash
docker build -t mg-motor-dashboard .
docker run --rm --env-file .env -p 3000:3000 mg-motor-dashboard
```

O banco precisa ser acessível ao container. Configure HTTPS no ambiente publicado e observe as [regras do cookie de sessão](docs/SEGURANCA_E_ACESSO.md).

`GET /api/health` verifica atendimento HTTP sem autenticação. Sua resposta não comprova conectividade com o banco ou disponibilidade das fontes. O startup não executa migrations nem imports.

## Estrutura

```text
client/                 Interface React, navegação, filtros e componentes
server/                 APIs, autenticação, autorização e regras de negócio
server/_core/           Runtime Express, tRPC, configuração pública e arquivos estáticos
shared/                 Contratos, calendário e conciliação compartilhados
drizzle/                Schemas, SQL e metadados de migrations
patches/                Patches usados pelo lockfile
legacy/                 Código preservado para referência, não a aplicação ativa
docs/                   Documentação técnica e funcional
```

Identificadores internos `v2_*` permanecem por compatibilidade de banco e código. A marca pública é **MG Motor Brasil**: não renomeie tabelas, cookies e escopos de sessão apenas para alterar textos da interface.

## Integridade dos indicadores

O corte padrão é **D-1 em America/Sao_Paulo**. O período geral e a competência mensal do pacing possuem escopos distintos. Metas coletivas não são replicadas ou rateadas automaticamente entre lojas, e zero real não é equivalente a informação indisponível.

Modelos e dealers são conciliados sem reescrever os rótulos originais. Uploads exigem prévia e confirmação; novos dealers são cadastrados na transação da fonte confirmada. Vendas gerais MTD e vendas por loja são referências independentes. Conversão agregada é uma razão comparativa, não prova de atribuição individual.

Consulte [Regras de negócio](docs/REGRAS_DE_NEGOCIO.md) para as fórmulas e condições de cada cálculo.

## Limites da cópia GitHub

A branch `dashboard-v2` guarda a cópia autorizada do código. O projeto WebDev permanece no repositório gerenciado pelo Manus: o envio não troca seu repositório canônico nem publica o site. O repositório antigo e sua `main` não são destinos desta entrega.

Para executar fora do Manus, configure infraestrutura, banco, contas e segredos próprios. `git clone` não cria recursos gerenciados de plataforma.

O `package.json` herdou o campo de licença `MIT`. Esta documentação não altera a titularidade do código nem os direitos da marca MG ou de materiais fornecidos pelo usuário. Confirme as autorizações aplicáveis antes de redistribuir.
