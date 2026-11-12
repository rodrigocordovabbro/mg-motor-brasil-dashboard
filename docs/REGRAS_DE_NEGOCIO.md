# MG Motor Brasil — Regras de negócio

> **Escopo:** Leads, metas, vendas, CRM, plano de mídia, análise administrativa e fontes comerciais da V2.
> **Público:** cliente, operação e desenvolvimento.
> **Estado documental:** comportamento observado no código e nos testes em **09/11/2026**. Números de fixtures, snapshots e exemplos de teste não são valores correntes nem promessa de estado publicado.

Esta é a referência funcional da V2. O comportamento descrito aqui vem dos módulos atuais e dos testes correspondentes; não depende de guias antigos, da implementação V1 ou de repositórios antigos.

## 0. Estado do repositório e da publicação

- **Repositório canônico confirmado:** privado, `https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard`.
- **Branch de trabalho:** `dashboard-v2`.
- **Checkpoints:** usam `main`; checkpoint salvo e publicação são operações separadas.
- **Publicação automática:** desativada (`false`). Uma alteração salva não deve ser descrita como publicada sem confirmação específica da publicação.
- O repositório canônico privado não deve ser confundido com repositório público nem descrito como uma cópia independente do Manus.
- Esta revisão documental não confirma uma versão publicada, uma URL publicada ou valores atuais de produção. A versão salva no repositório, a fonte importada e a versão publicada são estados diferentes.

### Estados que não devem ser misturados

1. **Fonte real:** arquivo autenticado ou fonte estática indicada pelo módulo, com sua competência, data de referência, hash, `importedAt` ou revisão aplicável.
2. **Valor ausente:** `null`, `N/D`, `Indisponível` ou `Aguardando` quando a fonte, a cobertura ou a comparação não está disponível. Ausência não vira zero.
3. **Versão salva:** snapshot importado, revisão comercial, override de projeção ou validação Manual persistidos com a auditoria correspondente.
4. **Versão publicada:** resultado de uma publicação separada. `checkedAt` é apenas o horário em que uma consulta protegida terminou; não é `importedAt`, checkpoint ou publicação.

Fontes de implementação: [`shared/v2Types.ts`](../shared/v2Types.ts), [`server/v2Leads.ts`](../server/v2Leads.ts), [`server/v2LeadsSync.ts`](../server/v2LeadsSync.ts), [`server/v2Commercial.ts`](../server/v2Commercial.ts), [`server/v2Dispatch.ts`](../server/v2Dispatch.ts), [`server/mediaPlans.ts`](../server/mediaPlans.ts) e [`shared/v2MediaPlanProjections.ts`](../shared/v2MediaPlanProjections.ts).

## 1. Princípios de dados

1. **A fonte prevalece.** O label, a linha, a aba e a proveniência recebidos permanecem disponíveis no armazenamento autorizado. Normalização é usada para seleção, reconciliação e agregação; não reescreve a linha bruta.
2. **Ausente não é zero.** Zero só é exibido quando a fonte informou zero ou quando o editor salvou zero como valor válido. Um arquivo sem valor, cobertura atrasada ou campo não localizado permanece indisponível.
3. **Sem aproximação.** Modelo, estado, dealer, grupo, campanha ou alias só são resolvidos por regra explícita. Substring, cidade isolada, UF solta ou nome parecido não criam vínculo.
4. **Prévia não é commit.** Ler um XLSX e gerar a prévia não grava snapshot, dealer adicional, meta ou auditoria. A gravação só ocorre após confirmação autenticada.
5. **Competência e datas são explícitas.** Metas e snapshots comerciais pertencem a `AAAA-MM`; a data de referência comercial é `AAAA-MM-DD` e deve obedecer às regras de competência e D-1.
6. **A população exibida depende do recorte.** Tabelas, gráficos, distribuições, exportações e controles devem informar ou preservar os filtros que originaram a contagem.

## 2. Fontes de Leads e atualização da base

A fonte operacional de Leads é um snapshot autenticado da planilha-base, armazenado no ciclo V2 de fonte e linhas de Leads. Cada ocorrência aceita conserva aba, linha física, data/hora de origem, modelo, versão, canal, campanha, dealer, cidade, estado, CRM e os valores brutos auditáveis.

