# MG Motor Brasil — Regras de negócio

> **Escopo:** Leads, metas, vendas, CRM, plano de mídia e fontes comerciais da V2.
> **Público:** cliente, operação e desenvolvedor.
> **Estado documentado:** comportamento observado no código e nos testes em **06/11/2026**. Números de fixtures e snapshots não são promessa de estado futuro nem substituem uma consulta autenticada à base.

Esta documentação descreve o contrato funcional da V2. A fonte de Leads é a carga autenticada armazenada em `v2_leads`; registros comerciais, metas e projeções possuem ciclos de vida separados. A interface não deve preencher ausências com números de apresentação.

## 1. Princípios de dados

1. **A fonte prevalece.** O valor original de cada linha de Lead permanece disponível; normalização serve para filtro e agregação, não para reescrever a linha.
2. **Ausente não é zero.** `null`, “Indisponível”, “N/D” e “Aguardando” significam que a fonte ou a comparação não está disponível. Zero só é exibido quando a fonte informou zero ou o editor salvou zero como valor válido.
3. **Sem atribuição por aproximação.** A aplicação não atribui um grupo, cidade, UF, campanha, modelo ou nome parecido a uma unidade quando não há alias/de-para explícito.
4. **Prévia não é importação.** Ler um XLSX no navegador e chamar `preview` não grava fonte, meta, registro de dealer ou auditoria. A gravação acontece somente após confirmação autenticada.
5. **Competência é explícita.** Metas e snapshots são identificados por `AAAA-MM`; a data de referência de vendas é `AAAA-MM-DD` e deve pertencer à competência.

Fontes de implementação: [`shared/modelRegistry.ts`](../shared/modelRegistry.ts), [`shared/stateRegistry.ts`](../shared/stateRegistry.ts), [`shared/dealerRegistry.ts`](../shared/dealerRegistry.ts), [`shared/dealerRegistryExtensions.ts`](../shared/dealerRegistryExtensions.ts), [`server/v2Leads.ts`](../server/v2Leads.ts) e [`server/v2Commercial.ts`](../server/v2Commercial.ts).

## 2. Calendário, D-1 e períodos

### 2.1 Fuso e limite D-1

O calendário do dashboard usa `America/Sao_Paulo`, não a virada UTC. O corte operacional é:

```text
cutoffDate = data-calendário de hoje em São Paulo - 1 dia
```

Regras do período:

- datas devem ser ISO completas (`AAAA-MM-DD`) e calendários inválidos são rejeitados;
- `dateFrom` deve ser menor ou igual a `dateTo`;
- `dateFrom` não pode ser futuro em relação ao corte;
- `dateTo` é limitado a D-1;
- a API aceita no máximo três anos de intervalo;
- filtros de tela usam o mesmo predicado do dashboard e do controle de Leads.

Exemplo observado nos testes: na virada de `2026-07-22T03:00:00Z`, o dia em São Paulo passa a ser `2026-07-22` e o corte passa a `2026-07-21`. Um `dateTo` posterior é limitado a `2026-07-21`.

Implementação: [`shared/dashboardDates.ts`](../shared/dashboardDates.ts), [`shared/leadPeriodPresets.ts`](../shared/leadPeriodPresets.ts) e validação de filtros em [`server/routers.ts`](../server/routers.ts).

### 2.2 Atalhos

| Atalho | Intervalo resultante |
|---|---|
| `7 dias`, `14 dias`, `30 dias`, `60 dias` | janela inclusiva terminando em D-1 |
| `Mês` | primeiro dia do mês de D-1 até D-1 |
| `Mês passado` | mês civil anterior ao mês de **hoje em São Paulo**, completo |

`Mês passado` não é calculado simplesmente como “mês de D-1”. O código deriva `hoje = cutoff + 1 dia` e então obtém o mês civil anterior. Portanto, para um corte `2026-11-04`, o resultado é `2026-10-01` a `2026-10-31`; no primeiro dia de um mês, o mês anterior continua sendo o mês civil anterior completo. Viradas de ano e fevereiro bissexto são cobertas por teste.

