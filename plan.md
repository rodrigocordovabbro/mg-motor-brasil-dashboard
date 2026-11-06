# MG Sales — painel comercial / homologação

## Escopo autorizado e atualização

A V2 foi criada em recurso WebDev fullstack independente. A origem/destino de desenvolvimento continua sendo `digocordova83-cyber/mg-motors-dashboard-clone`, exclusivamente `dashboard-v2`, base `dfad96cb1d015384d0425ce0f91ac308da0c8eb5`. A `main` do GitHub e o projeto V1 não serão alterados. O novo recurso usa seu próprio repositório gerenciado para checkpoint/publicação; nenhuma configuração V1 será copiada.

A nova orientação do usuário substitui a preservação estética escura: fundo branco/cinza-claro, cards brancos, vermelho MG, barra superior de filtros e abas inspiradas nas telas fornecidas da Webmotors. Criar tela de usuário/senha com a conta temporária solicitada. A senha não será gravada em fonte/cliente/repositório: somente hash salted scrypt no banco novo. A publicação será privada/homologação pela plataforma, com aviso de troca da senha temporária.

## Código e módulos

Preservar o código dos módulos V1 (Google Ads, Meta Ads, TikTok Ads, Social Orgânico, Leads, Plano de Mídia e Financeiro) em `legacy/`, sem importar dados JSON, relatórios, dumps, .env, credenciais ou scripts operacionais. Não executar esse código automaticamente na V2. Reutilizar o utilitário original `shared/dashboardDates.ts` e a semântica dos IDs de navegação.

`client/src/pages/Home.tsx` e componentes V2 montam a interface ativa branca. Manter os módulos existentes na navegação; os módulos sem conexões mostram `Fonte não configurada`, nunca zeros ou métricas inventadas. Em Leads, oferecer as mesmas abas de referência: Visão Geral, Regiões, Horários, Modelos, Lojas & CRM e Leads. Filtros por período, modelo, campanha, concessionária e busca aplicam-se à nova fonte real. Não copiar as regras de exclusão comercial da Webmotors sem evidência na planilha: contar e descrever somente os registros da nova fonte, preservando suas datas.

## Fonte de Leads e proteção

A nova planilha autorizada é `1DnkkrrU3GqcuBd5br_OQDaGMMtA2iN2ik4yEV5-Ggw8`, gid 0. Ler via Google Workspace autorizado, somente leitura. Inspecionar headers/tipos e preparar o mapeamento dos campos reais. Nenhum dado de Leads da V1 será importado. A carga inicial, se o acesso funcionar, será armazenada exclusivamente no banco do recurso V2, em tabelas próprias. Não copiar export de contatos para Git/cliente nem expor PII em mensagens. Separar carga inicial autenticada de atualização automática: não afirmar sincronização contínua ou live API quando apenas uma captura autorizada foi importada. Não copiar tokens do conector para o runtime publicado. Se acesso não existir, manter estado honesto e entregar a estrutura, com o bloqueio objetivamente informado.

`server/routers.ts` expõe somente autenticação customizada própria V2 e APIs protegidas de análise da nova fonte. `server/v2Auth.ts` valida JWT HS256 com secret gerenciado, appId, scope e expiração; resolve conta ativa no banco e usa cookie próprio `HttpOnly; SameSite=None; Secure`. Não há usuário simulado nem bypass em Preview. Tentativas de login são limitadas; respostas não retornam hash/credenciais. `server/v2Leads.ts` calcula métricas somente dos dados do banco V2 e distingue não configurado, erro e ausência de registros no filtro.

## Datas, banco e publicação

O corte padrão e máximo é D-1 em `America/Sao_Paulo` para todos os módulos. Preservar datas originais dos Leads, distinguir datas inválidas e não redistribuir dados. Banco V2 próprio; somente migrations próprias/aditivas, nunca migrations, ETL ou imports V1. Manter o novo template/servidor Express/tRPC, Dockerfile, `/api/health`, cookie seguro e manifesto estático de rotas.

Realizar TypeScript, build, testes de autenticação/datas/mapeamento/métricas e uma revisão read-only da implementação. Registrar checkpoint no repositório Manus novo e sincronizar arquivos sanitizados na branch `dashboard-v2` do GitHub autorizado sem force push. Publicar em endereço Manus novo quando confirmado e verificar o acesso. Não alterar domínios ou configurações do dashboard existente.

