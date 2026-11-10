# MG Motor Brasil — dashboard

> **Estado documental:** 10/11/2026

Painel comercial para acompanhar Leads, metas, vendas, dealers, regiões, CRM, plano de mídia e controles operacionais da MG Motor Brasil. O sistema separa dados reais, metas, projeções e fontes sem cobertura: ausência de fonte ou de período não é convertida automaticamente em zero.

O código ativo é uma aplicação fullstack em React/TypeScript, Vite, Express, tRPC, MySQL, Tailwind CSS, Recharts e ExcelJS. Os identificadores internos `v2_*` pertencem ao modelo atual de dados e aos seus históricos; não são um convite para reativar o código antigo/V1.

## Repositório, branches e publicação

O repositório canônico confirmado é [privado no GitHub](https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard). A branch `dashboard-v2` é a branch de trabalho; `main` é usada para checkpoints. A publicação automática está desativada (`false`) e a publicação é uma operação separada do salvamento de uma versão.

Este estado não torna o repositório público e não deve ser descrito como uma cópia independente do Manus. Os repositórios antigos, o código V1 e suas branches não são destinos atuais.

## Finalidade e módulos

| Módulo                     | Responsabilidade atual                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview / Leads**       | Visão agregada de Leads, filtros por período e dimensões, metas, vendas, conversão, distribuição e desempenho por dealer.                               |
| **Regiões e modelos**      | Consolidação de UF, região, dealer, modelo e versão; rótulos desconhecidos permanecem identificáveis como não informados.                               |
| **Curva de Leads**         | Curva real acumulada do mês, referência do último mês fechado e média dos três meses anteriores, somente quando a cobertura permite calcular o cenário. |
| **Insights por modelo**    | Mix, matrizes, comparação, qualidade e oportunidades comerciais para o Administrador; não é uma análise disponível ao cliente.                          |
| **Lojas & CRM / Dispatch** | Relatórios por dealer, volume diário, preparação de controle, importação de workbook e validação manual conforme o papel.                               |
| **Plano de mídia**         | Leitura dos planos e projeções; a gravação de projeções é uma operação administrativa restrita.                                                         |
| **Fontes comerciais**      | Prévia e confirmação de metas de Leads, metas de vendas e vendas por dealer a partir de XLSX. Totais gerais permanecem separados das linhas por dealer. |
| **Contas**                 | Listagem, criação, alteração de papel/ativação e redefinição de senha pelo Administrador.                                                               |
| **Exportação**             | CSV do recorte completo aplicado, não apenas da página visível, com apresentação conforme o papel e o idioma.                                           |

Principais fontes do comportamento V2: [`v2LeadsSync`](server/v2LeadsSync.ts), [`v2LeadCounting`](server/v2LeadCounting.ts), [`v2HistoricalLeadPace`](server/v2HistoricalLeadPace.ts), [`v2AdminModelInsights`](server/v2AdminModelInsights.ts), [`v2LeadsExport`](server/v2LeadsExport.ts), [`v2CommercialParser`](server/v2CommercialParser.ts) e [`v2Permissions`](server/v2Permissions.ts).

## Idioma e papéis

A tela de login é sempre em inglês. Depois da autenticação, Administrador e BBRO usam PT-BR; Client e Client Admin usam inglês. O enum atual tem **quatro** papéis:

| Papel no código | Rótulo da interface | Acesso resumido                                                                                                                        |
| --------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`         | Administrador       | Operação administrativa, gestão de contas, imports, metas e insights por modelo conforme as autorizações específicas de cada endpoint. |
| `bbro`          | BBRO                | Leitura dos módulos permitidos em PT-BR e validação do Manual/CRM; não faz gestão de contas nem acessa insights por modelo.            |
| `client`        | Client              | Somente Overview e seu PDF agregado, sem Leads individuais, abas restritas, CSV ou escrita.                                           |
| `client_admin`  | Client Admin        | Todas as leituras permitidas ao perfil cliente, em inglês, sem escrita e sem a análise administrativa por modelo.                      |

`client_admin` pode consultar as áreas de leitura liberadas, incluindo Leads, regiões/CRM, plano de mídia, dispatch e exportação conforme o recorte autorizado. Operações de importação, metas, projeções, contas e validação manual não são liberadas a esse perfil. O cliente comum permanece no Overview agregado; não deve ser tratado como um terceiro papel ou como um Administrador reduzido.

## Guias do projeto

Estes são os quatro guias de entrada. Os links internos são relativos à raiz deste repositório.

| Guia                                             | Conteúdo                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [Arquitetura](docs/ARQUITETURA.md)               | Camadas, componentes, contratos e fluxo de dados.                |
| [Regras de negócio](docs/REGRAS_DE_NEGOCIO.md)   | Períodos, KPIs, metas, dealers, fontes e condições de cálculo.   |
| [Segurança e acesso](docs/SEGURANCA_E_ACESSO.md) | Sessões, papéis, proteção de dados e permissões.                 |
| [Operação e deploy](docs/OPERACAO_E_DEPLOY.md)   | Ambiente, banco, execução, publicação e diagnóstico operacional. |

## Setup local

O ambiente esperado pelo [`Dockerfile`](Dockerfile) e pelo [`package.json`](package.json) é Node.js 22 com pnpm `10.18.0`.

```bash
git clone --branch dashboard-v2 https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard.git
cd mg-motor-brasil-dashboard
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

O `pnpm dev` inicia o servidor fullstack com recarga. O processo usa a porta `3000` por padrão e serve a aplicação web e a API no mesmo processo. O `Dockerfile` também usa Node 22, fixa pnpm `10.18.0`, executa o build dentro da imagem e inicia `dist/index.js` na porta `3000`.

Não há senha padrão, cadastro público, seed de produção ou importação automática descritos por este README. A execução fora do ambiente publicado exige banco, conta ativa e segredos próprios provisionados de forma segura.

### Variáveis de ambiente sem segredos

Copie [`.env.example`](.env.example) para `.env` apenas localmente. O exemplo contém nomes e instruções, não valores operacionais. Nunca versione `.env`, JSON de conta de serviço, chave JWT, DSN ou identificador real de planilha.

| Variável                             | Uso                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                           | Ambiente do processo.                                                                                                                                        |
| `PORT`                               | Porta HTTP; o padrão documentado pelo runtime é `3000`.                                                                                                      |
| `DATABASE_URL`                       | DSN MySQL privada. No Manus atual, desenvolvimento e publicação compartilham o banco gerenciado; novas instalações e experimentos exigem instância separada. |
| `MANUS_PROJECT_ID`                   | Identificador de ambiente/aplicação usado pelo fluxo de sessão.                                                                                              |
| `MANUS_JWT_SECRET`                   | Chave privada para assinatura HS256; deve ser aleatória e mantida fora do Git.                                                                               |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` | Credencial JSON de uma conta de serviço Google própria para a sincronização server-side; nunca usar o JSON real no README ou no repositório.                 |
| `GOOGLE_SHEETS_SPREADSHEET_ID`       | Identificador opcional da fonte de Leads; se vazio, o código procura a fonte autorizada no banco. O valor real não pertence à documentação.                  |

A sincronização Google exige uma conta de serviço com escopo somente leitura e acesso de Leitor à fonte autorizada. Se a configuração não existir, a aplicação deve informar fonte não configurada, não simular uma base vazia.

## Banco customizado e comandos

A aplicação depende de MySQL e de tabelas customizadas `v2_*`, entre elas contas, Leads, imports, snapshots, auditoria, metas, fontes comerciais e dispatch. O módulo [`v2Db`](server/v2Db.ts) obtém a conexão exclusivamente de `DATABASE_URL`.

> **Importante:** `pnpm db:migrate` é apenas o script `drizzle-kit migrate` declarado no `package.json`. Ele não deve ser documentado como um comando único que cria todo o banco V2, uma conta ativa, fontes autorizadas, dados ou imports. `pnpm db:push` também não substitui a preparação customizada da aplicação. Este README não inventa uma sequência de migrations, seed ou importação.

Os comandos declarados no `package.json` são:

| Comando             | Finalidade declarada                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm dev`          | Desenvolvimento fullstack com `tsx watch`.                                                 |
| `pnpm check`        | TypeScript sem emissão (`tsc --noEmit`).                                                   |
| `pnpm test`         | Execução da suíte Vitest em modo `run`.                                                    |
| `pnpm build`        | Build do frontend com Vite e bundle do servidor em `dist/index.js`.                        |
| `pnpm start`        | Execução de `dist/index.js` em produção.                                                   |
| `pnpm format`       | Formatação com Prettier.                                                                   |
| `pnpm db:migrate`   | Execução das migrations conhecidas pelo Drizzle Kit; não provisiona sozinho o V2 completo. |
| `pnpm db:push`      | Geração e aplicação de migrations Drizzle; não usar como substituto da preparação V2.      |
| `pnpm dev:static`   | Servidor Vite estático na porta definida por `PORT` ou `3000`.                             |
| `pnpm build:static` | Build estático com Vite.                                                                   |