`omitLeadCampaign` remove somente a propriedade `campaign` do objeto de filtros quando um fluxo precisa consultar sem campanha; preserva datas, modelo, canal, dealer, busca e paginação. Isso não altera os Leads nem significa que todo dashboard deva ignorar a dimensão: o filtro de campanha existe na API e na tela quando selecionado.

### 2.3 Período selecionado versus pacing mensal

São duas leituras diferentes:

- **Métricas, gráficos, distribuições, tabela recente e matriz regional:** usam exatamente as linhas dentro de `dateFrom`–`dateTo` e os filtros dimensionais.
- **Pacing:** calcula `current` com o acumulado MTD da competência de `dateTo`, do primeiro dia do mês até `dateTo`, ainda respeitando os filtros dimensionais para a contagem, mas somente compara com a meta global quando nenhum filtro de modelo, canal, campanha, dealer ou busca está ativo.

O pacing informa média/dia, projeção linear para os dias do mês, esperado até D-1, restante, necessário/dia e status `AHEAD`, `BEHIND`, `ON_TRACK` ou `NO_GOAL`. Com período de mais de uma competência, o pace diário fica indisponível para evitar comparação mensal enganosa. No fim do mês, `requiredPerDay` é `null` quando não há dias restantes.

A meta mensal global nunca é rateada nem comparada a um subconjunto. Remover filtros habilita a leitura global; não altera a contagem real.

## 3. Leads e origem dos números

A fonte V2 é a planilha autenticada carregada em `v2_sources`/`v2_leads`. Cada linha preserva data, hora, nome, modelo, versão, canal, campanha, dealer, cidade, estado e campo CRM. A leitura do dashboard faz consulta por data em `v2_leads`.

O botão administrativo **Atualizar base de Leads** importa a planilha-base pelo servidor com conta de serviço Google própria e somente leitura; valida todas as abas de canais e aplica a carga atomicamente antes de invalidar os caches. Uma carga idêntica não recria registros nem muda o timestamp. Ocorrências manuais não são deduplicadas por ID. Sem credencial/acesso ele informa pendência/falha e preserva o banco. Cliente/BBRO têm apenas **Atualizar indicadores**, que relê a base armazenada. Não há agendamento automático de importação nesta aplicação.

Quando a fonte não está configurada:

- o status é `NOT_CONFIGURED`;
- totais e volumes derivados ficam indisponíveis (`null`), não zero;
- a interface informa que aguarda importação autenticada;
- o controle de Leads não usa a planilha histórica de Envios como substituto da base de Leads.

## 4. Modelos, estados e regiões

### 4.1 Modelos oficiais

Existem exatamente cinco grupos canônicos:

1. `MG 4`
2. `MG Urban`
3. `MG S5`
4. `MG Cyberster`
5. `IM 6`

Aliases registrados — inclusive `MG4`, `4`, `XPOWER`, `MG4Urban`, `S5`, `MGS5`, `Cyberster`, `IM6` e formulários conhecidos de Urban — são resolvidos por igualdade após normalização de acentos e pontuação. Não há inferência por substring: `MG4 e MG S5` e `MG4Urbanizado` continuam não identificados.

O label raw do Lead nunca é substituído. A consolidação canônica aparece em filtros, contagens, opções e agregações; a tabela recente conserva o modelo recebido.

### 4.2 Estados e regiões

O cadastro possui as 27 UFs brasileiras e cinco regiões (`Norte`, `Nordeste`, `Centro-Oeste`, `Sudeste`, `Sul`). Sigla, nome e aliases explícitos como `BR-SP` e `S.PAULO` podem resolver para uma UF. Cidade, dealer, e-mail, URL ou campo com múltiplos estados não são usados para inventar o estado.

Uma linha sem estado resolvido fica em `Estado não identificado` e `Região não identificada`. A matriz regional:

- usa somente as linhas já filtradas do dashboard;
- apresenta contagens por modelo e percentual dentro da linha da região/UF;
- inclui modelo não identificado quando necessário;
- mantém total de estados, regiões e células igual ao total de linhas do recorte, sem perder registros.

A matriz é uma leitura de Leads; não comprova entrega ou integração CRM.

## 5. Cadastro de concessionárias

### 5.1 Cadastro oficial e escopo CRM