## Escopo final delimitado pelo usuário durante a execução

Desenvolver agora somente Leads e Plano de Mídia. Os demais módulos ficam preservados no código legado, mas fora da navegação ativa desta etapa. Na primeira aba de Leads manter KPIs, pacing, barras por dia/canal com acumulado e ritmo, distribuição por canal e acompanhamento simplificado por concessionária: metas de Leads/vendas, Leads entregues, vendas e taxa de conversão. Excluir investimento alocado e CPL estimado desse quadro. Plano de Mídia mantém fontes, cálculos e conteúdo originais em uma aba separada, com apresentação branca. As imagens são inspiração visual, nunca fonte automática de números; se a fonte nova não contiver vendas/metas, mostrar explicitamente indisponível até conexão apropriada, sem acessar/alterar a base V1.

## Controle de Envios e revisão de UX — 05/11/2026

Adicionar à V2 uma terceira aba, Controle de Envios, baseada somente na aba `Envios` do arquivo `mg-motors-envios-2026-11-01-a-2026-11-05.xlsx`. A orientação posterior do usuário manda ignorar completamente `Como ler`: não criar sua aba, textos ou alerta de divergência baseado nela. Manter títulos, ordem, nomes de lojas/CRM, integrações e cinco grupos diários SYONET/Manual/Vol. Lead exatamente como Envios; o Manual é o único campo editável, por check OK, podendo desmarcar, persistir e auditar por usuário autenticado, data/hora e versão. Os sete OK originais são preservados como origem arquivo, sem atribuição falsa ao Wini. A conferência é do fluxo Wini; a identidade autenticada de quem grava fica registrada separadamente.

Importar a fotografia do arquivo para tabelas `v2_dispatch_*` próprias e APIs protegidas; não incluir responsáveis pessoais ou dados do arquivo em Git/bundle público. A primeira importação é idempotente por SHA256, não faz envios nem altera SYONET/volume ou dados originais. Os cinco dias de despacho (inclusive 05/11) do arquivo permanecem visíveis: este controle é uma fotografia de envios, não a métrica de criação de Leads sujeita ao corte D-1. Nenhuma reconstrução/inferência do despacho a partir da base de Leads será feita. Checks têm controle otimista de concorrência para não sobrescrever outra pessoa silenciosamente; alterações/reconfirmações são auditadas. Volume e status de integração são somente leitura.

O pedido posterior amplia a revisão de UX para toda a V2: leitura clara, hierarquia visual, responsividade, navegação e gráficos no padrão branco clean MG, mantendo fontes/calculações/dados reais. Oferecer modo cliente de apresentação que mascara nomes individuais de Leads e responsáveis CRM, deixando operação autenticada com os campos originais. Não inventar tendências, vendas, CRM, CPL ou fontes externas por causa da revisão visual. Reutilizar os assets existentes, sem ilustrações decorativas. Manter sessão/logout, fontes não conectadas honestas, Plano de Mídia original e navegação Leads/Plano/Controle. A nova alteração será salva em checkpoint e em dashboard-v2; publicação não é automaticamente autorizada pelo pedido de edição, portanto a publicação anterior fica intacta até ação expressa de publicar.

## Lojas & CRM e atualização D-1 — 05/11/2026

O pedido atual determina que o clone operacional de Envios apareça dentro da aba **Lojas & CRM** do módulo Leads. Reutilizar o mesmo controle/banco/checks; o atalho superior Controle de Envios continua levando ao mesmo estado, não a uma cópia divergente. Nomes de loja e responsáveis, status cadastral Integração Syonet/Integração API BBRO e grupos diários são os reais do XLSX autorizado. Responsáveis CRM devem ser consultáveis no controle por opção explícita, mesmo na apresentação modo cliente; preservar nomes originais.

Ao abrir/atualizar o controle, preparar o calendário até D-1 em America/Sao_Paulo: acrescentar dias ainda ausentes com check Manual pendente por loja, sem duplicar colunas, apagar ou substituir checks anteriores. Se a fonte do novo dia ainda não estiver disponível, SYONET e volume aparecem como aguardando fonte/indisponíveis, jamais OK/zero inventado. A atualização recorrente de dados ocorre por importação autenticada de arquivo Envios na própria interface, conciliando pelo nome exato da loja e preservando identidade das células e validações/auditoria. Não inferir envio ao CRM a partir da criação de Leads. Não há credencial runtime de CRM/Google nem sincronização automática live; a preparação de calendário é nativa da aplicação ao abrir/atualizar, sem cadastrar agendamento externo não solicitado.

