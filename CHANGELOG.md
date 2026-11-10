# Registro de entregas

Este documento resume mudanças do código e da documentação. Uma entrega listada não comprova, por si só, publicação, conectividade externa ou estado futuro dos dados. Entradas anteriores são históricas; o estado vigente está no [README](README.md) e nos [guias técnicos](docs/ARQUITETURA.md).

## 10/11/2026 — Exportador no modelo aprovado de quatro páginas

O botão PDF passa a gerar capa, Leads com curva acumulada, gráfico diário por canal e vendas com Top 10/Bottom 10, em A4 paisagem e no idioma da interface. Cards usam números menores e peso suave; tabela Daily totals e card Peak daily volume não são incluídos. O modelo não contém imagens ou indicadores estáticos do arquivo de referência.

No clique, a mesma consulta `leads.dashboard` é relida com a autorização e filtros vigentes. A preparação aguarda a versão renderizada correspondente e preserva seus SVGs e legendas; números, metas, projeções, datas e rankings vêm do agregado recebido. O cenário histórico escolhido na tela permanece coerente com os indicadores do relatório. Falha de leitura ou mudança de recorte/snapshot bloqueia a exportação. Dados armazenados mais recentes não são uma promessa de sincronização Google: exportar não chama imports, sync ou mutations de negócio, não amplia acesso e não envia o PDF a serviços públicos. Salvamento no GitHub permanece separado da publicação do site.

Validação: **513 testes em 67 arquivos** na suíte completa e, após os ajustes finais da revisão somente leitura, **70 testes afetados em 7 arquivos**, TypeScript/build aprovados. Chromium isolado confirmou quatro páginas, refetch antes de exportar, alterações dinâmicas dos valores, gráficos e rankings sem cortes e limpeza pós-impressão. Corrigidos casos de forecast filtrado/atrasado, competência mensal, canais do Overview Cliente, ausência versus zero confirmado e versão das entradas que definem elegibilidade comercial. Nenhuma fonte foi sincronizada e nenhum dado ou PDF operacional foi versionado.

## 10/11/2026 — PDF da Overview para todos os perfis

Adicionado **Gerar PDF / Export PDF** na Overview para Admin, ADM Cliente/Thiago, Cliente e BBRO, usando a impressão nativa/Salvar como PDF do navegador. O resumo utiliza o layout branco MG atual, indicadores, curva histórica e gráficos já carregados, período/filtros aplicados e corte D-1 São Paulo. O clone isolado preserva SVGs, amplia áreas de scroll e permite paginação de tabelas, sem alterar o dashboard ou consultar dados adicionais.

Incluídos **Top 10 e Bottom 10 por conversão** com os agregados autorizados das unidades elegíveis: sem dados fictícios, valores copiados do exemplo antigo, rateio de grupos ou EM BREVE. Venda zero conhecida é elegível, ausência não vira zero e recortes sem conversão comparável exibem indisponibilidade. Interface e resumo acompanham PT/EN.

A exportação remove contatos/Leads individuais, controles, importações, metadados privados de arquivos e notas administrativas; busca textual aparece apenas como filtro aplicado. Geração bloqueada durante atualização. Não há upload público, envio automático, alteração de perfil, migration, sync ou escrita de dados nesta entrega. Validação: **497 testes em 65 arquivos**, TypeScript e build aprovados; impressão Chromium com fixture isolado confirmou escala SVG após exclusões, última linha da tabela, rankings, valores indisponíveis e limpeza pós-impressão. Código salvo no GitHub é separado de publicação do site.

## 10/11/2026 — Idioma Thiago e Retail por concessionária

Idioma separado das permissões: Cliente/ADM Cliente e o username normalizado Thiago recebem inglês, sem alteração de papéis. Corrigidos defaults de idioma, datas, contadores, estados vazios e rótulos do dashboard; login permanece em inglês.

Vendas por concessionária passam a priorizar `WEEKLY_RET`, preservando W1–W6 no snapshot JSON e W4 como referência mensal quando preenchida. `WEEKLY_REG` fica como fallback legado somente na ausência da aba Retail. A visão semanal mantém nomes originais e de-para, não soma snapshots cumulativos, não rateia grupos e não converte ausência em zero. Conversão e Leads por venda por unidade respeitam o corte próprio do Retail e os filtros compatíveis. Totais gerais Retail/Registration continuam separados.

Validação desta correção: **474 testes em 62 arquivos**; após os ajustes finais de privacidade e visibilidade, **66 testes afetados em 8 arquivos**, TypeScript e build aprovados. Metadados administrativos de importação não são enviados aos clientes; `unmapped` não carrega snapshots semanais internos. Nenhuma migration, sincronização de Leads ou mudança de perfil foi feita. O upload comercial recebido foi confirmado em snapshot próprio, sem alterar metas manuais. Gravação de dados comerciais é separada do checkpoint; publicação não foi solicitada nesta correção.

## 09/11/2026 — Repositório atual e revisão documental

O projeto foi conectado ao novo repositório **privado** [rodrigocordovabbro/mg-motor-brasil-dashboard](https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard), com `main` e `dashboard-v2`. O GitHub passou a ser o repositório canônico do WebDev; bancos, contas e segredos não foram enviados. Destinos anteriores e tentativas bloqueadas permanecem somente como histórico.

