# MG Motor Brasil

Novo recurso WebDev de homologação, separado do dashboard V1. Origem do código: GitHub autorizado `digocordova83-cyber/mg-motors-dashboard-clone`, branch `dashboard-v2`, commit-base `dfad96cb1d015384d0425ce0f91ac308da0c8eb5`.

Nesta etapa, a aplicação ativa inclui somente **Leads** e **Plano de Mídia**, conforme a delimitação posterior do usuário. Os componentes e serviços dos demais módulos originais permanecem em `legacy/` como código não executado. Não foram copiados snapshots Ads, relatórios, dumps, arquivos de ambiente, bases antigas de Leads, contas/senhas V1 ou scripts operacionais de importação/atualização automática.

## Leads

Interface branca inspirada nas referências fornecidas da Webmotors, sem copiar números das imagens. Abas: Visão Geral, Regiões, Horários, Modelos, Lojas & CRM e Leads. A Visão Geral conserva KPIs, pacing mensal, barras diárias por canal, real/pace acumulados, distribuição e acompanhamento simplificado por concessionária. Esse último quadro não apresenta investimento alocado ou CPL estimado.

A planilha nova `LEADS MG — Base` (`1DnkkrrU3GqcuBd5br_OQDaGMMtA2iN2ik4yEV5-Ggw8`) foi lida somente por conta Google autorizada. Carga inicial: **49.128 registros com datas válidas** nas abas Site, Meta, TikTok, TikTok Live, Webmotors, Mercado Livre, UOL e Interlagos. Armazenamento exclusivamente em tabelas `v2_*` do banco novo. Nomes aparecem somente na API autenticada/tabela protegida; e-mails, telefones e CPF não são importados porque não são necessários a esta interface. Nenhum contato foi incluído no repositório ou bundle frontend.

A carga é **importação inicial autenticada**, não conexão live nem sincronização automática. O timestamp de importação aparece na interface. As contagens preservam cada linha e sua origem; não foram aplicadas regras de deduplicação, integração ou exclusão comercial da Webmotors sem suporte na fonte. Datas ISO com timezone são convertidas ao calendário de São Paulo; datas locais/date-only permanecem no dia da fonte. Não são inventadas horas para datas sem horário.

O filtro padrão é o mês atual até ontem. Corte máximo frontend/backend D-1 em `America/Sao_Paulo`. Pacing calcula o acumulado mensal até a data final; gráficos e KPIs seguem o período. Meta mensal começa indisponível, pode ser definida/alterada por usuário autenticado e é auditada em `v2_goal_audit`. Meta global não é aplicada a um recorte de canal/modelo/dealer; pace diário não projeta a meta de uma competência sobre outra.

A fonte nova não fornece vendas nem metas por concessionária, tampouco comprovação de entrega ao CRM. Leads por dealer são reais; vendas, metas de dealer, conversão e integração CRM permanecem explicitamente **indisponíveis**, nunca zero/simulados. O quadro está pronto para uma fonte correspondente, mas ela não foi inventada nem copiada da V1.

## Plano de Mídia e acesso

Plano de Mídia conserva as fontes, os valores aprovados, cálculos, competências e estrutura da versão antiga solicitada, com apresentação branca. Seus dados são servidos por API protegida e não embutidos no JavaScript público.

Login usuário/senha próprio da V2 com conta temporária autorizada. Senha somente como hash salted scrypt no banco novo; nenhum plaintext em código ou cliente. Cookie próprio `HttpOnly; Secure; SameSite=None`, JWT HS256 com appId/escopo/expiração e verificação de conta ativa. Identidades Manus/OAuth/Bearer não substituem essa sessão. Há limitação de tentativas de login; a senha temporária fraca deve ser substituída antes de abrir o ambiente ao público. Debug de payload de rede foi desativado para evitar retenção de senhas/Leads em logs.

## Git e publicação

Desenvolvimento no GitHub autorizado ocorre somente em `dashboard-v2`, sem force push ou modificação da `main`. O recurso Manus novo usa seu próprio repositório gerenciado e a `main` desse repositório separado apenas para checkpoints. Checkpoint, carga de dados e publicação são operações diferentes. A publicação inicial do novo recurso mantém visibilidade privada/homologação; nenhuma configuração ou endereço V1 foi alterado.