Arquivo atualizado alimenta metadados cadastrais e dados reais de despacho somente até D-1; dias futuros novos são ignorados. Dados históricos já importados permanecem preservados no banco. Como ler continua ignorada. Upload limitado e parser somente no servidor; nenhum XLSX/nome pessoal vai para Git ou bundle. Importação é transacional, versionada por hash e auditada pelo usuário autenticado. A migrations necessária é aditiva: volumes pendentes nullable e tabelas próprias de auditoria de importação. V1/main GitHub permanecem intocadas. Checkpoint e branch dashboard-v2 atualizados, sem publicar automaticamente.

## Volumes iguais ao dashboard por dealer e largura — 05/11/2026

A orientação mais recente substitui a fonte do Vol. Lead: **usar exclusivamente `v2_leads`/LEADS MG — Base, a mesma base consultada pelo dashboard**, com os mesmos filtros aplicados de período, modelo, canal, campanha, dealer e busca. Não usar volumes ou totais do XLSX Envios no controle ativo. O arquivo serve somente aos responsáveis e metadados cadastrais de Syonet/BBRO, além do histórico de status e OK existentes, claramente distinto de comprovação de entrega. Reutilizar a mesma função de seleção dos registros do dashboard para impedir divergência entre total geral, distribuição por dealer e células diárias.

Todos os Leads selecionados devem aparecer, inclusive dealers que não constem do cadastro Envios. Nomes originais de concessionária não são reescritos no banco de Leads; o de-para para o cadastro é explícito/persistido e só aceita correspondência inequívoca, nunca agrupamento fuzzy por cidade ou marca. Dealers sem definição (`outros`/Não informado/vazio) compõem Leads em qualificação, preservando aliases originais. Dealers sem cadastro são visíveis com CRM/integrações sem informação, não são descartados nem recebem integração inventada.

Checks continuam associados a IDs estáveis de loja/dia; preparar novas células não altera fonte histórica, checks ou auditoria. Cada dia até D-1 obtém Vol. Lead calculado em consulta da base do dashboard, independentemente de upload Envios. Status diário SYONET não é inferido desse volume. A aba Lojas & CRM volta a exibir e compartilhar os filtros aplicados da Visão Geral; o atalho superior oferece o mesmo cálculo no mês atual até D-1. Ampliar layout para ocupar a largura disponível sem max-width 1680, aumentar colunas/células/texto, manter rolagem e cabeçalhos fixos, Manual sem cortes de texto. Preservar V1/main, desenvolver apenas dashboard-v2 e salvar sem publicação automática.

## Editor mensal de meta no pacing — 05/11/2026

Incluir botão destacado **Atualizar metas** diretamente no bloco Pacing de Leads da Visão Geral, inclusive em modo apresentação para o usuário autenticado, sem exigir troca para operação. Ao abrir, mostrar competência mensal e meta numérica inteira positiva (1 a 10.000.000), carregar a meta salva do mês e permitir Salvar meta/Cancelar. Competência inicialmente acompanha o mês do pacing, mas pode ser alterada para cadastrar o próximo mês sem sobrescrever histórico. Meses sem meta permanecem indisponíveis, não herdam a meta anterior.

Usar a tabela e auditoria já existentes `v2_lead_goals`/`v2_goal_audit`, protegidas pela sessão V2. Gravar somente o mês selecionado. Após salvar, invalidar a consulta mensal e todos os recortes do dashboard, atualizando percentual atingido, barra, ritmo esperado, restante, necessário/dia e comparativo da projeção versus meta, com feedback claro de salvamento. Contagem real, média e projeção continuam calculadas da base, não são ajustadas artificialmente à meta. Meta global não é comparada com recortes de canal/modelo/dealer/campanha/busca, nem distribuída incorretamente por intervalos multicompetência. Manter corte D-1 e preservar V1/main; não inserir metas de teste no banco real.

## Três arquivos comerciais mensais e importação de novembro