Essa lista foi conferida no `package.json`. A revisão documental de 09/11 não executou instalação, migration, importação ou testes funcionais e referenciou a evidência anterior de **463 testes em 60 arquivos**. As verificações posteriores de funcionalidades, incluindo PDF, estão datadas no [CHANGELOG](CHANGELOG.md) e no [TODO](TODO.md); não confundir esses resultados nem o salvamento de código com atualização de fontes ou publicação.

Para uma execução em container, o arquivo atual define o fluxo de build e runtime:

```bash
docker build -t mg-motor-dashboard .
docker run --rm --env-file .env -p 3000:3000 mg-motor-dashboard
```

O startup do container não executa migrations nem imports. O banco deve estar acessível ao processo e preparado conforme a operação do ambiente.

## Fontes, ausências e versões

As fontes são deliberadamente separadas para não misturar um valor geral com uma distribuição por dealer:

- **Leads:** a sincronização server-side lê um snapshot da fonte Google autorizada, valida as abas permitidas, normaliza as linhas e grava em transação. O código compara hashes, atualiza somente ocorrências alteradas e mantém histórico de alterações, ator e proveniência. Uma falha faz rollback e preserva a base anterior.
- **Metas e vendas comerciais:** o parser aceita workbooks XLSX distintos para metas de Leads, metas de vendas e vendas. Para vendas por dealer, prioriza `WEEKLY_RET`, preserva W1–W6 e usa W4 como referência mensal quando preenchida, sem somar snapshots cumulativos. `WEEKLY_REG` é fallback legado de emplacamentos somente quando `WEEKLY_RET` não existe. `DAILY_FUP` fornece separadamente MTD Registration e Retail gerais, sem rateio ou conversão em linhas de dealer.
- **Dispatch/CRM:** o workbook de controle é uma fonte operacional separada, com linhas, células, dias, imports e checks próprios. A validação manual registra o papel autorizado e não deve ser confundida com a fonte bruta de Leads.
- **Banco e metas:** metas manuais ou importadas, estados de importação e auditorias ficam separados da população real de Leads. Nenhum valor corrente é fixado neste documento.

O código diferencia explicitamente:

- fonte não configurada;
- fonte configurada, porém atrasada ou com cobertura parcial do período;
- mês coberto sem Leads positivos;
- valor ausente (`null`/N/D);
- zero real contado na fonte.