### 2.1 Atualização administrativa versus atualização de indicadores

O mesmo controle de interface tem dois comportamentos, conforme o papel:

- **Administrador:** **Atualizar base** chama `leads.syncBase` e executa a leitura real da planilha-base no servidor, por conexão Google de leitura configurada para a aplicação. O snapshot é validado, gravado atomicamente e só então os caches analíticos são invalidados. Uma carga idêntica por hash é no-op e preserva `importedAt`.
- **Perfis não administrativos com acesso à área:** **Atualizar indicadores** consulta os dados já armazenados em `v2_leads`, invalida as visões derivadas e refaz a leitura. Esse botão não lê Google Sheets nem importa uma planilha externa.
- Falha de conexão, sessão ou validação preserva a base anterior e não é apresentada como sucesso. Não há agendamento automático de importação nesta aplicação.
- Depois da leitura, a interface separa o horário da consulta (`checkedAt`), a versão importada (`source.importedAt`) e o último dia disponível (`latestLeadDate`). Uma consulta não altera a versão da fonte.

Implementação e fluxo de tela: [`server/routers.ts`](../server/routers.ts), [`server/v2LeadsSync.ts`](../server/v2LeadsSync.ts), [`shared/leadsSync.ts`](../shared/leadsSync.ts), [`shared/leadsReload.ts`](../shared/leadsReload.ts) e [`client/src/components/V2LeadsDashboard.tsx`](../client/src/components/V2LeadsDashboard.tsx).

### 2.2 Abas e linhas físicas

A carga aceita somente as abas atuais listadas em [`shared/leadsSync.ts`](../shared/leadsSync.ts): `Site`, `Meta`, `Tiktok - Live`, `Tikok`, `Weebmotors`, `Uol`, `Mercado Livre` e `Interlagos`. A aba `Página10` é ignorada pelo sincronizador; outra aba não autorizada ou aba repetida rejeita a carga.

A identidade física é `sourceSheet + sourceRow`. O ID da fonte é campo de auditoria, não identidade para deduplicação. O sincronizador faz UPSERT das ocorrências físicas, mantém campos raw e snapshots de histórico, grava somente linhas alteradas e não apaga linhas de canais ausentes em uma carga posterior. O total físico da fonte e os totais por aba são distintos da população analítica usada no dashboard.

### 2.3 Contagem física versus contagem analítica

| Leitura       | Regra atual                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Física**    | Preserva abas, linhas, ordem/identidade física e valores raw aceitos. Hash de entrada, `totalRows`, `sourceRow`, `rowHash` e histórico descrevem o snapshot armazenado.                                                                            |
| **Analítica** | Lê o snapshot completo em páginas ou stream e aplica, em memória, o contador compatível com a regra histórica: data corrigida, validação, ciclo de canais e deduplicação por conteúdo. A seleção por período só ocorre depois dessa transformação. |

A contagem analítica usa [`server/v2LeadCounting.ts`](../server/v2LeadCounting.ts) e [`server/v2Leads.ts`](../server/v2Leads.ts):

- datas são corrigidas como datas de calendário, e não por deslocamento cego de timezone; `Site.data` prevalece sobre o carimbo quando preenchido;
- uma linha com modelo, data ou dealer inválido não entra na população analítica, mas a linha física não é reescrita por esse motivo;
- o `contentHash` usa conteúdo normalizado da ocorrência analítica, incluindo data corrigida e canal aplicável, e não inclui ID, versão ou campanha. Contatos distintos não são deduplicados;
- o conjunto visto permanece entre páginas, para que a ordem canônica produza a mesma primeira ocorrência mesmo em leituras paginadas;
- o ciclo de canais é aplicado antes dos filtros: UOL é considerado até 31/07/2026; TikTok e Interlagos deixam de ser considerados a partir de 01/09/2026; TikTok Live continua sendo canal distinto e ativo segundo sua própria regra;
- o resultado analítico não representa pessoas únicas, não altera a fonte física e não comprova envio ou entrega no CRM.