No bloco Vendas e metas por concessionária, incluir uploads independentes de **Meta de Leads**, **Meta de Vendas** e **Atualização de Vendas**, cada um vinculado a uma competência mensal. Permitir trocar o mês e repetir no futuro, com preview/validação/totais e de-para explícito dos nomes de dealer, versões anteriores preservadas e reenvio idempotente por hash. O usuário autorizou expressamente importar os três anexos para **novembro/2026**. Não usar esses arquivos como base de contagem de Leads; Leads reais continuam vindo exclusivamente do dashboard.

A distribuição de Leads contém meta global real de 16.600 em grupos/UF, sem competência na planilha; novembro é a escolha explícita do usuário. Registrar o total como meta global do pacing e preservar granularidade coletiva no quadro, sem repetir a mesma meta em cada loja nem inventar rateio. Meta de Vendas é uma fonte separada, não inferida das colunas auxiliares dos outros arquivos.

O Daily Sales FUP informa 20 Retail MTD no resumo e 43 emplacamentos MTD (métricas diferentes), mas seu detalhamento semanal por dealer soma zero. Preservar essa divergência com aviso visível e não atribuir as 20 vendas a dealers artificialmente. Vendas agregadas MTD só são comparáveis com o acumulado mensal/as-of compatível, sem comparação falsa em recortes de canal/modelo/campanha/busca ou dias arbitrários. Registrar a data de referência/as-of separada da data de geração do arquivo. Os uploads normalizados ficam no banco V2, nunca em Git/bundle público; não alterar V1/main nem publicar automaticamente.

### Correção autorizada de origem das vendas por dealer

A orientação posterior do usuário define **WEEKLY_REG** como origem das vendas por dealer, no formato do FUP enviado, inclusive quando os valores forem zero. Essa orientação substitui o uso do resumo DAILY_FUP/Retail no quadro ativo. Ler as colunas `Wn_Reg` de WEEKLY_REG, preservando dealer/customer code/targets como metadados separados e sem somar snapshots semanais acumulados indevidamente. A semana/coluna de referência deve ficar explícita no upload/preview; default deriva da data de referência e pode ser ajustado para refletir a coluna preenchida do arquivo. Os zeros efetivamente presentes em WEEKLY_REG são dados válidos, não ausência da fonte. Valores do DAILY_FUP não são usados para substituir esses zeros. Manter a diferença entre data do arquivo, semana escolhida, competência e corte D-1.

## Nomenclatura pública — MG Sales

O usuário determinou retirar V2 dos títulos e trabalhar com a marca **MG Sales**. Aplicar ao cabeçalho, login, navegação, título/descrição HTML, nomes das rotas e mensagens de erro visíveis. Manter o logo MG e a identificação verdadeira de homologação, sem afirmar que o ambiente foi publicado ou está pronto para produção. Identificadores técnicos, tabelas, cookies, nomes de módulos, diretório, recurso, endereço e branch autorizada `dashboard-v2` permanecem estáveis para não afetar dados, sessão ou isolamento do dashboard original. O estudo de UX será apresentado como MG Sales; as demais melhorias serão propostas, não implementadas sem pedido.

## Conciliação com dealers oficiais — 05/11/2026

O usuário forneceu o cadastro oficial de 40 unidades e pediu conciliar metas. Adotar uma camada de de-para versionada separada da fonte: preservar dealer e rótulos comerciais originais; consolidar grafias/aliases apenas por equivalência explícita com o cadastro oficial. Reconciliar MetaLeads, MetaVendas e vendas WEEKLY_REG da competência já importada, mantendo valores, zeros reais, asOf e semana escolhida. Não usar UF residencial do Lead como UF da concessionária. Exibir unidades oficiais mesmo sem Leads no período; manter registros fora do cadastro ou ambíguos como não conciliados, sem descarte do total. Metas de grupos com várias lojas ficam explicitamente coletivas e contabilizadas uma vez, sem atribuir a meta inteira a cada loja ou inventar rateio. Corrigir metas individuais quando a fonte identifica a unidade. Tornar o de-para reutilizável em uploads seguintes e gravar a revisão auditável, preservando metas globais manuais, meses anteriores e checks. Manter MG Sales, projeto/recurso atual, branch externa dashboard-v2 e dashboard original intacto. Não alterar a fonte de vendas para retail ou W4 sem nova orientação; prevalece WEEKLY_REG já selecionada nesta conversa.

## Atualização autorizada — Sinal Av. Indianópolis

