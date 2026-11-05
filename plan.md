# MG Motors — Dashboard V2 / homologação

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