A regra também preserva o label original do modelo. O cadastro canônico é usado somente em filtros e agregações, por aliases explícitos em [`shared/modelRegistry.ts`](../shared/modelRegistry.ts). Estado, região e dealer seguem a mesma separação entre raw e resolução determinística.

### 2.4 Oportunidades e dados completos na aba Leads — 12/11/2026

Na aba específica **Leads**, cada Lead é tratado como uma **oportunidade**, não como uma pessoa única. A tabela conserva a população analítica e exibe nome completo, e-mail, telefone e carro de interesse, além das dimensões operacionais existentes. Não se cria uma deduplicação adicional por nome, e-mail ou telefone ao abrir a aba.

O enriquecimento ocorre somente depois dos filtros, ordenação e paginação, pelo ID da mesma linha selecionada. Os campos reais vêm dos cabeçalhos/valores da proveniência persistida, por aliases explícitos; não se busca contato de outra ocorrência com nome parecido. Quando o interesse original está ausente, usa-se modelo/versão da própria oportunidade. Campo ausente permanece informado como não disponível; nenhum registro é removido apenas por ter contato incompleto.

Admin, ADM Cliente e BBRO conservam a leitura da aba já autorizada. Cliente restrito continua sem registros individuais. Nome, e-mail e telefone ficam ocultos na tabela em modo apresentação; isso é uma máscara visual de uma sessão autorizada, não uma nova permissão. Filtros, D-1, KPIs e a paginação de 50 linhas não mudam. CSV conserva suas colunas anteriores; PDF da Overview permanece agregado e sem oportunidades individuais/contatos.

## 3. Calendário, D-1, filtros e escopo

O calendário do dashboard usa `America/Sao_Paulo`. O corte operacional é a data-calendário de hoje em São Paulo menos um dia:

```text
cutoffDate = hoje em São Paulo - 1 dia
```

Regras comuns da API e da tela:

- datas devem ser ISO completas (`AAAA-MM-DD`) e válidas;
- `dateFrom` deve ser menor ou igual a `dateTo`;
- `dateTo` não pode ultrapassar D-1;
- o intervalo máximo é de três anos;
- `model`, `channel`, `campaign`, `dealer` e `search` usam o mesmo predicado canônico no dashboard, no controle baseado em Leads, na análise administrativa e no CSV;
- paginação é apresentação da tabela; não reduz a população usada por agregações ou exportação.

Atalhos de Leads usam uma janela inclusiva terminando em D-1. `Mês` vai do primeiro dia do mês de D-1 até D-1. `Mês passado` é o mês civil anterior ao mês de hoje em São Paulo, completo; não é simplesmente o mês de D-1. A remoção de `campaign` de um objeto de filtro, quando necessária a um fluxo específico, preserva os demais filtros e não significa que a dimensão campanha deixou de existir.

Implementação: [`shared/dashboardDates.ts`](../shared/dashboardDates.ts), [`shared/leadPeriodPresets.ts`](../shared/leadPeriodPresets.ts) e validação em [`server/routers.ts`](../server/routers.ts).

## 4. Dashboard de Leads e pacing mensal

Há duas leituras diferentes:

- **Período selecionado:** KPIs, gráficos, distribuições, tabela recente, matriz regional e análise de modelo usam as linhas analíticas dentro de `dateFrom`–`dateTo` e os filtros dimensionais.
- **Pacing MTD:** `current` é o acumulado desde o primeiro dia da competência de `dateTo` até `dateTo`, com os filtros dimensionais aplicados. A meta global só é comparada quando não há filtro de modelo, canal, campanha, dealer ou busca.

O pacing calcula média por dia, projeção linear para os dias do mês, esperado até a data, restante, necessário por dia e status `AHEAD`, `BEHIND`, `ON_TRACK` ou `NO_GOAL`. Em intervalo com mais de uma competência, a comparação mensal fica indisponível. No último dia do mês, `requiredPerDay` é nulo quando não há dias restantes. A meta global não é rateada para subconjuntos.