O usuário autorizou expressamente incluir Sinal Av. Indianópolis como dealer novo e independente. O cadastro passa de 40 para 41 unidades; vincular a ela a linha SINAL AV INDIANOPOLIS da MetaVendas de novembro (7), mantendo Av. Europa separada e preservando a meta global 722. Não inventar MetaLeads, vendas realizadas, responsáveis ou status de integração para a nova unidade. Incluir sua linha no controle operacional com Manual pendente até D-1 e metadados CRM ainda indisponíveis. Preservar todos os snapshots, registros e checks existentes.

## Conciliação de modelos — MG Sales

Agrupar a dimensão de modelo nas nomenclaturas solicitadas: MG 4, MG Urban, MG S5, MG Cyberster e IM 6. Usar de-para explícito para modelos abreviados e rótulos de formulário que identificam Urban; MG 4 Urban pertence a MG Urban, não ao grupo MG 4. Preservar model/dealer e demais campos nos Leads originais e na tabela de registros. Aplicar a mesma equivalência no gráfico, KPI de modelos, opções de filtro e seleção compartilhada com Lojas & CRM. Identificações ausentes ou ambíguas não são atribuídas arbitrariamente; não excluir registros nem alterar metas/checks. Não mudar o design ou publicar automaticamente; salvar no recurso MG Sales e somente em dashboard-v2 no GitHub escolhido.

## Regiões e administração do MG Sales

Conciliação de estados no backend em 27 unidades federativas: siglas e nomes equivalentes se tornam nomes por extenso nas distribuições, sem reescrever o estado original. Valores não identificáveis são agregados em uma categoria não territorial; não inferir estado por dealer ou cidade quando a fonte não contém indicação territorial inequívoca. Matriz de Leads por modelo e macrorregião (Norte, Nordeste, Centro-Oeste, Sudeste, Sul), com alternância para estados, mesmos filtros e totais, abaixo da leitura regional. Retirar abas Horários/Modelos, preservando gráficos resumidos na Visão Geral.

Controle de usuários da aplicação existente, com Administrador e Cliente; promover apenas rodrigo uma vez por autorização expressa, sem trocar sua senha ou criar contas de teste. Papéis lidos do banco em cada requisição; versão de sessão revoga tokens ao redefinir senha. Serviços e APIs administrativas exigem perfil Administrador. Cliente recebe somente leitura e apresentação sem controles/importações/conciliação/definição de metas/avisos técnicos; erros de carregamento continuam indicados de forma genérica. Cadastro de contas e manutenção de acesso administrativo usam transações/auditoria e protegem o último administrador ativo.

Exclusão de fontes comerciais é desativação reversível e auditada da fonte ativa da competência, não remoção de arquivos históricos. Evitar que versão anterior reapareça; preservar metas manuais. O administrador confirma o arquivo/mês e o efeito na própria aplicação; nenhuma exclusão real é realizada na implementação. Novas migrations são aditivas e não rodam no startup. Não mudar domínio, dashboard original ou política de publicação.

## Navegação persistente e meta total de vendas

Unificar o menu de abas em um componente único, antes dos filtros/conteúdo, com posição sticky logo abaixo do cabeçalho da aplicação. Medir a altura real do cabeçalho para ajustar desktop/mobile sem offsets arbitrários; botões de 48px ou mais, texto ampliado, espaçamento e foco visíveis. A barra deve permanecer disponível inclusive durante carregamento e manter a mesma posição ao mudar para CRM, que antes tinha uma renderização separada.

Permitir que apenas rodrigo Administrador ajuste a meta total mensal de vendas no indicador, com override persistente/auditável separado das linhas dos arquivos. Não sobrescrever metas de lojas/grupos ou redistribuir a diferença; sem definição manual manter o total da fonte importada. Meta total só baliza o agregado da competência sem filtros dimensionais. Permissões de gravação também no backend. Novas tabelas aditivas e nenhuma gravação de meta de teste ou alteração dos números atuais na implementação.