A curva histórica usa as linhas reais filtradas pelo dashboard e as referências do último mês e dos três meses anteriores. A estimativa exige cobertura do corte e histórico fechado e positivo suficiente, mas pode existir sem uma meta. A curva planejada e sua comparação com a meta só são aplicadas ao escopo compatível; com filtros dimensionais, a meta global não é aplicada ao recorte. A projeção principal não é substituída por totais de planilha ou por uma curva linear. A data de corte do dashboard não deve ultrapassar ontem (D-1), e o período aceito pelos routers não excede três anos.

A consolidação de modelos usa aliases explícitos do cadastro. Modelo não reconhecido não é inferido por substring e permanece como não identificado. Os insights administrativos calculam mix, matrizes por estado/canal/dealer/campanha, comparação com uma janela anterior, gaps de qualidade e oportunidades; os denominadores acompanham os resultados e registros sem dimensão confiável não são apagados silenciosamente. Esse recurso é exclusivo de `admin`.

A exportação CSV:

- usa exatamente o recorte filtrado completo, ignorando a paginação da tabela;
- pode gerar cabeçalhos PT-BR ou inglês;
- exige fonte de Leads pronta e rejeita recortes acima dos limites definidos no código;
- protege campos textuais contra injeção de fórmulas de planilha;
- no modo cliente, mascara nomes; para perfis não administradores, a apresentação de UF é agrupada.

### Resumo PDF da Overview

Na **Overview**, todos os perfis autenticados (`admin`, `client_admin`, `client` e `bbro`) têm o botão **Gerar PDF / Export PDF**. Com o recorte aplicado e os dados carregados, clique e escolha **Salvar como PDF** na janela nativa de impressão. O modelo usa fundo branco MG, cards com números menores e peso suave, A4 paisagem e o idioma da interface, em **quatro páginas**: capa; Leads com curva acumulada, plano e projeção; gráfico diário por canal; vendas e Top 10/Bottom 10. Não inclui tabela Daily totals nem card Peak daily volume.

O relatório acrescenta **Top 10 e Bottom 10 por conversão** das unidades elegíveis do recorte: usa a taxa comparável já retornada pelo dashboard, inclui venda zero real, exclui fonte indisponível, unidades sem Leads, nomes não conciliados, lojas EM BREVE e grupos sem vendas alocadas. São até 10 por lista, sem inventar unidades ou preencher ausência com zero; listas podem se sobrepor quando há poucas unidades. O snapshot comercial e o período de comparação continuam explicitados, sem confundir conversão executiva com coorte matched.

Cada clique relê `leads.dashboard` com os mesmos filtros e a autorização da sessão e aguarda a renderização correspondente. Valores, metas, projeções, fontes, datas e rankings vêm desse agregado atual; os gráficos são SVGs do mesmo snapshot da tela, sem imagens ou números fixos do PDF de exemplo. A leitura é dos **dados persistidos mais recentes**: exportar não importa arquivos nem sincroniza a planilha Google. A atualização da fonte externa continua sendo uma operação distinta e a data real disponível permanece explícita.

O PDF é preparado localmente e não amplia privilégios. Não exporta Leads individuais/contatos, contas, uploads, nomes privados de arquivos ou notas administrativas. A busca textual aparece apenas como filtro aplicado, não com seu texto. A geração fica bloqueada durante atualização, em falha de leitura ou se filtros/snapshot mudarem durante a preparação; fonte não configurada não oferece um relatório vazio como se fosse dado real. Os rankings são calculados sobre o recorte autorizado completo, independentemente da paginação/ordenação visual da tabela. Não é exportação da base integral CSV e não há upload público nem envio automático do arquivo.

## Segurança e acesso

Todas as operações V2, exceto as rotas públicas de sessão, passam pela leitura de sessão e recebem `Cache-Control: private, no-store`. Os routers aplicam o papel no servidor; esconder uma aba no frontend não é a barreira de autorização.