O código considera `importedAt` ao definir `NOT_CONFIGURED` ou fonte importada. **Limite de instalação:** o DDL atual de `v2_sources` impõe timestamp não nulo com padrão, portanto configurar uma linha vazia pode fazê-la parecer importada. Não criar metadata fictícia nem afirmar que schema/configuração equivalem a importação real; o bootstrap de fonte vazia precisa de evolução aprovada.

O gráfico diário põe `null` após o último dia informado pela fonte, mas ainda não aplica o início da cobertura ao predicado de disponibilidade. Seus limites anunciados vêm de datas físicas, enquanto a população analítica aplica correções de data. A análise administrativa usa `readV2LeadCoverage` canônico. Assim, antes do primeiro histórico ou em datas físicas corrigidas, um zero ou limite do dashboard não comprova cobertura real. Ausência não deve ser interpretada como zero; a unificação desses limites continua pendente no código.

## 5. Leads Plan: histórico, média e projeção principal

O módulo principal de projeção histórica está em [`server/v2HistoricalLeadPace.ts`](../server/v2HistoricalLeadPace.ts), com apresentação em [`client/src/components/V2HistoricalLeadPaceCard.tsx`](../client/src/components/V2HistoricalLeadPaceCard.tsx).

### 5.1 Janelas de referência

Para a competência atual, o módulo calcula duas curvas:

- **Último mês:** curva normalizada do mês civil anterior;
- **Média de 3 meses:** curvas normalizadas dos três meses anteriores, com peso igual por mês.

Cada mês é reamostrado para a quantidade de dias da competência atual por posição normalizada, cobrindo calendários de 28, 29, 30 ou 31 dias sem perder o total mensal. A média é feita sobre a participação acumulada de cada mês, e a última posição da curva é sempre `1`.

### 5.2 Plano, barras e estimativa

- O **Plano acumulado** é `meta × participação histórica acumulada`; por isso termina na meta quando uma meta global válida está aplicada, inclusive quando a meta salva é zero.
- As **barras** representam o realizado acumulado real desde o dia 1 da competência, não uma linha diária disfarçada.
- A **estimativa de fechamento** é ancorada no último realizado confirmado: `realizado até o corte ÷ participação esperada no corte`. A linha estimada começa no ponto real do corte e continua somente a partir dele.
- A estimativa é forecast; não é realização futura, garantia, meta nova nem alteração do plano de mídia.
- Nulos permanecem N/D/—. Zero informado é volume real e permanece zero.

### 5.3 Cobertura, incompletude e filtros

Os cenários retornam `READY`, `NO_HISTORY`, `SOURCE_LAG` ou `NO_SOURCE`. Um mês sem cobertura integral, sem volume positivo ou com fonte ausente não entra silenciosamente na média de três meses. Nesses casos, a curva, o plano comparável ou a projeção podem ficar indisponíveis e o aviso identifica a causa.

A fonte pode estar atrasada em relação ao corte selecionado. Dias fora da cobertura permanecem sem realizado; não se preenche o futuro com zero. O `lastAvailableDate` informa o último dia confirmado usado para as barras.

Quando qualquer filtro dimensional ou de busca está ativo, o escopo é `FILTERED`: o forecast continua visível se o histórico for válido, mas a meta global não é comparada ao subconjunto e o plano global não é fabricado. Sem filtro, o escopo é `GLOBAL` e a meta da competência pode ser aplicada.

## 6. Modelos, estados, regiões e dealers

O cadastro de modelos e estados é explícito. O label raw de cada Lead continua na linha recente; o modelo canônico aparece em opções, agregações e matrizes. Modelo não identificado permanece visível como categoria não identificada, sem ser forçado a um grupo conhecido.

A matriz regional usa somente o recorte filtrado e mantém os registros sem UF ou modelo resolvido nas categorias de identificação correspondente. Percentuais sempre têm denominador explícito e são percentuais dentro da célula, linha ou região indicada; a matriz não comprova integração CRM ou venda.

O catálogo de dealers oficiais conserva unidades e aliases explícitos, inclusive unidades não destinadas ao controle CRM. O controle CRM aplica seu escopo próprio; uma unidade excluída da apresentação CRM não é apagada do cadastro comercial, das opções, da fonte ou do raw. Dealer adicional só é persistido após uma carga comercial confirmada identificá-lo como rótulo completo desconhecido. Prévia, cidade, UF ou substring não registram unidade por conta própria.

