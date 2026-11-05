# MG Sales

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

Os arquivos de origem não estão no código nem no bundle público. Os snapshots normalizados ficam no banco V2, imutáveis/versionados, com hash e auditoria. Reenvio idêntico é no-op; mudança do de-para gera revisão, mantendo meta manual vigente quando o conteúdo da fonte é o mesmo. Nomes por grupo/UF não recebem rateio inventado. 68 linhas de fonte sem correspondência segura permanecem acessíveis em Metas de origem e no preview para de-para, com totais globais preservados. Leads continuam vindo exclusivamente da base do dashboard e seguem os mesmos filtros D-1.

## Nome público — MG Sales

Títulos, cabeçalho, login, navegação, descrição HTML, manifesto de rotas e mensagens públicas agora usam MG Sales, sem V2. Identificadores internos permanecem estáveis para preservar dados, sessão e branch autorizada. Logo MG, identificação de homologação e isolamento do dashboard original foram mantidos. A revisão heurística de UX resulta em propostas separadas; a alteração aplicada nesta etapa é somente de nomenclatura.