Vendas gerais passam a usar o MTD Registration do bloco Current Month/DAILY_FUP do FUP recebido, inclusive quando WEEKLY_REG estiver zerado. O arquivo atual contém 43 em E3; o parser lê o campo a cada atualização, não um valor fixo. Vendas por loja permanecem na coluna semanal escolhida, sem distribuir o total geral. Armazenar o total e a data de referência do arquivo em metadados de uma nova versão imutável da importação. Referência 05/11 não é convertida artificialmente em 04/11: os Leads continuam com corte D-1 e comparações de conversão só aparecem quando os recortes forem compatíveis. O total geral é identificado como MTD do FUP, sem comprovar vínculo individual dos registros aos Leads.

## Conversão geral comparativa

Por solicitação do usuário, o cartão geral calcula Vendas MTD do FUP dividido pelos Leads reais do período, mesmo quando as duas referências de data diferem. Mostrar duas casas decimais e a fórmula, identificando a razão como comparativo geral e não como conversão comprovada de uma coorte. O cálculo geral não libera atribuição de vendas a modelos/canais/dealers; recortes sem denominador ou numerador válido permanecem indisponíveis. Não há alterações de dados nem de metas — a meta manual de vendas atualmente salva como 660 deve permanecer intacta.

O Plano de Mídia usa a largura integral do contêiner principal, sem max-width de 1680px e sem margens internas duplicadas. Margens responsivas ficam sob responsabilidade do mesmo contêiner usado pelas demais abas. O ajuste é somente visual e não altera projeções ou valores salvos.

## Identidade MG Motor Brasil

A marca visível passa a MG Motor Brasil — Acompanhamento de resultados. Usar o SVG horizontal enviado pelo usuário, branco no login de fundo escuro e vermelho no cabeçalho claro, com variante preta disponível e proporção preservada. Favicon/ícone Apple e ícone do projeto usam o símbolo MG vermelho enviado; nenhuma forma do símbolo é reconstruída. Login mantém autenticação e campos inicialmente vazios, apenas com texto institucional revisado. A transição canônica GitHub foi cancelada pelo usuário: repositório gerenciado pelo Manus permanece ativo e nenhum novo destino será aberto/receberá código sem nova solicitação.

## Visão Geral sem faixa de cartões redundantes

Remover a faixa superior de quatro cartões Leads, Modelos, Dealers com Leads e CRM indicada pelo usuário. O pacing mensal, os KPIs comerciais de Leads/metas/vendas/conversão, os gráficos e o cadastro/contagem no backend permanecem intactos. Ajuste somente de apresentação, sem alteração de metas, projeções ou dados reais.

A tabela comercial de concessionárias passa a ter rolagem nativa interna com altura entre 320 e 520px ajustada à janela, barra cinza fina e cabeçalho fixo. Todas as unidades filtradas ficam disponíveis na mesma rolagem, substituindo a paginação de 12 linhas; busca e ordenação são preservadas e reposicionam a rolagem no topo. Totais comerciais permanecem os do período e não são recalculados pelo estado visual da tabela.

## BBRO e dados autorizados

Adicionar perfil BBRO, com a leitura do Cliente e permissão específica para preparar os checks necessários e validar Manual do controle CRM, mantendo auditoria e concorrência. Somente Administrador segue autorizado a metas, fontes, projeções e usuários. Cliente e BBRO passam a visualizar nomes dos responsáveis por CRM e nomes/informações de CRM dos Leads, por solicitação expressa; a exceção de leitura não autoriza alterações nesses registros. Não criar credenciais arbitrárias; permitir escolher BBRO na gestão de usuários e atribuir ao login bbro existente, se houver.

Os filtros de Leads incluem Mês passado (mês civil anterior a hoje em São Paulo, com viradas de ano e fevereiro preservadas) e deixam de incluir Campanha; a consulta remove qualquer campanha antiga do estado aplicado. Atualizar base de Leads no pacing repete a consulta autenticada do período e do acumulado mensal à base já importada, sem alterar filtros/metas e sem prometer sincronização externa. O perfil BBRO só valida Manual de lojas do controle CRM em datas encerradas até D-1; não recebe capacidades administrativas.

Na tabela comercial da Visão Geral, ocultar unidades com EM BREVE no nome oficial após a conciliação, antes da busca/ordenação. A alteração é só de apresentação nessa tabela: não remove cadastro, não redistribui metas coletivas, não modifica totais nem altera Lojas & CRM ou históricos.

Correção observada dos filtros: atalhos de período devem alterar simultaneamente o rascunho dos campos e os filtros da consulta. Datas e campos alterados manualmente continuam aplicados por Buscar (inclusive Enter), com indicação quando ainda diferirem da consulta. Não reutilizar o destaque de um atalho após edição manual das datas; pacing mensal continua identificado por sua competência e não é confundido com o total de Leads do período.