`OFFICIAL_DEALERS` tem **41 unidades distintas**, incluindo `Sinal Av. Indianópolis`. O escopo `CRM_DEALERS` tem **40 unidades** e exclui somente Indianópolis. Essa exclusão é de apresentação/controle CRM; não remove Indianópolis do cadastro comercial, das opções gerais, da fonte nem dos dados raw.

Unidades marcadas `(EM BREVE)` permanecem no cadastro oficial e podem aparecer em opções/registro. A tabela comercial pode ocultá-las por apresentação, sem mutar o catálogo.

Os aliases são explícitos. Um nome genérico de grupo, cidade isolada ou rótulo ambíguo não escolhe uma unidade. Exemplos: `JAVEP BAURU`, `La Fontaine Joinville`, `Bastazini Manaus` e `São Caetano` não resolvem sozinhos quando o cadastro exige distinção.

### 5.2 Registro dinâmico

Uma unidade adicional só entra no registro persistido quando uma carga comercial confirmada a identifica como nome completo desconhecido e sem mapping explícito. A prévia pode sinalizar `isNewDealer`/`newDealers`, mas não grava nada.

Cada extra mantém:

- label/nome original, inclusive espaços recebidos;
- chave normalizada apenas para deduplicação;
- UF validada ou `null`;
- `sourceImportId`;
- conta, username e timestamp de criação.

O registro combinado lista primeiro as 41 oficiais e depois os extras persistidos. A resolução aceita somente alias oficial exato ou extra persistido exato; não usa substring, cidade, UF solta ou nome-base para criar unidade. Rótulos coletivos e siglas desconhecidas ficam pendentes para revisão.

## 6. Metas combinadas, metas mensais e vendas

### 6.1 Arquivo oficial combinado

O upload combinado exige, na mesma tabela, os cabeçalhos exatos `DEALER`, `TOTAL DEALER` e `SALES`. O parser lê somente:

- `DEALER`: label original da fonte;
- `TOTAL DEALER`: meta de Leads por linha;
- `SALES`: meta de vendas por linha.

Colunas `MODEL`, canal, pesos, investimentos, `TARGET`, `currentGoal` ou qualquer outra coluna não são fonte dessa importação. `null` permanece diferente de zero. A linha de total é reconhecida, e totais explícitos prevalecem sobre soma quando presentes.

No modelo de arquivo observado nos testes de novembro de 2026, a prévia contém **31 linhas**, `TOTAL DEALER` totaliza **10.579 Leads** e `SALES` totaliza **591 vendas**. Esses valores são totais do arquivo de metas, não Leads reais, vendas reais ou uma meta global persistida automaticamente.

A confirmação grava `lead-goals` e `sales-goals` na mesma transação. Se uma das duas gravações falhar, ambas e eventuais extras de dealer são revertidos.

### 6.2 Mapping, grupos e aliases

Mapping explícito é a autoridade do operador. Uma linha coletiva pode apontar para mais de uma unidade, mas continua sendo um registro coletivo:

- aparece com o label original;
- não é somada repetidamente por alias;
- não é rateada entre lojas;
- não inventa meta individual;
- mantém o valor de grupo em `groupedGoals`.

Uma linha sem vínculo preserva o total da fonte e é apresentada como não conciliada. O total global não muda para compensar a ausência.

### 6.3 Meta global de Leads

A meta é salva por competência em `v2_lead_goals`, com auditoria. O editor aceita inteiro positivo de 1 a 10.000.000. Uma meta importada é apenas o default de uma carga quando não há override manual vigente; salvar manualmente marca a competência como manual e o valor manual não é substituído por reimportação nem removido junto com uma fonte importada.

`16.600 Leads` aparece em fixtures e exemplos de meta manual. Não é default universal nem afirmação de meta atual: só deve ser tratado como vigente quando retornado para a competência pela API autenticada.

### 6.4 WEEKLY_REG: snapshot de vendas por dealer

Vendas por unidade vêm exclusivamente da aba `WEEKLY_REG`, com `CUSTOMER_NAME` e uma coluna selecionada entre `W1_Reg`, `W2_Reg`, `W3_Reg`, `W4_Reg`, `W5_Reg` e `W6_Reg`.