README, arquitetura, regras de negócio, segurança, operação e contribuição passam a descrever o código atual, com destaque para a contagem analítica, Retail, novos perfis e sincronização real. A publicação automática permanece desativada: salvar código ou documentação não publica o site.

## 07–09/11/2026 — Evolução funcional

| Área             | Entrega                                                                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base de Leads    | Importação Google server-side, transacional e idempotente; preservação da proveniência e do histórico físico.                                                                                             |
| Contagem         | Projeção compatível com a regra histórica de datas, identidade e ciclo de canais, compartilhada pelas leituras analíticas sem apagar a origem.                                                            |
| Atualização      | Consumo de memória reduzido por reutilização de formatadores ICU, streaming e payload/hash sob demanda; confirmação do snapshot consultado após sincronizar.                                              |
| Feedback         | Popup com fases reais de importação e atualização de indicadores/gráficos; erro ou sucesso somente após resposta válida.                                                                                  |
| Curva de Leads   | Último mês ou média normalizada de três meses fechados; plano até a meta, barras acumuladas realizadas, estimativa identificada, cores dos meses e cobertura explícita.                                   |
| Vendas           | Retail do resumo `Current Month` de `DAILY_FUP` como total agregado; Registration separado; fonte semanal por dealer preservada. Conversão executiva baseada em Retail.                                   |
| Upload comercial | Progresso real de preparação do XLSX, prévia antes de confirmar, proteção contra cliques concorrentes e callbacks após fechamento.                                                                        |
| CRM              | Conciliação dos controles sem substituir a base de Leads; origem de arquivo e validação auditada distintas. Coluna `Integração API BBRO (manual)`, `Check`/`--` e destaque verde dos volumes confirmados. |
| Exportação       | CSV autenticado integral dos filtros aplicados, com limites explícitos, máscara por perfil e proteção contra fórmulas; indisponível para o Cliente Overview.                                              |
| Perfis           | `ADM - Cliente` com leituras permitidas; `Cliente` somente Overview. Migrações/alterações auditadas sem trocar senhas; sessões antigas revogadas quando o papel muda.                                     |
| Apresentação     | Login sempre em inglês; Cliente/ADM Cliente em inglês. Navegação `Overview → Stores & CRM → Regions → Leads` para leituras completas, sem retorno indevido de abas permitidas ao Overview.                |
| Cliente          | Top 10 estados, resumo Leads/Sales e acompanhamento agregado por dealer em modo somente leitura, sem reabrir outras APIs/abas.                                                                            |
| Administrador    | Aba protegida de análise de modelos/versões, cruzamentos, tendências e gaps heurísticos de mix; barras diárias agrupadas por modelo.                                                                      |

A última validação funcional registrada antes desta revisão documental foi de **463 testes em 60 arquivos**, TypeScript e build aprovados. Isso não significa que a suíte tenha sido novamente executada para estas mudanças apenas de documentação.

## 06/11/2026 — Cópia documentada para GitHub

### Produto entregue

- Identidade MG Motor Brasil, com logo e favicons fornecidos pelo usuário.
- Navegação ampliada e persistente; abas de Visão Geral, Regiões, Lojas & CRM e Leads.
- Pacing mensal, metas editáveis e indicadores comerciais.
- Distribuição conciliada em cinco modelos e matriz por estado/macrorregião.
- Cadastro oficial de dealers e cadastro extensível por arquivos confirmados.
- Controle CRM diário, volume calculado na base de Leads e check Manual auditável.
- Perfis Administrador, Cliente e BBRO com autorização no servidor, antes da divisão dos perfis Cliente.
- Plano de Mídia com projeções mensais e recálculo de CPL.

### Ajustes daquele estado

- Upload único de metas com `DEALER`, `TOTAL DEALER` e `SALES`, prévia e confirmação transacional.
- Novo dealer identificado na prévia e cadastrado apenas na transação confirmada.
- Atualizar vendas separado, naquele momento com WEEKLY_REG e MTD Registration geral; regra de Retail posteriormente revista.
- Unidades EM BREVE ocultadas da tabela comercial.
- Atalhos de período aplicados imediatamente, com Busca/Enter para alterações manuais.
- Ajustes de filtro de campanha e preservação de metas manuais durante a prévia.

### Documentação e limites daquele estado

README de produto e instalação, `.env.example` sem segredos, guias técnicos e contribuição foram incluídos. A evidência funcional então registrada era de 218 testes em 33 arquivos. A cópia GitHub ainda era independente do canônico Manus; **essa condição foi substituída pela conexão de 09/11**. Banco, contatos, contas, senhas, checks e segredos nunca fazem parte da cópia de código.

## 06/11/2026 — Diagnóstico histórico da atualização

Naquele estado, o botão relia o banco e a fonte não cobria o último dia do período. Foram adicionados horário de consulta, cobertura, avisos e invalidação de caches sem duplicação. A conclusão de que o botão apenas consultava o banco **não descreve o código atual**: o ADMIN hoje executa a importação Google real; os demais perfis continuam apenas reconsultando os indicadores.