Novo padrão comercial solicitado: um XLSX DEALER/TOTAL DEALER/SALES alimenta conjuntamente metas de Leads e de Vendas, ignorando canais, peso e investimento. Um único campo e uma única confirmação, com prévia de ambos os totais/de-para e transação atômica das duas fontes lógicas. Atualizar vendas continua separado para WEEKLY_REG e MTD Registration. Arquivo enviado serve de modelo e prévia de validação; não substituir fontes/metas atuais sem confirmação. Preservar as regras atuais de metas manuais, histórico e permissões.

## Cópia GitHub documentada — 06/11/2026

O usuário escolheu expressamente `digocordova83-cyber/v2-mgmotor` pela integração após cancelar a troca de repositório canônico. Enviar uma cópia sanitizada do código atual em commit independente para `dashboard-v2`, mantendo o projeto canônico no Manus e sem publicação. O destino existente é público, sem alteração de visibilidade. Excluir da cópia notas internas de tarefa (plan.md/TODO.md/V2_BASE.md), marcador de inicialização da plataforma, histórico interno, bancos, contatos, segredos e planilhas; documentar o produto com os novos guias públicos completos. Preservar main do dashboard antigo e nunca usar force push.

README, arquitetura, regras de negócio, acesso, operação/deploy, contribuição, changelog e ambiente de exemplo vazio serão revisados contra o código e seus links internos antes de enviar. Informar bootstrap controlado, banco compartilhado do Manus, recursos não transferidos e ausência de sincronização externa automática. A documentação não altera KPIs, dados, usuários ou infraestrutura.

## Diagnóstico de Atualizar base — 06/11/2026

Foi confirmado por consulta somente leitura que a base possui 49.128 registros e cobertura até 04/11/2026; novembro tem 1.353 registros. A hora de importedAt (05/11) é a gravação da fotografia, não o último dia de Leads. O botão fazia refetch do banco corretamente, mas não importava Google Sheets nem tinha conexão runtime da fonte. Portanto, números idênticos não eram falha de callback: faltava renovação externa dos dados.

A correção adiciona checkedAt, latestLeadDate, aviso explícito de fonte que não cobre o período, confirmação de leitura/ausência de nova importação, sessão expirada, trava de cliques simultâneos e feedback persistente na troca de abas. Marca caches de dashboard/CRM como stale sem consultas duplicadas e executa leituras independentes em paralelo. Nenhuma credencial do conector é copiada ao runtime e nenhuma gravação de Lead, meta, conta ou check é feita nesta verificação. Uma futura conexão de importação externa requer configuração própria e permanece fora do mecanismo de releitura atual. Salvar apenas no Manus; GitHub permanece bloqueado por 403, sem repetir envio por outro canal ou publicar o site.

## Importação REAL da planilha-base e layout — 06/11/2026

A instrução recebida da tarefa Sincronizar Meta substitui a simples releitura: importar a fotografia atual da planilha-base via gws na conta Rodrigo, com todas as abas de canais reconhecidas e nenhuma escrita na planilha. Fonte real validada: 49.626 registros válidos, Meta novembro 1.002 (128/232/171/235/236 nos cinco dias) e novembro de todos os canais 1.851. Antes da carga guardar hashes de todas as tabelas administrativas existentes; depois verificar preservação e reconciliação por conteúdo, dia e ocorrência.

Implementar server/v2LeadsSyncMapper.ts e server/v2LeadsSync.ts com chave física aba/linha (não deduplicar ID), transação idempotente por hash de fonte, histórico privado de ocorrências/cargas e upsert que preserva IDs internos existentes, nunca apaga históricos/linhas ausentes ou outras tabelas. Modelos/dealers/IDs/timestamps e células de origem permanecem no registro bruto privado; dimensões ativas usam aliases de header sem alteração dos valores. V/W lidas, nunca escritas.

O botão administrativo chamará importação protegida real Google Sheets com conta de serviço própria GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON, lida do ambiente, somente escopo leitura. Não copiar tokens de conector da sessão ao runtime; usar cartão seguro para configurar a credencial ausente e compartilhar a planilha como Leitor com client_email. Sem ela o endpoint informa a configuração faltante e não diz sincronizado. Clientes/BBRO seguem lendo a base sem permissão de importação. Cache Leads/CRM invalidado após commit confirmado, metas/checks intactos e default D-1 São Paulo.