Regras:

- uma única coluna W1–W6 é selecionada;
- o snapshot selecionado não é soma de semanas;
- `TARGET`, `DAILY_FUP`, uma aba genérica de vendas ou outra coluna não substituem `Wn_Reg`;
- valor vazio é `null`; zeros reais são preservados;
- o total do snapshot soma apenas valores conhecidos;
- `asOf` deve estar na competência e ser no máximo D-1;
- sem `sourceWeek`, a semana é inferida pelo dia de `asOf` e limitada a W6.

A carga rejeita uma planilha sem `WEEKLY_REG`, ainda que ela contenha `DAILY_FUP` ou uma aba genérica `Sales`.

### 6.5 DAILY_FUP e MTD Registration

A aba `DAILY_FUP` tem função específica: o parser procura nas linhas 1–8 o bloco `Current Month` + `MTD Registration`. Esse valor é exposto como `generalRegistrationMTD`/`MTD Registration`, junto com a data derivada do nome do arquivo quando válida.

O valor geral:

- não é inserido como venda de qualquer dealer;
- não é rateado entre lojas;
- não substitui a coluna `Wn_Reg`;
- não usa tabelas posteriores da aba;
- pode ter data de referência do arquivo diferente do `asOf` D-1 do snapshot semanal;
- não cria fallback numérico quando o bloco está ausente.

No fixture de parser, `MTD Registration = 43` e `MTD Retail = 40`/outros campos aparecem para demonstrar a separação; esses valores não são números correntes garantidos.

### 6.6 Conversão e guardas de escopo

A comparação executiva global usa, quando compatível:

```text
conversão global (%) = MTD Registration / Leads do recorte global × 100
```

Não é uma conversão de coorte, não prova que os mesmos Leads viraram vendas e não distribui o MTD entre dealers. Para exibir vendas/conversão global, o recorte precisa ser global, de uma competência, sem modelo, canal, campanha, dealer ou busca que torne a comparação não equivalente. Quando a guarda falha, vendas e conversão globais ficam `null`/indisponíveis.

No nível de dealer, só são usados valores da linha `Wn_Reg` ligados por mapping explícito ou alias oficial. Uma venda não é atribuída por cidade, substring ou grupo genérico. Dealer sem Leads mantém taxa `null`; zero de vendas pode produzir taxa zero quando a base de Leads é positiva.

### 6.7 Meta total de vendas manual

A meta total de vendas é uma tabela separada, por competência, com auditoria. Só o administrador **Rodrigo** pode editar esse total; o valor manual substitui somente o headline global. Não altera vendas reais semanais, metas por loja, metas coletivas ou `MTD Registration`.

`660 vendas` aparece em fixture de override manual. É exemplo de preferência/override persistido em um teste, não número corrente a ser embutido nesta documentação.

## 7. Plano de mídia e projeções

O plano aprovado é fonte estática mensal (`server/mediaPlans.ts`) para as competências disponíveis. Projeções manuais são overrides esparsos separados:

- `globalLeads`: altera apenas headline global e CPL global;
- `products`: altera total de um produto;
- `rows`: altera uma linha aprovada que já possua Leads projetados;
- `null` remove o override e restaura a fonte aprovada.

Zero é um valor válido. Override de produto prevalece no total do produto sobre edições de linhas, mas não reescreve linhas. O total global soma produtos conhecidos quando a reconciliação é completa; se a fonte não permite reconciliação, preserva o forecast global aprovado em vez de fabricar rateio.

CPL projetado é `investimento líquido / Leads projetados` quando Leads > 0. Nenhum override altera orçamento bruto, comissão, investimento líquido, investimento realizado ou Leads reais de `v2_leads`.

A edição exige conta admin `rodrigo`, versão esperada e transação. Versão divergente retorna conflito; cada salvamento grava auditoria antiga/nova. A tela mostra explicitamente “Total manual; projeções detalhadas mantidas”.

## 8. Controle CRM, FUP e checks manuais

O controle de Leads usa os mesmos filtros e linhas de `v2_leads` do dashboard; a planilha Envios é fotografia de layout/informações, não fonte do volume de Leads. O volume diário é contagem de registros no dia:

- fonte pronta: valor numérico calculado;
- fonte ausente: `null` e dias pendentes;
- não há conversão de ausência em zero;
- aliases oficiais preservam IDs/células existentes;
- dealer novo pode aparecer como raw sem ser movido para uma unidade oficial.

A coluna `Manual` é a única edição operacional. `SYONET`, `Vol. Lead` e os status de integração são somente leitura; a aplicação não conecta de fato ao CRM, SYONET ou BBRO e não executa envios. Cada check salva versão, conta, horário, responsável lógico `Wini` e evento de auditoria; conflito de versão exige atualização antes de salvar.

O escopo BBRO é fechado a:

- unidades do cadastro `CRM_DEALERS` — 40 lojas;
- datas encerradas até D-1;
- nenhum dia futuro;
- nenhuma criação automática de unidade fora do CRM.

A preparação é idempotente e não altera checks já existentes.

## 9. Permissões e apresentação

| Papel | Leitura | Escrita principal |
|---|---|---|
| `admin` | dados operacionais e técnicos | contas, metas, imports, dispatch; projeções somente Rodrigo |
| `client` | dashboard e controle em modo apresentação | nenhuma mutação operacional |
| `bbro` | controle limitado ao escopo BBRO | check Manual, histórico e preparação CRM permitidos; sem gestão/admin |

O modo apresentação mascara detalhes técnicos selecionados, limpa avisos internos e normaliza algumas dimensões para o cliente. Isso é uma projeção da resposta, não uma mutação na fonte.

## 10. Ciclo de vida de fontes e auditoria

- **Preview:** XLSX permanece em memória/base64 da requisição; não registra dealer extra.
- **Commit:** parser, importação, registro dinâmico e metas relacionadas ocorrem na transação apropriada.
- **Histórico:** snapshots comerciais são imutáveis; mapping-only cria revisão aditiva.
- **Remoção:** administrador faz soft-remove apenas da versão ativa esperada; histórico permanece, e uma versão removida mais recente não ressuscita uma antiga automaticamente.
- **Reupload:** restaurar conteúdo antigo cria nova revisão ativa quando necessário e registra evento; reenviar a mesma revisão ativa é idempotente.
- **Meta manual:** permanece após remoção de fonte importada.

## 11. Evidência de testes

Em execução local observada em **06/11/2026**, `pnpm test -- --reporter=dot` passou com **33 arquivos e 218 testes**. A suíte cobre calendário D-1, `Mês passado`, filtros, cinco modelos, 27 UFs, cadastro 41/40, parser combinado 31/10.579/591, WEEKLY_REG W1–W6 sem soma, DAILY_FUP/MTD, conversão com guardas, registro dinâmico, transações, remoção/reupload, dispatch, permissões e projeções de mídia.

Esse resultado é uma fotografia de validação do commit/ambiente observado; não declara que dados de produção, integrações ou futuras alterações estejam disponíveis.

## Consulta da base e cobertura da fonte — correção de 06/11/2026

**Atualizar base de Leads** executa uma nova leitura autenticada do banco importado. A consulta passa a informar `checkedAt` (hora da consulta) separadamente de `source.importedAt` (hora da importação) e `source.latestLeadDate` (último dia de Lead disponível). Quando essa cobertura é anterior ao fim do período, a interface avisa que a fonte ainda não cobre o dia selecionado. O botão não altera importedAt, não inventa registros e não importa Google Sheets.

A atualização invalida as famílias de cache do dashboard e do controle CRM sem disparar consultas duplicadas; consulta ativa é refeita uma vez, preservando filtros, metas e checks. Erros e fonte ausente não são apresentados como sucesso; sessão expirada recebe orientação de login. O feedback da consulta permanece ao trocar de aba e é limpo ao alterar os filtros. Leituras independentes de fonte, Leads, cadastro extra e meta mensal são executadas em paralelo.

Uma nova importação ou sincronização externa depende de uma conexão runtime própria. A integração disponível para leitura durante tarefas Manus não é automaticamente uma credencial de aplicação publicada. Nenhum token de conector foi transferido ao servidor para contornar essa limitação.