## Controle de Envios e experiência para cliente

A nova aba reproduz exclusivamente a estrutura da aba `Envios` do arquivo enviado pelo usuário: cadastro das lojas/CRM/integrações, grupos diários SYONET, Manual e Vol. Lead e totais da fonte. `Como ler` é ignorada por determinação posterior. Dados do arquivo estão somente no banco protegido da V2, não no bundle frontend nem no Git. A tabela diferencia uma fotografia importada de qualquer integração live; o calendário de despacho do arquivo não é recalculado a partir da criação de Leads.

O usuário pode marcar, desmarcar ou reconfirmar OK em Manual. O dado original permanece imutável; a nova validação e seu histórico ficam em tabelas separadas, com versionamento, identidade autenticada real, data/hora e responsável pelo fluxo Wini. OK preexistente no arquivo não significa validação atribuída ao Wini. Conflitos concorrentes são rejeitados com mensagem e necessidade de atualizar, sem sobrescrever silenciosamente outra pessoa. Volumes/SYONET/integrações são somente leitura; marcar o check não envia e-mail, não entrega ao CRM e não altera contagens de Leads. A importação é idempotente por SHA256 e não apaga validações posteriores.

A revisão de UX mantém o padrão branco clean MG, organização e leitura dos gráficos/tabelas, navegação entre três módulos e modo cliente que mascara nomes pessoais na apresentação. Esse modo de privacidade é uma opção de apresentação; o controle real de acesso continua na sessão/API autenticada. Fontes ausentes continuam indisponíveis e nenhum dado fictício foi acrescentado. Edição/checkpoint não é publicação automática; o deploy anterior continua intacto até autorização ou ação de publicar.

## Lojas & CRM e atualização D-1

O controle Envios agora integra **Leads → Lojas & CRM**, mantendo o atalho superior para o mesmo banco, células e histórico. Essa aba operacional permite visualizar os responsáveis CRM reais e os status cadastrais Syonet/BBRO da planilha, com opção de ocultar responsáveis durante apresentação. O período de despacho tem filtros próprios e não herda canal/modelo/período da criação de Leads; nomes originais não são normalizados para conciliá-los silenciosamente.

Ao abrir ou atualizar, a aplicação prepara dias ausentes até D-1 em São Paulo, uma célula por loja/dia com Manual pendente. Também considera a virada de dia enquanto a aba está aberta. Novos dias sem fonte mostram volume/SYONET aguardando dados, nunca 0/OK inferidos de criação de Leads ou do status cadastral de integração. O histórico e os checks dos dias anteriores permanecem intactos. Isso é preparação do calendário durante uso da aplicação, não um ETL/agendamento autônomo.

A atualização de dados reais está disponível por upload autenticado de XLSX Envios (até 1 MiB), conciliando nomes exatos, atualizando a fonte até D-1 e auditando cada importação idempotente por hash. Novos dias futuros não entram na operação; registros históricos preexistentes não são removidos. Importar não significa marcar OK em nome do Wini nem comprovar entrega live. Nenhum conector CRM/Google de runtime foi configurado; para preencher novos volumes/status é necessário o arquivo Envios atualizado. Como ler continua ignorada e o arquivo nunca integra Git/bundle público.

## Vol. Lead sincronizado com o dashboard por dealer

A orientação atual substitui a fonte ativa dos volumes: **Vol. Lead e os totais do controle usam exclusivamente a base `v2_leads`, a mesma da Visão Geral**, por data de criação e dealer, com a mesma lógica de filtro (período/modelo/canal/campanha/dealer/busca). O XLSX Envios não alimenta contagens ou totais nessa visão. A fotografia histórica continua preservada apenas como referência cadastral de responsáveis, integrações e status recebidos, além dos OK de origem arquivo identificados como tal.

Todos os Leads do recorte entram na soma: dealers sem cadastro aparecem com seus nomes originais e sem metadados de CRM inventados; registros sem dealer/outros ficam em Leads em qualificação. O vínculo com lojas cadastradas utiliza de-para explícito, preservando aliases originais da base e sem fuzzy por marca/cidade. A preparação cria somente linhas/células ausentes para manter checks por dealer/dia; nunca grava contagens calculadas sobre a fotografia histórica, nem apaga validações/auditoria. Integração cadastrada e status SYONET não são inferidos das contagens nem comprovam automaticamente entrega ao CRM.