Implementação: [`shared/modelRegistry.ts`](../shared/modelRegistry.ts), [`shared/stateRegistry.ts`](../shared/stateRegistry.ts), [`shared/dealerRegistry.ts`](../shared/dealerRegistry.ts) e [`shared/dealerRegistryExtensions.ts`](../shared/dealerRegistryExtensions.ts).

## 7. Metas, vendas e fontes comerciais

As cargas comerciais são separadas por competência e tipo: `lead-goals`, `sales-goals` e `sales`. A prévia mantém rótulo original, valor nulo e avisos; a confirmação cria snapshot imutável e revisão/auditoria. Remoção é soft-remove da revisão ativa esperada; histórico não é apagado nem ressuscitado automaticamente. Reupload intencional pode criar nova revisão ativa.

### 7.1 Metas

- A tabela combinada da rota de metas usa os cabeçalhos exatos `DEALER`, `TOTAL DEALER` e `SALES`; lê somente esses campos. Colunas de modelo, canal, investimento ou outros totais não substituem a fonte declarada.
- `lead-goals` e `sales-goals` também têm parsers próprios. Meta de Vendas exige arquivo próprio; `DAILY_FUP` e `WEEKLY_REG` não são fonte de meta de vendas.
- Uma linha coletiva pode ser vinculada a várias unidades, mas continua coletiva: conserva o label original, fica em `groupedGoals` e não é repetida ou rateada em metas individuais.
- Grupo sem vínculo mantém o valor da fonte em estado não conciliado; a aplicação não reduz nem compensa o total global para esconder a ausência.
- Meta mensal de Leads é salva por competência. Override manual vigente prevalece sobre reimportação; uma importação serve como default quando não há override manual.
- Meta total de vendas é separada e só a conta proprietária `rodrigo` pode editá-la. Ela altera o headline global, não vendas reais por dealer, metas por loja, metas coletivas ou os snapshots de `DAILY_FUP`/`WEEKLY_REG`.

### 7.2 `WEEKLY_REG`: Registration por unidade e semana

A fonte prioritária de vendas por concessionária, conforme pedido de 11/11/2026, é `WEEKLY_REG`, com `CUSTOMER_NAME` e colunas `W1_Reg` a `W6_Reg`, mesmo se `WEEKLY_RET` estiver presente. São emplacamentos/Registration, não Retail. O nome original é preservado; o de-para explícito liga unidades/grupos sem reescrita ou rateio. O grupo `EUROVILLE BH/JF/UB` permanece coletivo (Belo Horizonte, Juiz de Fora e Uberlândia), nunca três cópias da mesma venda.

- `sourceWeek` explícito escolhe a coluna ativa. Sem ele, a semana deriva de `asOf`, limitada a W4 no fechamento; W4 é a referência mensal quando preenchida. W5/W6 podem ser escolhidas explicitamente e continuam preservadas.
- W1–W6 são preservadas em `weeklySales` e mostradas por fonte/loja. O valor ativo é o snapshot escolhido, nunca a soma cumulativa das semanas, `TARGET` ou `DAILY_FUP`. W4 vazia permanece indisponível; não recebe zero, meta ou valor de outra semana.
- Célula vazia permanece `null`; zero informado permanece zero. O total soma somente linhas conhecidas; se nenhuma linha tiver valor conhecido, o total é indisponível.
- `asOf` deve pertencer à competência e não ultrapassar D-1.
- `WEEKLY_RET` é compatibilidade somente quando `WEEKLY_REG` não existe, com colunas `Wn_Retail` e rótulo Retail. Uma REG presente malformada rejeita a carga, sem substituição silenciosa pela RET; a ausência das duas abas rejeita a importação por loja. Importações históricas não são reescritas para a nova métrica.
- Conversão por dealer é `vendas / Leads`; Leads por venda é `Leads / vendas`, com denominadores válidos e corte comparável. Tanto Registration semanal quanto Retail semanal preservado usam seu próprio `asOf`, não a data rotulada do Registration geral de DAILY_FUP. Filtros de modelo/canal/campanha/busca ou várias competências não recebem semanas nem razões de uma fonte global incompatível. Tabela, rankings e PDF identificam a métrica por dealer; a razão global continua Retail/Leads.

