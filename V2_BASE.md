# MG Motors — Dashboard V2

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