Em Lojas & CRM os filtros da Visão Geral são compartilhados. O atalho superior consulta a mesma base no mês corrente até D-1. Atualizar recalcula os dados do banco do dashboard: não depende de importar Envios novo para atualizar Vol. Lead. Isso não estabelece uma nova sincronização externa com Google/CRM; a carga da base do dashboard permanece a mesma já existente. Layout ampliado para ocupar a largura disponível, com colunas mais largas e controles Manual legíveis.

## Metas e acompanhamento comercial — novembro/2026

Editor **Atualizar metas** diretamente no pacing, disponível também em modo apresentação para conta autenticada. Salva número inteiro por competência (1–10.000.000) e invalida os KPIs. Cada competência é independente e auditada. A meta global importada de novembro é 16.600; metas editadas manualmente não são rateadas entre dealers.

Três uploads XLSX independentes, reutilizáveis todo mês, com preview e de-para coletivo explícito: Meta de Leads (arquivo Total Dealer), Meta de Vendas (Target to be adjusted) e Atualização de Vendas (WEEKLY_REG). Novembro importado conforme autorização, com meta de vendas 722 e vendas 0 na coluna W1_Reg/data de referência 04/11/2026. Os valores do DAILY_FUP são apenas referências, não substituem a aba escolhida. Ler uma coluna Wn_Reg por snapshot, sem somar acumulados semanais. A semana fica no status e na identidade da importação.

Os arquivos de origem não estão no código nem no bundle público. Os snapshots normalizados ficam no banco V2, imutáveis/versionados, com hash e auditoria. Reenvio idêntico é no-op; mudança do de-para gera revisão, mantendo meta manual vigente quando o conteúdo da fonte é o mesmo. Nomes por grupo/UF não recebem rateio inventado. A conciliação posterior com o cadastro oficial substitui as pendências de vínculo desta primeira importação, conforme descrito abaixo; snapshots originais continuam imutáveis. Leads continuam vindo exclusivamente da base do dashboard e seguem os mesmos filtros D-1.

## Nome público — MG Sales

Títulos, cabeçalho, login, navegação, descrição HTML, manifesto de rotas e mensagens públicas agora usam MG Sales, sem V2. Identificadores internos permanecem estáveis para preservar dados, sessão e branch autorizada. Logo MG, identificação de homologação e isolamento do dashboard original foram mantidos. A revisão heurística de UX resulta em propostas separadas; a alteração aplicada nesta etapa é somente de nomenclatura.

## Cadastro oficial e conciliação de metas

Cadastro fornecido pelo usuário com 40 unidades, em `shared/dealerRegistry.ts`. De-para separado e versionado para grafias e aliases, sem reescrever a coluna original de concessionária. UF da loja vem do cadastro oficial, não da residência do Lead. Gráficos/filtros usam a equivalência oficial; Leads recentes mantêm os valores originais. No quadro comercial, as unidades oficiais aparecem mesmo sem Leads no recorte; identificações ambíguas ou fora do cadastro permanecem em detalhe separado e entram no total, sem exclusão ou atribuição forçada.

Novembro/2026 conciliado: 31/31 linhas de MetaLeads, 33/34 de MetaVendas e 33/33 de WEEKLY_REG vinculadas. MetaLeads preservada em 16.600: 15.759 individuais e 841 coletivas. MetaVendas preservada em 722: 602 individuais, 113 coletivas e 7 na linha SINAL AV INDIANOPOLIS, fora da lista oficial. Essa pendência não foi transferida para Sinal Av. Europa. London/HG, Javep e La Fontaine têm metas de Leads coletivas; grupos de MetaVendas, como Savol e Baltic, são mostrados separadamente sem rateio inventado nem repetição por unidade. SAVOL/SP e SAVOL ZL/SP, bem como BALTIC/SP e BALTIC GUA/SP, conservam suas metas individuais diferentes.