### 7.3 `DAILY_FUP`: Retail e Registration separados

O parser procura, nas **linhas 1–8** da aba `DAILY_FUP`, o bloco semântico `Current Month` e seus cabeçalhos. No arquivo de referência dos testes, o cabeçalho `Retail` aparece em `F2` e o valor em `F3`; **F3 é posição daquele arquivo de referência, não coordenada universal**. Em outros arquivos, o parser localiza os cabeçalhos pelo texto dentro do bloco permitido.

- O valor geral de Retail usa somente o cabeçalho simples **`Retail`** no bloco `Current Month`. `Test Drive` e `Direct Sales` não são somados; `MTD Retail`, tabelas posteriores e aliases legados não substituem o campo Retail atual.
- `MTD Registration` é lido separadamente no mesmo bloco. Não é venda por dealer, não é rateado e não é fallback para Retail.
- Retail e Registration podem ter data de referência derivada do nome do arquivo, desde que válida e pertencente à competência. Essa data de snapshot pode diferir do `asOf` D-1 do `WEEKLY_REG`.
- Campo vazio ou bloco ausente resulta em `null` e aviso. Zero real permanece zero; fórmula sem resultado armazenado permanece indisponível.
- O headline global de vendas, quando comparável, usa **Retail MTD**. A conversão executiva global é `Retail / Leads do recorte global`; não usa `MTD Registration` como fallback e não é conversão de coorte.
- A comparação global exige competência compatível, período desde o primeiro dia até `asOf`, ausência de filtro de modelo/canal/campanha/busca e cobertura de referência compatível. Quando a guarda falha, vendas e conversão globais ficam N/D/`null`.
- As linhas por dealer continuam baseadas no snapshot semanal ligado por mapping/alias explícito. Dealer sem Leads mantém conversão nula; vendas zero podem produzir taxa zero somente quando a base de Leads é positiva.

Fontes: [`server/v2CommercialParser.ts`](../server/v2CommercialParser.ts), [`shared/v2Commercial.ts`](../shared/v2Commercial.ts), [`server/v2Commercial.ts`](../server/v2Commercial.ts) e [`client/src/components/V2CommercialSummary.tsx`](../client/src/components/V2CommercialSummary.tsx).

## 8. Plano de mídia e projeções salvas

O plano aprovado é a fonte estática mensal em [`server/mediaPlans.ts`](../server/mediaPlans.ts). Projeções são overrides esparsos persistidos separadamente e aplicados em memória sem mutar a fonte aprovada:

- `globalLeads` altera somente o headline global e o CPL global;
- `products` altera o total de um produto;
- `rows` altera uma linha aprovada que já possui previsão;
- `null` remove o override e restaura o valor aprovado.

Override de produto prevalece sobre edições de linhas daquele produto, mas não reescreve as linhas da fonte. Quando todos os produtos têm Leads conhecidos, o total pode ser reconciliado pela soma; quando a fonte não permite reconciliação, o total global aprovado é preservado e não há rateio inventado. CPL usa investimento líquido dividido por Leads projetados positivos. Orçamento bruto, comissão, investimento líquido, realizado e Leads reais não são alterados por override.

Cada salvamento exige a conta proprietária, versão esperada e transação. Conflito de versão não sobrescreve a edição concorrente. Quando o headline é manual, a UI deve deixar claro: **“Total manual; projeções detalhadas mantidas”**.

## 9. Análise administrativa por modelo

A rota de análise por modelo é exclusiva do papel `admin`, usa a população integral filtrada antes da paginação e preserva denominadores. Ela calcula mix de modelos, matrizes por estado/canal/dealer/campanha, série diária, comparação com janela anterior de mesmo número de dias e gaps de qualidade.

As oportunidades são **heurísticas descritivas de cruzamento e gap de mix**, não diagnóstico financeiro:

- só entram dimensões e categorias identificadas;
- a categoria precisa atingir a amostra mínima configurada de 30 Leads;
- o gap precisa atingir pelo menos 5 pontos percentuais em relação à participação do modelo no mesmo recorte;
- a lista de oportunidades pode ser limitada, mas as matrizes não são truncadas;
- registros sem modelo, UF, dealer ou campanha continuam nos totais e aparecem como gaps de qualidade, porém não entram em oportunidade comercial.

A análise não calcula prejuízo, margem, retorno, conversão ou perda de vendas por modelo. `estimatedVolumeDifference` é apenas diferença estimada de volume do mix observado contra o benchmark do recorte; não é venda perdida nem previsão comercial. Também não há conversão por modelo sem uma fonte de vendas compatível.

Implementação: [`server/v2AdminModelInsights.ts`](../server/v2AdminModelInsights.ts) e [`shared/adminModelInsights.ts`](../shared/adminModelInsights.ts).

## 10. Controle CRM, FUP e Manual

O controle de Leads usa a mesma população analítica, filtros e data de criação do dashboard. A planilha `Envios` é fotografia de layout, integrações e valores manuais; ela não alimenta o `Vol. Lead`. O `Vol. Lead` é a quantidade de registros da base de Leads por dealer e dia, dentro do escopo aplicado.

- `SYONET`, integrações cadastradas e dados de origem são referências de leitura; não comprovam entrega diária.
- Somente a coluna **Manual** registra a conferência operacional. A aplicação não dispara envio, não altera SYONET e não executa operação CRM.
- O escopo BBRO aceita somente unidades do cadastro CRM e datas encerradas até D-1; não cria unidade automaticamente.
- Preparação é idempotente e preserva checks já existentes.
- Filtros do controle incluem período D-1, busca, integração e estado do Manual. Totais no rodapé representam somente lojas exibidas.

### 10.1 Origem do Manual e validação auditada

O estado efetivo não atribui todo `OK` a Wini:

- `sourceManual = "OK"` sem validação atual é **origem Arquivo**. O estado pode aparecer como `Check`, sem inventar auditoria ou responsável Wini; histórico auditado anterior é preservado.
- Uma validação persistida cuja data seja igual ou posterior à importação do Manual prevalece sobre o arquivo, inclusive para desmarcar um `OK`. Ela tem versão, conta autenticada, horário, auditoria e o label lógico de revisor definido pelo fluxo.
- Se a validação auditada for anterior à nova importação, ela é considerada obsoleta para o estado efetivo; o valor do arquivo volta a ser a origem aplicável, sem apagar o histórico.
- A célula apresenta **`Check`** ou **`--`**. A cor verde indica Check efetivo, seja de origem Arquivo atual, seja de validação auditada atual. `SYONET = OK` sozinho nunca cria Check.
- A célula de volume fica em estado de indisponibilidade quando o volume é nulo, mesmo que o Manual esteja marcado. Zero conhecido continua sendo exibido como zero.
- Gravações usam controle otimista de versão. Versão divergente exige atualizar a tela antes de confirmar novamente.

Implementação: [`shared/v2Dispatch.ts`](../shared/v2Dispatch.ts), [`server/v2Dispatch.ts`](../server/v2Dispatch.ts) e [`client/src/components/V2DispatchControl.tsx`](../client/src/components/V2DispatchControl.tsx).

## 11. Exportação CSV

A rota de CSV usa o mesmo período, D-1, filtros dimensionais, busca, cadastro de dealers e ordem do dashboard. Ela ignora `page` e exporta a população filtrada completa, sem truncar silenciosamente.

- Headers pt-BR: `Data`, `Hora`, `Lead`, `Modelo`, `Versão`, `Canal`, `Campanha`, `Concessionária`, `Cidade`, `UF`, `CRM`.
- O arquivo usa BOM UTF-8, CRLF, escaping de campos e proteção contra fórmulas. Campos raw de modelo e dealer continuam raw no CSV.
- O limite é de 100.000 linhas e 16 MiB; acima disso a exportação falha e pede um recorte menor.
- `admin` exporta com nomes e UF sem a projeção agrupada.
- `client_admin` e `bbro` podem exportar com a projeção de perfil não administrativo: nomes podem ser mascarados quando `clientMode` está ativo e a UF é agrupada para apresentação.
- `client` é o perfil de visão geral e não pode acessar a exportação.