Cabeçalho de pacing usa título/descrição em uma área e badge+ações alinhadas em outra, ajuda/resultado em linha própria, sem alargamento da barra provocado por texto. Adaptar desktop/tablet/celular preservando marca. Salvar no Manus sem novo projeto, publicação, GitHub ou mudanças no agendamento externo.

Configuração concluída em 06/11/2026 pelo cartão seguro: conta de serviço própria com acesso readonly à base, disponível ao ambiente do servidor. Prévia reiniciada; teste real do serviço e segundo envio idempotente confirmados, dados administrativos preservados. A atualização segue manual pelo botão do administrador, não cron. Sem nova publicação.

## Ajuste visual — modelos fora da página inicial

Remover somente a distribuição por modelo da Visão Geral e ajustar o contêiner remanescente. Os dados e cálculos de modelos continuam disponíveis nos filtros e na matriz regional; nenhuma alteração de fonte, meta, permissão, sincronização ou publicação.

## Detalhamento de modelos e total das barras

Adicionar Modelos ao menu persistente e agregar na base completa filtrada (não na página de Leads recentes). Reutilizar o de-para dos cinco modelos e identificar lacunas de modelo e versão com categorias explícitas. Detalhar origem sem reescrever a planilha ou inventar especificações. Dados reais desconhecidos permanecem contabilizados. No gráfico diário, rotular o topo de cada pilha com o total de Leads daquela data, preservando canais e linhas acumuladas.

## Plano de Mídia em largura total e Modelos oculto — 06/11/2026

O Plano de Mídia passa a usar toda a largura do contêiner da aplicação, sem max-width centralizador ou segunda camada de margens laterais. Manter identidade MG; harmonizar tipografia, espaçamentos, contraste e proporção do gráfico em zoom 100%, com tabela rolável apenas no próprio bloco em telas menores. Alocação e produtos usam colunas equilibradas; conciliação financeira fica em faixa própria para evitar vazio excessivo. Preservar cálculos, fontes e edição de projeções.

Ocultar a aba Modelos do menu e da renderização ativa; URLs antigas tab=models caem em Visão Geral sem tela vazia. Preservar o componente, o de-para, a agregação de backend, filtros de modelo e matriz regional. Atualizar manifesto de rotas e regressões. Nenhuma importação, escrita administrativa, mudança de D-1 ou publicação nesta entrega.

## Regra de contagem compatível com o dashboard antigo — 06/11/2026

Por orientação expressa, alinhar a contagem do dashboard atual às regras verificáveis da versão antiga: data analítica corrigida, identidade por conteúdo e ciclo de canais. Aplicar a regra no servidor, antes dos filtros, paginação e agregações, compartilhada entre KPIs, pacing, gráficos, regiões, dealers e volumes CRM. Preservar integralmente a base bruta, proveniência, IDs e histórico de importação; não apagar duplicatas físicas, não fixar 1.843 nem subtrair oito artificialmente. Conferir a regra efetivamente usada pela V1 e documentar qualquer limitação da comparação da carga. Manter D-1 America/Sao_Paulo, metas, vendas, projeções, checks, permissões, V1 e política de publicação intactos. O pedido não configura novo agendamento.

## CRM igual ao Envios autorizado — 06/11/2026

Atualizar os atributos e status da aba CRM a partir de Envios do XLSX autorizado de 01–05/11, sem usar seus volumes como base de Leads. Corrigir o de-para exato com evidência, preservando campo dealer original e contagem total D-1. Mostrar Leads em qualificação como linha de repasse para que o rodapé represente a base completa. Importar por transação preservando IDs e auditoria; nomes oficiais equivalentes não criam linhas duplicadas. Manual do arquivo é visível como origem de fonte; após nova fotografia autorizada, a origem mais recente prevalece sobre conferências anteriores, mantendo-as no histórico; futuras conferências manuais prevalecem sobre a fotografia. Sem atribuir OK do arquivo ao Wini. Parser ignora apenas formatação distante, sem relaxar limites de conteúdo. Preservar V1, base bruta, metas, vendas e projeções; salvar no Manus sem publicar.