A conciliação criou três revisões de mapeamento imutáveis e auditáveis, preservando sourceLabel, valores, arquivo/hash, data de referência, semana e vínculos originais no histórico. Repetição é no-op. Metas globais manuais, demais competências, todos os registros de Leads, checks e auditorias foram verificados intactos. A contagem de novembro (1.353) e mais cinco recortes continua igual à Visão Geral. Fonte de vendas não mudou: WEEKLY_REG/W1_Reg, 04/11/2026, total 0 real; recortes incompatíveis não recebem essa foto como vendas do período. Metas mensais de unidade/grupo não balizam recortes de canal/modelo/campanha/busca sem meta específica.

O mesmo de-para é usado em novos uploads e nos volumes do controle diário. O vínculo de contagem com uma loja oficial não migra IDs de células nem grava OK, preservando o histórico manual. A preparação de calendário continua separada de sincronização externa. Não houve alteração do dashboard original ou publicação automática.

## Inclusão autorizada de Indianópolis — cadastro com 41 unidades

Por autorização posterior expressa, Sinal Av. Indianópolis foi incluída como unidade nova e independente de Av. Europa. A pendência anterior foi resolvida: meta de vendas 7 vinculada em revisão imutável de novembro, sem alterar o valor 29 de Av. Europa. Todas as 34 linhas de MetaVendas, 31 de MetaLeads e 33 de WEEKLY_REG estão vinculadas ao cadastro oficial, conservando as metas coletivas sem rateio.

O total permanece 722 de MetaVendas (609 individuais + 113 coletivas) e 16.600 de MetaLeads. Indianópolis não recebe MetaLeads, vendas realizadas ou status CRM inventados; essas informações não estão nas fontes atuais. A unidade foi adicionada ao controle com quatro células Manual pendentes de 01 a 04/11, metadados de CRM não configurados e nenhum OK automático. A contagem de Leads e todos os checks/auditorias/metas globais existentes foram verificados intactos. O de-para também vale para uploads futuros. Edição/checkpoint não implica nova publicação automática.

## Modelos, regiões e administração

Modelos unificados em MG 4, MG Urban, MG S5, MG Cyberster e IM 6. O de-para inclui nomes abreviados e os formulários Urban encontrados na fonte. XPOWER pertence à linha MG4, confirmado nos catálogos oficiais https://mgmotoroficial.com.br/model/mg4 e https://www.mg.co.uk/new-cars/mg4-ev; a nomenclatura exibida segue a lista solicitada pelo usuário. Os campos originais de Leads e concessionárias não são reescritos.

Estados são apresentados por extenso e sem duplicidade de sigla/nome. Matriz regional usa todos os Leads filtrados, não apenas a página recente. O recorte de 01 a 04/11 soma 1.353 registros em cinco modelos e 25 estados identificados; um registro sem estado válido permanece separado. A matriz representa origem geográfica e modelo dos Leads, não comprovação de entrega CRM. Horários e Modelos foram retirados das abas.

Conta rodrigo promovida uma única vez a Administrador, preservando sua senha e sessão. Perfil Cliente recebe leitura sem controles administrativos/importações/conciliação/definição de metas/avisos técnicos; autorização também é aplicada na API. Gestão de contas protege o último administrador ativo, usa hash scrypt e versionamento de sessão. Fontes comerciais podem ser desativadas por competência com confirmação, mantendo histórico; nenhuma fonte foi removida na implementação. A meta atual de novembro foi salva manualmente após o primeiro import e permanece manual, inclusive se o arquivo de MetaLeads for desativado.

A planilha CRM mostra apenas as 40 lojas solicitadas, mantendo Indianópolis nas demais visões comerciais/cadastro com 41 unidades. O escopo da tabela e seus totais não inclui aliases, qualificação ou unidades ocultadas; esses registros permanecem na base global e no histórico. OKs originais de arquivo não substituem validação humana. Configuração avançada fica privada para rodrigo e a planilha dispõe de modo expandido.

## Navegação e edição mensal

O menu Visão Geral/Regiões/Lojas & CRM/Leads agora é único, aparece antes dos filtros e mantém posição sticky abaixo do cabeçalho cuja altura é medida dinamicamente. Botões de 48px, texto ampliado, ícones, foco e navegação por setas/Home/End; rolagem horizontal em telas pequenas. A mesma barra permanece durante carregamento/erro e na troca de abas.