Implementação: [`server/v2LeadsExport.ts`](../server/v2LeadsExport.ts) e rota protegida em [`server/routers.ts`](../server/routers.ts).

## 12. Papéis atuais e permissões

Há quatro papéis atuais, definidos em [`shared/accountRoles.ts`](../shared/accountRoles.ts):

| Papel                          | Leitura                                                                 | Escrita e limites                                                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin` — Administrador        | Dados operacionais, técnicos, CRM, Leads, plano e análise por modelo    | Importação/sincronização, metas, cargas comerciais, preparação e administração. Projeções e meta total de vendas são exclusivas da conta `rodrigo`. |
| `client` — Cliente             | Visão Geral                                                             | Sem acesso às áreas operacionais, exportação, análise restrita ou mutações. Papel desconhecido é normalizado para este perfil restrito.             |
| `client_admin` — ADM - Cliente | Visão Geral, Regiões, Leads, Plano, Lojas & CRM e exportação em leitura | Não administra contas, não importa fontes, não edita metas/projeções/comercial e não grava Manual.                                                  |
| `bbro` — BBRO                  | Visão Geral, Regiões, Leads, Plano, Lojas & CRM e exportação em leitura | Pode marcar/desmarcar Manual, consultar histórico e preparar o controle dentro do escopo CRM/D-1; não possui gestão administrativa.                 |

O Administrador e o BBRO podem validar CRM; `client` e `client_admin` não podem. A análise administrativa por modelo, a sincronização Google, as cargas comerciais, a gestão de contas e as metas administrativas permanecem protegidas por `admin`.

## 13. Ciclo de vida, auditoria e ausência de números fixos

- **Leads — prévia:** snapshot recebido é validado antes da transação; nenhum dado analítico é inferido de uma prévia parcial.
- **Leads — commit:** importação atômica grava apenas inserções/alterações físicas necessárias, atualiza a versão da fonte e invalida caches derivadas após confirmação.
- **Comercial — commit:** parser, mapping explícito, registro de dealer desconhecido e snapshot de meta/venda ocorrem na transação. Hash e competência permitem idempotência.
- **Histórico:** snapshots comerciais e auditorias de Manual/projeção são preservados; remoção não apaga a fonte histórica.
- **Atualização:** consulta, cobertura, importação, versão salva e publicação são mensagens/estados independentes.
- **Valores correntes:** este arquivo não fixa totais de Leads, vendas, metas, Retail, Registration, tráfego, conversão ou projeção. Esses valores devem ser lidos da API autenticada e da competência selecionada.

## 14. Evidência anterior de testes

A última suíte funcional aprovada, informada como evidência anterior, contém **463 testes em 60 arquivos**. Esse resultado não foi executado nesta revisão documental. Os testes lidos para atualizar este arquivo cobrem, entre outros pontos, contador físico/analítico e deduplicação ([`server/v2LeadCounting.test.ts`](../server/v2LeadCounting.test.ts)), sincronização ([`server/v2LeadsSync.test.ts`](../server/v2LeadsSync.test.ts)), Retail/Registration/WEEKLY_REG ([`server/v2RegistrationParser.test.ts`](../server/v2RegistrationParser.test.ts)), conversão ([`server/v2GeneralConversion.test.ts`](../server/v2GeneralConversion.test.ts)), projeção histórica ([`server/v2HistoricalLeadPace.test.ts`](../server/v2HistoricalLeadPace.test.ts)), CSV ([`server/v2LeadsExport.test.ts`](../server/v2LeadsExport.test.ts)), análise administrativa ([`server/v2AdminModelInsights.test.ts`](../server/v2AdminModelInsights.test.ts)) e Manual ([`server/v2DispatchUi.test.ts`](../server/v2DispatchUi.test.ts)).

Nenhum teste real, importação, migration, navegador, publicação ou consulta autenticada foi executado durante esta revisão documental.