- Login usa usuário e senha, com sessão assinada; não existe cadastro público no fluxo atual.
- A senha criada pela gestão de contas precisa atender ao mínimo imposto pelo router. Segredos, hashes, cookies, DSNs, JSON de conta de serviço e IDs de fontes nunca entram neste README.
- `admin` é o único papel com gestão de contas, imports comerciais, insights por modelo e demais procedures administrativas gerais. Alguns controles de metas/projeções têm ainda restrição de proprietário no código.
- `bbro` e `admin` são os papéis autorizados a validar o Manual/CRM; `client` e `client_admin` são somente leitura.
- A proveniência privada de Leads, payloads e contatos não é serializada para os clientes. O perfil `client` recebe apenas o Overview agregado; o `client_admin` recebe as leituras liberadas, sem escrita e sem análise por modelo.
- A sincronização Google usa escopo de leitura e operações transacionais. A exportação controla tamanho, quantidade, apresentação e máscara de nomes.
- Em Preview HTTPS embutido, a política de sessão deve manter o cookie com `SameSite=None; Secure`, conforme o contrato do runtime WebDev; HTTP local deve ser tratado separadamente.

## Versão salva não é versão publicada

| Estado                 | Significado                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trabalho**           | Alterações na branch `dashboard-v2`; não são automaticamente um checkpoint nem publicação.                                                                                |
| **Salva / checkpoint** | Versão aceita em `main` e registrada no histórico de versões do projeto. Este README não fixa SHA corrente.                                                               |
| **Publicada**          | Resultado de uma operação de publicação separada. Não é inferida da branch, do build local, do health check ou de um checkpoint. A publicação automática está desativada. |
| **Fonte real**         | Banco e fontes autorizadas configurados no ambiente em execução; nenhum valor atual é copiado para este arquivo.                                                          |
| **Valor ausente**      | Estado explícito de fonte não configurada, cobertura insuficiente ou valor não informado; não significa zero.                                                             |

O startup, o build local e um checkpoint não confirmam que uma versão foi publicada. Verifique o estado de publicação no ambiente responsável antes de afirmar disponibilidade pública.

## Limites conhecidos de instalação e cobertura

A revisão documental identificou duas limitações de implementação, registradas sem alterar o banco ou o runtime:

| Limite                          | Cuidado operacional                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fonte em uma instalação vazia   | O sync exige a fonte interna já configurada. O DDL atual de `v2_sources.importedAt` é `NOT NULL` com timestamp padrão, e o código usa esse campo como indicador de importação. Criar uma linha vazia com o padrão pode fazê-la parecer importada; não criar metadata fictícia ou chamar a preparação de schema de importação concluída. O bootstrap de fonte vazia precisa de evolução explícita e aprovada. |
| Datas físicas versus analíticas | A população é contada com datas canônicas corrigidas. A análise administrativa usa sua cobertura canônica, mas o dashboard/sync ainda anunciam limites físicos e a disponibilidade diária do dashboard não aplica o início da cobertura. Antes do primeiro histórico ou em datas corrigidas, zero/limite físico não comprova cobertura real.                                                                 |

Consulte [Operação e deploy](docs/OPERACAO_E_DEPLOY.md) para essas ressalvas. No projeto Manus atual, desenvolvimento e publicação usam o mesmo banco gerenciado; nunca apontar testes experimentais, DDL ou uma instalação nova para ele. A documentação não afirma que os limites acima foram corrigidos nesta revisão.

## Estrutura de alto nível

```text
client/       Interface React, login, módulos, filtros e projeções de apresentação
server/       Routers tRPC, sessão, permissões, agregações, imports e exportações
shared/       Tipos, papéis, registries, datas e contratos compartilhados
drizzle/      Schemas, SQL e metadados usados pelo Drizzle
docs/         Os quatro guias técnicos e operacionais vinculados acima
```

Para qualquer mudança de comportamento, a fonte de verdade é o código atual do módulo correspondente e seus contratos compartilhados. Este README é um ponto de entrada; não substitui a preparação segura do banco, a gestão de segredos nem a confirmação independente da versão publicada.