Apenas rodrigo Administrador pode editar a meta mensal total de vendas, separada dos arquivos e metas das lojas/grupos. O valor é inteiro de 0 a 10.000.000, persistente/auditável por competência; nenhum override foi inserido nesta implementação. O total importado 722 continua sendo a referência até o usuário salvar outro valor. Mesma conta pode editar projeções de Leads do Plano de Mídia em total/produto/linha, com overrides versionados e recálculo de CPLs/totais dependentes. Total manual não distribui números por estimativa nos detalhes; orçamento, comissão, realizado e Leads reais permanecem intactos. Zero projetado não produz CPL infinito.

O FUP recebido foi registrado em nova versão imutável de novembro: MTD Registration 43 em DAILY_FUP/Current Month/E3, referência do nome do arquivo 05/11. WEEKLY_REG/W1 mantém total zero e valores originais por loja, sem ratear 43. O agregado geral usa MTD Registration e o cartão o identifica como geral do FUP. Leituras futuras usam o campo do arquivo, sem fixar 43 no código, sem Retail ou tabela por modelo como fallback. Referência geral 05/11 não é convertida em corte 04/11 dos Leads; conversão permanece indisponível em recortes incompatíveis. Reenvio idêntico no-op. Todos os snapshots anteriores, 1.353 Leads de novembro, meta 16.600, meta de vendas importada 722, checks, auditorias, contas e planos aprovados foram preservados.

Por nova orientação, o KPI Conversão geral passa a exibir a razão Vendas MTD do FUP ÷ Leads do período, mesmo com referências de data diferentes, identificada como comparativo geral (não coorte individual). No recorte atual: 43/1.353 = 3,18%; a meta manual de vendas 660 permanece intacta. Zero Leads/MTD ausente não gera taxa; filtros dimensionais sem vendas atribuídas não recebem conversão calculada por estimativa. A aba Lojas & CRM não mostra Filtros de Leads e usa somente seu período/filtros próprios, sem herdar modelo/canal/campanha de outras abas.

## Ajustes atuais — leitura, BBRO e filtros

Perfil BBRO tem a leitura do Cliente e pode preparar/validar Manual do controle CRM, com guardas no servidor para as 40 lojas e dias fechados até D-1. Cliente continua somente leitura; metas, usuários, uploads, exclusão de fontes e projeções não foram liberados ao BBRO. Enum de contas suporta admin/client/bbro com migration idempotente, sem criar senha ou alterar contas existentes; nenhum login bbro existia durante esta entrega. O perfil está disponível nos seletores de criar/editar usuários.

Por autorização expressa, Cliente e BBRO passam a ver os nomes dos responsáveis CRM e os nomes/informações CRM da lista de Leads, exclusivamente em sessão autenticada. Isso substitui a ocultação automática desses campos nas versões anteriores; controles administrativos, erros técnicos e informações de conciliação continuam restritos. Não foram importados e-mails, telefones ou CPF adicionais.

Removida a faixa dos quatro cartões superiores de Leads, Modelos, Dealers com Leads e CRM, sem alterar suas contagens nas demais seções. A tabela comercial oferece todas as lojas filtradas na mesma rolagem nativa, fina e neutra, com cabeçalho fixo, busca/ordenação preservadas e totais do período independentes da rolagem. A paginação da lista de Leads permanece.

Filtros de Leads incluem Mês passado, relativo ao mês civil anterior a hoje em São Paulo, inclusive virada de ano e fevereiro. Campo Campanha foi removido e não é enviado como filtro oculto. Atualizar base de Leads, ao lado de Atualizar metas, repete a consulta do banco para o período e pacing mensal com feedback; é releitura dos dados já importados, não uma nova importação ou sincronização automática com a planilha externa. Nenhuma meta, projeção, Lead ou validação real foi gravada durante os testes.

A preparação e o histórico BBRO também são restritos: não são criadas unidades fora da planilha CRM, nem células futuras; consulta de histórico verifica a mesma loja/data. O filtro de campanha da consulta visual é omitido por completo, preservando apenas a coluna informativa e compatibilidade dos serviços internos.

Por orientação posterior, a tabela Vendas e metas por concessionária da Visão Geral não exibe unidades com EM BREVE no nome oficial. O filtro ocorre somente na apresentação, antes de busca/ordenação. Cadastro completo, metas coletivas/individuais, histórico, planilha CRM e totais gerais permanecem preservados; não há exclusão ou rateio adicional.

Os atalhos de datas agora aplicam imediatamente o mesmo intervalo aos campos e à consulta. Datas/filtros manuais indicam quando ainda não foram aplicados; Buscar também funciona via Enter e mantém validação D-1. O pacing é mensal por competência, separado do total do período: a validação real de 06/10–04/11 retornou 10.721 Leads, enquanto o pacing de novembro permaneceu corretamente em 1.353. Unidades EM BREVE foram ocultadas somente da tabela comercial (37 visíveis do cadastro de 41), sem excluir registros ou recalcular metas gerais.

O novo padrão combinado DEALER/TOTAL DEALER/SALES substitui os dois campos de metas por um único upload com prévia e confirmação das duas fontes. O arquivo-modelo contém 31 linhas, meta de Leads 10.579 e meta de Vendas 591; não foi importado automaticamente e não substitui metas manuais vigentes. Atualizar vendas permanece separado para o FUP atualizado, com as regras WEEKLY_REG/MTD Registration existentes. Novos dealers identificáveis serão registrados somente na confirmação transacional, preservando rótulos e grupos sem rateio fictício.

Na validação final, a leitura do upload de vendas foi restringida à aba WEEKLY_REG, rejeitando arquivos com DAILY_FUP e outra tabela genérica no lugar da fonte correta. O preview combinado agora devolve a identificação explícita de novas concessionárias para a interface, sem cadastrar antecipadamente. A leitura real do arquivo-modelo confirmou 10.579/591 e a consulta do banco comprovou registro extra vazio (0), meta mensal de Leads manual 16.600 e meta total de vendas manual 660 preservadas. Após os dois ajustes críticos, 218 testes em 33 arquivos passaram, sem importações de teste no banco.

## Importação REAL da planilha-base — 06/11/2026

A planilha-base autorizada foi relida via conta Google Rodrigo e aplicada transacionalmente no banco deste projeto às 01:08:17 de 06/11 (America/Sao_Paulo). Entraram 498 ocorrências novas de 05/11: Site 193, Meta 236, Webmotors 30 e Mercado Livre 39. A base completa passou a 49.626 registros, novembro geral a 1.851 e Meta novembro a 1.002 (01/11=128; 02/11=232; 03/11=171; 04/11=235; 05/11=236). O total histórico Meta é 25.048, não 1.002. Modelos/dealers e campos brutos passam a ter proveniência privada no banco; 49.128 ocorrências anteriores receberam essa proveniência e valores originais de fonte, com IDs internos preservados. Conferência A:U/IDs/timestamps dos 1.002 registros Meta foi exata. Reenvio foi no-op. Hashes de 21 tabelas preexistentes não relacionadas à base permaneceram idênticos; não foram modificados metas, contas, projeções, checks ou auditorias administrativas. V/W e a planilha foram somente lidos.

O botão administrativo agora chama importação server-side real antes de consultar o dashboard e invalidar os caches de Leads/CRM. Requer **GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON**, uma credencial própria do site, habilitação da Sheets API e acesso de Leitor à base para o `client_email`. Credencial própria configurada pelo cartão seguro em 06/11/2026 e acesso somente leitura validado; não há mais pendência de configuração nesta Prévia. Não foram transferidos tokens de gws/MCP/conectores de sessão ao site. Sem a configuração o botão recusa sincronizar e mantém a carga atual; não informa um sucesso fictício. Cliente/BBRO apenas atualizam indicadores do banco. Layout de badge/ações foi separado da ajuda e do feedback, com container queries responsivas. TypeScript, build e 242 testes passaram; nenhuma publicação, projeto novo, alteração no dashboard original, cron ou envio GitHub foi solicitado nesta correção.

A conexão do servidor foi testada em 06/11/2026 às 09:02:02 America/Sao_Paulo: 740 ocorrências existentes atualizadas conforme a fonte, nenhuma inserção, contagens preservadas em 49.626 histórico e 1.851 novembro (Meta 1.002), cobertura 05/11. Segunda chamada idêntica resultou em no-op sem alterar timestamp. As 21 tabelas administrativas continuaram idênticas por hash. A credencial foi aplicada com escopo all e a Prévia reiniciada; não houve publicação nem cópia de chaves para o repositório.
