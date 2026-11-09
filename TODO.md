# Resultados — Dashboard MG Motors V2

- [x] Novo recurso `mgmotorsv2` com banco/servidor próprios, sem anexar ou editar o projeto V1.
- [x] Origem GitHub autorizada em `dashboard-v2`, commit-base `dfad96cb1d015384d0425ce0f91ac308da0c8eb5`. Código de módulos originais preservado em `legacy/`, sem dados operacionais/credenciais. Escopo ativo limitado depois pelo usuário a Leads e Plano de Mídia.
- [x] Interface branca inspirada nos screenshots fornecidos, identidade MG e V2/homologação. Abas Leads: Visão Geral, Regiões, Horários, Modelos, Lojas & CRM e Leads. Filtros reais por período/modelo/canal/campanha/concessionária/busca; não copiar números das imagens.
- [x] Primeira aba mantém KPIs, pacing, barras diárias por canal com real/pace acumulados, distribuição e acompanhamento simplificado por dealer: Leads, metas, vendas e conversão. Sem investimento alocado ou CPL estimado nesse quadro.
- [x] Plano de Mídia preservado em aba separada com fontes, conteúdo e cálculos originais autorizados; valores servidos pela API protegida, não pelo bundle público.
- [x] Login usuário/senha solicitado, sem prefill. Conta temporária própria; senha apenas hash scrypt salted no banco isolado, nunca plaintext em código/cliente. Cookie HttpOnly/SameSite=None/Secure, JWT por appId/escopo/expiração, conta ativa, limitação de tentativas; identidade Manus/Bearer não faz bypass.
- [x] Corte padrão e máximo até ontem (D-1), America/Sao_Paulo, abertura no mês atual. Datas originais preservadas, horas ausentes não inventadas, sem redistribuir Leads. Backend rejeita datas finais futuras.
- [x] Nova planilha lida somente por conta Google autorizada. Carga inicial de 49.128 registros com datas válidas exclusivamente no banco V2. E-mail/CPF/telefone não retidos por falta de necessidade. Nenhum contato em Git/cliente/relatório; import inicial claramente distinto de atualização automática, nenhum token do conector copiado ao runtime.
- [x] Sem fonte de vendas/metas por dealer/entrega CRM na planilha: valores explicitamente indisponíveis, nunca zero/simulados. Os respectivos quadros estão implementados, mas sua conexão permanece pendente. Nenhum acesso, import/ETL, migration ou configuração da V1 executado.
- [x] Verificação real de login/API/cookie/carga/canais/dealers/plano/logout, TypeScript/build e 22 testes. Revisão read-only completada; corrigidas barras/linhas, unidade de percentual, meta multicompetência, transição logout e ausência de fontes.
- [x] Checkpoint da base inicial acd681b e GitHub dashboard-v2 d4243a6 concluídos. Checkpoint do recurso novo e push somente para dashboard-v2 no GitHub autorizado, sem force push nem alteração de main no GitHub.
- [x] Base inicial publicada em 05/11/2026 no endereço mgmotorsv2-j3tvmmae.manus.space, versão acd681b. Publicação confirmada em endereço Manus novo, privado/homologação. Informar resultado, conta temporária, conexões pendentes e V1 preservada; URL somente após publicação bem-sucedida.

## Controle de Envios + UX cliente

- [x] Adicionar Controle de Envios à V2 existente sem remover Leads/Plano de Mídia ou alterar V1. Reprodução da aba Envios somente; ignorar Como ler conforme nova orientação.
- [x] Preservar nomes, responsáveis, integrações, ordem de 41 linhas incluindo repasse não identificado, cinco grupos diários SYONET/Manual/Vol. Lead, volumes e totais originais. Não normalizar nomes, corrigir arquivo ou inferir dados de outra fonte. Dias 01–05/nov de despacho permanecem visíveis, distintos do D-1 de criação de Leads.
- [x] Manual editável por check OK para conferência do fluxo Wini, com marcar/desmarcar/reconfirmar, persistência server/banco V2 e histórico com identidade autenticada real/data/hora/versão; os sete OK preexistentes permanecem atribuídos ao arquivo, não ao Wini. Volumes/SYONET não editáveis, nenhum envio CRM/e-mail real.
- [x] Importação idempotente do XLSX autorizado somente em tabelas novas e protegidas, sem responsáveis/dados em Git/bundle público, sem apagar checks posteriores. Controle de concorrência, erros visíveis e sem falso salvamento.
- [x] Revisar UX inteira da V2 para apresentação profissional ao cliente: padrão branco MG, hierarquia, filtros/legendas, touch/responsividade/acessibilidade, navegação três módulos, modo cliente mascarando contatos pessoais. Preservar valores/fontes/cálculos/autenticação/logout/D-1; sem métricas ou gráficos fictícios.
- [x] Validar importação, totais, autenticação, persistência/auditoria e concorrência com testes isolados/mock sem marcas de teste em produção, TypeScript/build e revisão read-only focada. Checkpoint e sincronização desta alteração em andamento, registrados no próximo resultado de Git; desenvolver exclusivamente dashboard-v2 no GitHub autorizado. Publicação anterior preservada, pois o novo pedido solicita edição/UX e não publicação.

Evidência: comparação read-only de cada string/célula com o XLSX confirmada (41 linhas, 205 células, 2.506 Leads, 7 OK de arquivo), import repetido idempotente, 49.128 Leads preexistentes intactos, nenhum check/auditoria de teste criado. 34 testes aprovados, TypeScript/build e revisão read-only com correções de acessibilidade. Ajustes adicionais: tabela por dealer com busca/ordenação/paginação, preferências de privacidade, celular sem colunas cobrindo o dia, carregamento sob demanda dos três módulos e sessão de login/logout preservada.

## Lojas & CRM: clone de Envios + D-1

- [x] Renderizar o clone da aba Envios dentro de Lojas & CRM, com colunas NOME DA LOJA, Responsável por CRM, Integração Syonet, Integração API BBRO e grupos diários SYONET/Manual/Vol. Lead. Mesmas células/checks do atalho Controle de Envios; ignorar Como ler e não reler a imagem anexada.
- [x] Permitir consultar os responsáveis CRM reais por opção explícita; mostrar quem tem Syonet/BBRO integrado a partir dos status reais cadastrais da fonte, sem confundir integração disponível com entrega diária comprovada. Nomes originais preservados, sem agrupamento fuzzy ou renomeação automática.
- [x] Abrir/Atualizar prepara dias ausentes até ontem em São Paulo, com check Manual pendente por loja/dia, calendário idempotente, sem apagar checks ou histórico. Dias sem fonte mostram SYONET/volumes aguardando fonte, não OK/zero inventados; criação de Leads não é prova de despacho.
- [x] Upload protegido de Envios atualizado reconcilia nomes exatos, atualiza status/dados reais até D-1 e preserva IDs/checks/auditoria. Arquivo repetido é idempotente, payload limitado, importação atômica/auditada e sem XLSX/PII em Git. Históricos originais não apagados, dias futuros novos não importados.
- [x] Validação TypeScript/testes/build e revisão focada read-only; migrations somente V2, sem checks de teste em produção. Checkpoint + dashboard-v2 sem alterar V1/main e sem publicação automática; informar diferença entre preparação D-1 e fonte live ainda não conectada.

Evidência: 47 testes aprovados, TypeScript/build aprovados; parser real + comparação integral do Excel reenviado com banco confirmou 41 lojas e células originais idênticas. Preparação atual D-1 04/11/2026 retorna added=false/missingSource=false; volume real até D-1 2.019. Migration própria V2 executada duas vezes, idempotente; checks/auditoria real não receberam marcas de teste. Revisão frontend read-only concluída, corrigindo mensagens contraditórias de sucesso, resultados noop/futuros, retry limitado e atualização do calendário durante virada de dia/mês. Importação repetida do mesmo arquivo permite aplicar somente dias antes futuros quando viram D-1. Checkpoint e branch GitHub registrados no retorno de Git desta entrega.

## Vol. Lead da mesma base do dashboard, por dealer

- [x] O controle ativo consulta exclusivamente a base `v2_leads`/LEADS MG — Base, compartilhando lógica e filtros do dashboard geral. Volumes e totais do arquivo Envios não alimentam Vol. Lead, resumo ou rodapé. Soma dos dealers/dias deve coincidir exatamente com a Visão Geral no mesmo recorte.
- [x] Preservar cada campo original de concessionária da base. De-para cadastral explícito/persistido somente para correspondência inequívoca; mostrar dealers sem cadastro com metadados indisponíveis, sem descartar seus Leads. Sem dealer/outros aparecem como Leads em qualificação com aliases originais preservados.
- [x] Reutilizar células e checks existentes; preparar dias/novos dealers até D-1 sem apagar fonte, validações ou histórico. SYONET/integrado cadastral não é inferido de contagem de Leads e não é tratado como prova de entrega. Planilha só fornece cadastro/responsáveis/status histórico.
- [x] Em Lojas & CRM, os mesmos filtros aplicados da Visão Geral permanecem disponíveis e são enviados ao controle; atalho superior calcula da mesma base, mês atual até ontem. Atualizar consulta a base do dashboard, não depende de um XLSX novo para Vol. Lead.
- [x] Ampliar área útil para a largura da tela, colunas maiores e legíveis, texto Manual/OK/Confirmar sem truncamento, rolagem horizontal e cabeçalhos fixos responsivos. Não reler a imagem anexada com ferramentas.
- [x] Reconciliar base real e recortes, testar filtros/qualificação/de-para/ids/preservação de checks/ausência de fonte, TypeScript/build, revisão read-only. Salvar checkpoint + dashboard-v2 sem modificar V1/main nem publicar automaticamente.

Evidência final: fonte 49.128 registros preservados; controle e Visão Geral 1.353 Leads no período 01–04/11/2026, totais diários 186/330/349/488. Seis recortes reconciliados exatamente (1.353 geral, 766 canal, 537 modelo, 68 dealer, 68 busca, 488 dia único). Os 134 aliases originais de dealer foram preservados e exibidos no controle, sem exclusão de desconhecidos. Checks/auditoria reais e 205 células arquivadas com volume original permaneceram idênticos antes/depois; nenhuma marca Manual de teste criada. Revisão read-only concluída, corrigidos nulos da fonte ausente e totais de validação por recorte. 52 testes aprovados, TypeScript/build aprovados, Prévia health 200 e rotas válidas. Larguras fixas 370/230/120/120, grupos diários 100/220/105 e largura de página sem limite 1680. Checkpoint/branch confirmados nos retornos de Git; publicação automática permanece desligada.

## Meta mensal editável no bloco de pacing

- [x] Botão Atualizar metas visível no bloco de Pacing de Leads para usuário autenticado, inclusive no modo apresentação. Abrir formulário acessível com competência mensal, número de Leads e Salvar meta/Cancelar, prefilling a meta existente do mês escolhido.
- [x] Aceitar somente meta inteira entre 1 e 10.000.000; feedback de validação/erro/salvamento, Enter para salvar, campos e cancelamento bloqueados enquanto grava. Não substituir mês selecionado silenciosamente ao atualizar dados.
- [x] Salvar somente a competência escolhida em v2_lead_goals e registrar auditoria em v2_goal_audit, mantendo outras competências. Meses sem meta continuam sem meta, sem herdar mês anterior; API de leitura/gravação exige sessão V2.
- [x] Após salvar, carregar os KPIs atualizados e invalidar os recortes do dashboard: percentual/ritmo esperado/restante/necessário por dia/diferença projetada. Mostrar mês-alvo e feedback, sem falsificar Leads reais, média ou projeção. Meta global não é aplicada indevidamente ao recorte de canal/modelo/dealer/campanha/busca ou a vários meses.
- [x] Verificar cálculo, leitura/gravação/rollback/auditoria por mês com mocks/fixtures isolados, sem criar meta artificial no banco real. TypeScript/build/testes e salvar checkpoint+dashboard-v2, preservando V1/main e publicação desligada.

## Três uploads mensais comerciais + novembro/2026

- [x] No bloco comercial, uploads separados de Meta de Leads, Meta de Vendas e Atualização de Vendas, seleção de competência mensal reutilizável todo mês, preview com totais/avisos e Salvar/Cancelar. Fonte e data de atualização visíveis por arquivo; reenvio idempotente por hash não soma novamente valores.
- [x] Importar os três anexos enviados para novembro/2026 conforme autorização explícita, preservar outras competências e versões anteriores. Meta de Leads global real 16.600 atualiza pacing e KPIs; Meta de Vendas vem exclusivamente de seu próprio arquivo; Leads reais continuam na mesma base do dashboard, sem imports de contatos dos XLSX comerciais.
- [x] De-para explícito e nomes originais preservados; metas coletivas por grupo/UF não são repetidas em cada dealer nem rateadas sem dados. Dealers/grupos não vinculados permanecem visíveis nos avisos/preview, sem perder totais ou atribuir metadados inventados.
- [x] O FUP distingue Retail MTD (20 no resumo) de emplacamentos (43) e expõe divergência com o detalhamento semanal por dealer, sem distribuir vendas artificialmente. Vendas/conversão somente em recorte MTD compatível; fonte parcial/ausente permanece N/A, não zero falso.
- [x] APIs e imports protegidos, validação XLSX/limites/dealer/mês/data, escrita atômica com auditoria e rollback. Testes/TypeScript/build/reconciliação dos arquivos reais sem dados simulados na interface; salvar somente V2/dashboard-v2 e manter V1/main intactas.

- [x] Orientação atualizada: vendas por dealer vêm de WEEKLY_REG, com leitura de `Wn_Reg` e coluna/semana explícita no preview. Zeros do arquivo atual são válidos; DAILY_FUP/Retail não substitui esses valores nem distribui números artificialmente. Preservar competência de novembro e fluxo reutilizável dos próximos arquivos no mesmo formato.

Evidência — novembro: 3 fontes reais configuradas, meta de Leads 16.600 (31 grupos/UF, coluna TOTAL DEALER), meta de Vendas 722 (34 linhas, TARGET TO BE ADJUSTED), vendas WEEKLY_REG/W1_Reg 0 (33 linhas, zeros reais). Uploads repetidos retornam o mesmo importId; versões anteriores preservadas. 1.353 Leads reais reconciliados, 49.128 registros da base e checks/auditoria preservados. Campos mensais/auditoria/rollback cobertos por mocks. Compatibilidade OOXML com namespaces explícitos e cabeçalho TOTAL DEALER, sem alteração de valores/hash. Sem somar snapshots W1..W6 ou usar DAILY_FUP. Ligação exata de MetaVendas/vendas: 17 linhas, 32 aliases originais; 68 linhas comerciais sem de-para explícito preservadas na visualização/preview. Meta coletiva não rateada. Fonte WEEKLY_REG e semana persistidas na identidade/status; mudança de semana ou de-para cria versão sem perder histórico. Revisão read-only concluída, corrigida falsa duplicidade de dealer entre fontes e rejeitado fallback DAILY_FUP para MetaVendas. Prévia health/manifests 200, TypeScript/build/testes aprovados. Publicação automática segue desligada.

## Nome público: MG Sales

- [x] Remover V2 de títulos/textos públicos do dashboard, login, navegação, title/description HTML, títulos do manifesto de rotas e mensagens de erro retornadas ao usuário. Usar MG Sales como nome principal; manter logo MG.
- [x] Preservar identificação verdadeira de homologação e não publicar automaticamente. Manter dados, checks, metas, sessão, domínio/recurso e os identificadores internos; desenvolver no GitHub somente em dashboard-v2, sem alterar main ou dashboard original.
- [x] Entregar estudo heurístico de UX sob o nome MG Sales, com melhorias priorizadas e distinção entre recomendações e a renomeação efetivamente implementada; não alegar teste com usuários ou redesign já entregue.

Evidência — MG Sales: título HTML, descrição, cabeçalho, login, navegação, manifesto de rotas e mensagens públicas atualizados; nenhum V2 visível nesses textos. Identificadores internos, dados, sessão e branch preservados. TypeScript, 79 testes e build aprovados; health e manifesto retornam HTTP 200. Estudo heurístico entregue separadamente, sem implementar as demais propostas. Publicação automática segue desligada.

## Dealers oficiais e metas conciliadas

- [x] Cadastro oficial de 40 unidades exatamente como informado, com de-para separado para grafias, abreviações e aliases de Leads/MetaLeads/MetaVendas/WEEKLY_REG. Preservar todos os nomes originais nos dados e manter pendências ambíguas visíveis.
- [x] Quadro comercial por unidade oficial, incluindo unidades sem Leads no recorte, metas individuais corretas e vendas de snapshot compatível; não usar UF do cliente para decidir a unidade. Somar aliases sem duplicar Leads nem modificar registros, checks ou meta global manual.
- [x] Vincular grupos de metas a todas as unidades correspondentes, mantendo meta coletiva única, sem repetir por loja ou criar rateio não fornecido; mostrar a diferença entre meta por loja e meta por grupo. Preservar os totais dos três arquivos e informar quaisquer pendências restantes.
- [x] Reutilizar a conciliação nos próximos uploads e registrar revisão auditável de novembro; preservar snapshots originais, demais competências, fonte/semana/data de vendas e dashboard original. Verificar tipos, regressões e reconciliação real; salvar somente no recurso MG Sales e dashboard-v2, sem publicar automaticamente.

Evidências da conciliação: 40 unidades oficiais; 31/31 linhas de MetaLeads, 33/34 de MetaVendas e 33/33 de WEEKLY_REG vinculadas ao cadastro. Totais preservados: 16.600 de MetaLeads (15.759 individuais + 841 coletivas) e 722 de MetaVendas (602 individuais + 113 coletivas + 7 fora do cadastro). Snapshot W1_Reg em 04/11/2026 permanece 0. A soma de 1.353 Leads de novembro e mais cinco recortes reconciliam com a Visão Geral. Três revisões imutáveis de vínculo gravadas; repetição no-op; checksum/contagem dos Leads, checks, auditorias e metas globais intactos. TypeScript, 94 testes e build aprovados.

## Dealer novo autorizado: Sinal Av. Indianópolis

- [x] Cadastro com 41 unidades oficiais, incluindo Sinal Av. Indianópolis separada de Sinal Av. Europa, com a meta de vendas 7 do arquivo já importado. Reutilizar o vínculo nos próximos uploads; todas as linhas comerciais conciliadas sem mudar os totais 16.600/722 ou ratear grupos.
- [x] Incluir a unidade no controle por dealer com células Manual pendentes até D-1; metadados CRM/SYONET não configurados permanecem indisponíveis. Não fabricar MetaLeads ou vendas realizadas da nova unidade. Preservar os demais registros/checks, validar e salvar a atualização no MG Sales e dashboard-v2, sem publicação automática.

Evidências da inclusão: 41 unidades; 34/34 linhas de MetaVendas, 31/31 de MetaLeads e 33/33 de WEEKLY_REG com vínculo. Indianópolis recebe meta de vendas 7; Av. Europa conserva 29. Nenhuma MetaLeads, venda realizada ou integração CRM foi fabricada para a nova unidade. Quatro células Manual pendentes criadas até D-1; Leads, checks, auditorias e metas globais preservados. 95 testes e TypeScript aprovados.

## Modelos conciliados

- [x] Distribuição e filtros unificados em MG 4, MG Urban, MG S5, MG Cyberster e IM 6; aliases 4/MG4, MG 4 Urban/4 URBAN/formulários Urban, S5, Cyberster e IM6 agrupados corretamente. MG Urban não deve se misturar com MG 4.
- [x] Mesma seleção de modelo no dashboard e controle por dealer, com soma por canal/dia/dealer igual ao total do recorte. Nomes e campos originais dos Leads/concessionárias permanecem intactos; não inventar categoria para valor ambíguo, nem modificar registros/checks/metas.
- [ ] Validar o de-para e seus filtros com fixtures isoladas e reconciliar os totais reais da base. Salvar no MG Sales e em dashboard-v2 sem alterar a main do GitHub, o dashboard original ou a publicação atual.

## Regiões, fontes e controle de usuários

- [x] Aba Regiões com estados únicos por extenso e contagem correta de unidades federativas, reunindo siglas e grafias equivalentes. Estado não identificável fica em categoria separada, sem inferir estado pelo dealer nem excluir Leads. Acrescentar abaixo de Leitura regional a visão de Leads por modelo e região, com alternância por estado, volumes reais e percentuais legíveis usando os mesmos filtros. A visão não comprova envio ou entrega CRM. Remover as abas Horários e Modelos, mantendo a distribuição resumida de modelos na Visão Geral.
- [x] Cada fonte comercial mensal configurada oferece exclusão confirmada e reversível por competência; remover somente a fonte ativa, preservar seu histórico e evitar reativar versões anteriores. Não executar exclusão real durante implementação/testes. Reenvio autorizado permite restaurar fonte; meta de Leads manual não é apagada junto com arquivo importado.
- [x] Conta existente rodrigo como Administrador por autorização explícita. Controle de usuários permite criar contas, definir Administrador/Cliente, ativar/desativar e redefinir senha sem exibir hash/senha armazenados. Preservar login/cookies existentes e impedir perda do último administrador; perfis vêm do banco, não do navegador/JWT, e redefinição de senha revoga sessões anteriores.
- [x] Cliente tem leitura do dashboard sem importações, conciliação/de-para, definição de metas ou avisos técnicos; não pode executar alterações administrativas, importar/excluir fontes, editar metas ou marcar checks pela API. Administrador tem controles operacionais e de usuários. Estado de falha de carregamento para cliente é genérico, sem ocultar que os dados estão indisponíveis. Nenhuma restrição depende apenas de ocultar botões.
- [ ] Migrations aditivas próprias do MG Sales, idempotentes e finitas; dados/contas existentes e Leads/checks/metas/snapshots preservados. Testes usam fixtures e não contas, metas, exclusões ou checks falsos no banco real. Salvar a entrega no recurso existente e exclusivamente em dashboard-v2, sem nova publicação automática nem alterar main/V1.

## Planilha CRM simplificada

- [x] Mostrar somente as 40 lojas da última lista do usuário, na ordem informada e com volumes da base de Leads, excluindo apenas desta visão Indianópolis, linhas sem dealer oficial, aliases duplicados e qualificação. Não excluir Indianópolis do cadastro comercial/metas nem apagar dados/checks das linhas ocultadas. Totais da planilha referem-se às lojas exibidas, sem apresentá-los como total global dos Leads.
- [x] Parte superior de seleção, filtros avançados e metadados disponível apenas para a conta rodrigo administradora. Remover cartões de OKs do arquivo, linhas da tabela e contadores auxiliares. Manual mostra OK somente quando houver validação humana salva; os OKs originais do arquivo ficam preservados como fonte histórica, mas não contam como validação humana automática.
- [x] Botão Expandir planilha com tela ampla para leitura/preenchimento, botão de fechar e saída por Escape, sem perder filtros/checks nem mudar permissões: cliente continua somente leitura; administrador pode validar. Restaurar rolagem/foco ao sair da tela ampliada.

Evidências finais: 128 testes, TypeScript e build aprovados. Recorte 01–04/11 com 1.353 Leads, cinco modelos conciliados, 25 estados identificados e um registro sem estado. CRM com exatamente 40 lojas e total do próprio escopo 1.261; total global 1.353 preservado. Conta rodrigo Administrador sem alteração da senha ou da versão de sessão. Checks, auditorias, metas, contas e snapshots reais mantidos intactos; nenhuma exclusão de fonte ou conta de teste foi executada. Salvamento remoto será confirmado pelo checkpoint e pela branch autorizada.

## Navegação fixa e meta total de vendas

- [x] Menu Visão Geral, Regiões, Lojas & CRM e Leads sempre no mesmo lugar nas diferentes abas e visível durante rolagem, logo abaixo do cabeçalho, sem sobreposição. Botões/textos/espaçamentos maiores, área de toque mínima de 48px e foco acessível; em telas pequenas a barra pode rolar horizontalmente sem desaparecer. Mantê-la também nos estados de carregamento/erro.
- [x] Conta rodrigo administradora pode editar somente a meta mensal total de vendas no indicador, com número inteiro 0–10.000.000 e salvamento persistente/auditável por competência. Não alterar arquivos de MetaVendas nem metas individuais/coletivas das lojas, nem ratear diferença. Cliente e outras contas não editam. Sem override, usar meta total importada; manter regras de metas não aplicáveis a recortes por modelo/canal/dealer/campanha/busca ou várias competências. Não inserir meta real nem de teste durante implementação.

- [x] Vendas gerais usam sempre MTD Registration do bloco Current Month de DAILY_FUP. No arquivo atual o valor E3 é 43; ler o campo nos próximos arquivos, sem fixar 43 no código. WEEKLY_REG continua como fonte individual das lojas e zeros reais não são substituídos por rateio. Preservar a referência do arquivo (05/11) separada do corte D-1 de Leads (04/11), sem apresentar comparação de conversão com períodos incompatíveis. Não usar Retail, Last Month MTD, percentuais ou soma da tabela por modelo como substituto. Registrar a atualização real recebida em nova versão auditável, sem alterar as metas manuais ou arquivos anteriores.

- [x] rodrigo Administrador pode editar Leads projetados do Plano de Mídia por competência, no total e nos níveis de produto/canal existentes. Salvar overrides auditáveis separados do plano original e recalcular CPLs/totais dependentes, sem alterar orçamento/comissão/investimento realizado nem Leads reais ou meta real de Leads. Um total manual não deve inventar rateio pelos níveis inferiores; mostrar que os detalhes permanecem preservados. Cliente e outras contas ficam somente leitura. Projeção zero produz CPL indisponível, não infinito; meses e versões anteriores preservados.

Evidências desta entrega: 159 testes, TypeScript e build aprovados; MTD geral 43 do FUP em nova versão imutável e reenvio no-op. Leads, checks, auditorias, metas 16.600/722, contas e planos aprovados preservados; tabelas de overrides permanecem vazias até edição do usuário. Chaves transacionais corrigidas para primeiro salvamento concorrente.

## Conversão geral solicitada

- [x] Calcular o indicador geral como Vendas gerais MTD ÷ Leads reais × 100, com duas casas decimais: 43 ÷ 1.353 = 3,18%. Informar no cartão que é razão comparativa do FUP pelos Leads do período, sem afirmar conversão de coorte/vínculo individual. Referências de arquivo/período permanecem visíveis; não esconder o cálculo geral apenas porque a referência do FUP é 05/11 e o corte de Leads 04/11. Com zero Leads ou vendas ausentes, continuar indisponível; zero vendas conhecido é 0,00%. Filtros dimensionais sem vendas atribuídas continuam sem taxa específica. Não alterar a meta total manual de vendas 660 salva pelo usuário, nem quaisquer números/arquivos/checks.

- [x] Na aba Lojas & CRM, retirar o painel Filtros de Leads (início/fim/modelo/canal/campanha/concessionária/busca e atalhos). Manter o painel nas demais abas; CRM mantém seus controles próprios de período/loja/status e D-1, sem herdar silenciosamente filtros de modelo/canal/campanha de outras abas.

- [x] Plano de Mídia ocupa a mesma largura total disponível das outras abas, sem max-width centralizador; manter margens de segurança e adaptação móvel. Preservar projeções manuais de 16.600 e os cálculos salvos pelo usuário.

Verificação desta correção: 164 testes, TypeScript e build aprovados; consulta real somente leitura confirmou conversão 3,18%, meta manual 660 e projeção do Plano de Mídia 16.600 preservadas.

## Logo MG enviado

- [x] Usar logo-mg-horizontal.svg original no cabeçalho e no login do MG Sales, com proporção preservada e contraste adequado. Não substituir ou reconstruir o símbolo; não alterar dados, metas ou projeções. A conexão canônica GitHub foi cancelada pelo usuário; manter Manus e não reabrir a confirmação nem transferir código para outro destino sem nova solicitação.

- [x] Identificação pública passa a MG Motor Brasil — Acompanhamento de resultados na marca/cabeçalho e tela de acesso, com o logo enviado. Manter fluxo de login seguro e campos sem preenchimento programado; atualizar título da página e identificação pública correspondente. Não renomear bancos, branches ou identificadores internos.

- [x] Favicon MG gerado da imagem fornecida, com versões ICO/PNG e ícone Apple; logo branco no login escuro, vermelho no cabeçalho claro e variante preta disponível. Preservar proporção e desenho do símbolo original. Não reabrir a transferência GitHub cancelada.

Identidade validada: SVGs com proporção original, favicons íntegros e servidos com HTTP 200, título atualizado; 164 testes, TypeScript e build aprovados. Nenhuma nova transferência GitHub após cancelamento.

## Remoção da faixa de cartões indicada

- [x] Remover da Visão Geral a faixa Leads, Modelos, Dealers com Leads e CRM. Preservar pacing mensal, KPIs comerciais, conversão, gráficos, filtros e menu fixo; não alterar dados, metas ou projeções. Manter a conexão GitHub cancelada e salvar somente no repositório Manus.

- [x] Tabela de unidades/dealers na Visão Geral com rolagem interna de altura limitada, barra fina e discreta, cabeçalho fixo e acesso por teclado. Preservar busca, ordenação, valores e totais; não introduzir scrollbar customizado pesado ou desenho chamativo.

## Perfil BBRO e visibilidade autorizada

- [x] Criar perfil BBRO igual Cliente para leitura, com exceção de poder marcar/desmarcar e salvar Manual em Lojas & CRM, com autoria, data/hora e controle de concorrência existentes. Não liberar metas, uploads, exclusão de arquivos, projeções ou usuários. Validar permissões também no servidor.
- [x] Mostrar nome do responsável por CRM na tabela de lojas para Cliente e BBRO. Liberar nomes e informações de CRM na lista de Leads para ambos, conforme pedido expresso, preservando restrições administrativas e autenticação. Perfil BBRO disponível para seleção na gestão de usuários; não criar senha arbitrária.

- [x] Adicionar atalho Mês passado aos filtros, cobrindo primeiro e último dia do mês anterior no calendário de São Paulo, inclusive virada de ano. Remover campo de seleção Campanha e limpar campanha dos filtros aplicados para não existir filtro oculto; manter demais campos e o limite D-1.

- [x] Adicionar Atualizar base de Leads junto a Atualizar metas no pacing. Reexecutar a consulta autenticada do dashboard e do acumulado mensal na base já importada, com estado de carregamento, sucesso/erro e preservação dos filtros e metas. Não afirmar sincronização com planilha externa nem nova importação quando ocorrer somente releitura do banco.

Validação final desta entrega: 186 testes, TypeScript e build aprovados; Prévia HTTP 200. Perfil BBRO disponível sem criação de senha ou conta inexistente. Código aceito no repositório Manus, sem transferência GitHub nem publicação automática.

## Unidades EM BREVE na tabela comercial

- [x] Não exibir unidades cuja denominação oficial contenha EM BREVE na tabela Vendas e metas por concessionária da Visão Geral, inclusive ao buscar/ordenar. Preservar cadastro completo, origens, metas coletivas, Leads, validações e totais gerais; não alterar a planilha CRM ou outras abas por esta solicitação. Salvar no Manus, mantendo transferência GitHub cancelada e publicação automática desativada.

## Correção dos filtros de datas

- [x] Atalhos 7/14/30/60 dias, Mês e Mês passado atualizam os campos e aplicam imediatamente o período na consulta, sem manter resultados do período antigo sob um atalho novo. Buscar aplica as datas escolhidas manualmente, preservando demais filtros e limite D-1; validar datas inválidas/invertidas com mensagem e preservar a competência mensal do pacing independentemente do período geral.

## Upload único de metas comerciais

- [x] Um único campo XLSX para o novo padrão de metas de Leads e metas de Vendas por concessionária, com competência, prévia dos dois totais/de-para e confirmação única. Gravar as duas fontes atomicamente e auditar, sem duplicar metas coletivas ou repetir arquivo idêntico. Preservar regras existentes de metas manuais e não importar automaticamente o arquivo usado como modelo.
- [x] Manter Atualizar vendas como upload separado para o FUP mais recente, com WEEKLY_REG por loja e MTD Registration para o geral; preservar arquivos/histórico atuais até confirmar novo upload e manter permissões administrativas (Cliente/BBRO sem upload).

- [x] Na confirmação de metas ou FUP, cadastrar novos dealers identificáveis no arquivo em registro persistente, usando a mesma transação da importação, sem duplicar aliases/unidades existentes. Exibir novos candidatos no preview, sem gravar antecipadamente. Manter grupos/coletivos sem virar loja ou rateio fictício; preservar rótulos, UF válida, origem e auditoria. Contabilizar novas unidades no dashboard/comercial/filtros sem inventar Leads ou status CRM; manter o escopo CRM/BBRO de 40 lojas.

Validação técnica desta entrega: 218 testes em 33 arquivos, TypeScript e build aprovados. Preview do modelo validado sem importação; cadastro extra vazio e metas manuais 16.600/660 preservadas. Código aceito no repositório Manus. Não foi disponibilizada confirmação separada do registro no histórico de versões; não houve publicação ou transferência GitHub.

## Cópia GitHub documentada autorizada em 06/11/2026

- [ ] Enviar a versão atual pela integração ao repositório indicado pelo usuário, digocordova83-cyber/v2-mgmotor, exclusivamente em dashboard-v2; manter o repositório canônico Manus e não reabrir a transferência canônica cancelada. Não alterar main do dashboard antigo nem fazer force push. Cópia de código sem histórico interno, banco, senhas, contatos, planilhas ou exports.
- [x] Documentação completa em português: README, instalação, variáveis de ambiente de exemplo sem segredos, arquitetura, regras e cálculos, perfis, SQL/migrations, operação/deploy, contribuição e registro de entrega. Distinguir código enviado, infraestrutura própria e fontes sem sincronização automática; não criar senha padrão ou seed fictício. Validar links internos e conteúdo antes do envio.

## Verificação de Atualizar base — 06/11/2026

- [x] Corrigir atualização da base já importada para fazer leitura protegida atual, invalidar caches de Leads e CRM sem requisições duplicadas, preservar filtros/metas/checks e não informar sucesso se a fonte estiver ausente ou a API falhar. Evitar cliques concorrentes e feedback de competência anterior; identificar sessão expirada.
- [x] Mostrar hora da consulta, última importação, último dia disponível e aviso quando a base não cobre o período solicitado. Não apresentar releitura do banco como importação de Google Sheets, mudança de importedAt ou novos registros externos; conexão runtime de importação ainda não configurada. Otimizar leituras independentes em paralelo. Testar somente com fixtures/mocks e diagnosticar dados reais somente leitura.

Validação da correção: 226 testes em 34 arquivos passaram; TypeScript e build aprovados. Base real somente lida: 49.128 registros, último dia 04/11/2026, novembro 1.353, última importação 05/11/2026. Nenhuma nova importação externa ou alteração de metas/checks executada.

## Planilha-base real e cabeçalho de pacing — 06/11/2026

- [x] Atualizar realmente v2_leads a partir da planilha LEADS MG — Base, usando a conta Google já autorizada pelo gws; importar todos os canais suportados preservando datas históricas, nomes/IDs/timestamps/modelos/dealers originais e ocorrências manuais. Não deduplicar por ID: chave de ocorrência por aba/linha e histórico de cargas. Validar Meta novembro 1.002 linhas: 128/232/171/235/236 de 01–05/11, sem confundir com os demais canais ou histórico; nenhuma escrita em Sheets/V/W, metas, contas ou checks.
- [x] Ligar Atualizar base à importação server-side real com credencial própria segura do Google Sheets, não MCP/gws/token de conector da sessão. Exigir perfil administrativo para importação; clientes e BBRO não escrevem fontes. Identificar precisamente a credencial necessária e usar cartão seguro para configuração se não disponível. Só informar sincronizado após commit de banco confirmado; preservar fonte anterior em falha, idempotência e concorrência.
- [x] Corrigir badge Abaixo do ritmo e botões Atualizar base/Atualizar metas no mesmo grupo alinhado, ajuda/resultado em linha independente sem sobreposição, corte ou overflow; responsivo 320px/768px/desktop. Manter identidade MG e KPIs. D-1 America/Sao_Paulo continua padrão. Invalidar Leads+CRM após importação, mostrar timestamp e cobertura reais. Salvar versão no Manus, sem agendamento, novo projeto, modificação do dashboard antigo ou publicação automática.

Evidência: carga real concluída às 01:08:17 de 06/11 (São Paulo), 498 ocorrências novas, 49.626 histórico, 1.851 em novembro, Meta 1.002. A:U/IDs/timestamps Meta iguais à planilha; IDs internos preservados, reenvio no-op e hashes de 21 tabelas administrativas idênticos. APIs administrativas e tratamento de configuração/falha implementados; Credencial própria configurada pelo cartão seguro nos escopos aplicáveis e acesso Leitor validado em 06/11/2026. Layout responsivo separado da ajuda e feedback. TypeScript, build e 242 testes passaram. Código será salvo no Manus sem publicação.

Conexão concluída em 06/11/2026: teste real do mesmo serviço usado pelo botão às 09:02:02 (São Paulo), 740 registros existentes atualizados da fonte, 0 inseridos, 49.626 histórico, novembro 1.851 (Meta 1.002). As 21 tabelas administrativas permaneceram idênticas por hash. Segunda chamada mudou 0 linhas e manteve o timestamp, comprovando idempotência. Prévia reiniciada com a credencial do ambiente; health/manifesto HTTP200. Nenhuma chave/token em código, logs ou Git; nenhuma publicação.

## Modelos fora da página inicial — 06/11/2026

- [x] Remover somente o cartão Distribuição por modelo da Visão Geral/página inicial e aproveitar o espaço sem deixar um cartão vazio. Preservar filtros de modelos, matriz regional, Leads, contagens, metas, integração Google e demais indicadores; não publicar nem alterar o dashboard antigo.

## Aba Modelos e totais diários

- [x] Criar aba Modelos no menu fixo, com distribuição, detalhamento por modelo/versão e cobertura de classificação; respeitar os mesmos filtros de período, canal/dealer/busca e D-1. Usar MG 4, MG Urban, MG S5, MG Cyberster, IM 6 já conciliados; preservar o valor original e classificar todos os registros em modelo reconhecido ou Não identificado, sem perder Leads ou inferir versões não informadas. Mostrar versão não informada separadamente e detalhes de origem para administradores sem expor contatos ou credenciais.
- [x] Mostrar um total acima de cada barra empilhada do gráfico Leads por dia e canal, uma vez por dia e não por segmento; refletir exatamente o total do servidor e manter linhas de acumulado/pace, legenda e responsividade.

Evidência: TypeScript/build e suíte de 258 testes aprovados antes da revisão; após corrigir origem, navegação e período vazio, 52 regressões afetadas passaram. Leitura real de novembro soma 1.851 registros em cinco modelos e mantém as somas por versão. Nenhuma escrita em dados reais ou nova importação nesta entrega.

## Largura integral do Plano de Mídia e ocultação de Modelos — 06/11/2026

- [x] Plano de Mídia ocupa toda a largura disponível como os outros módulos, sem limite centralizador e sem duplicação de margens; fontes, KPIs, gráficos, tabela e espaçamentos harmônicos em zoom 100%, com adaptação para telas menores e rolagem da tabela contida. Preservar valores, fontes e edição de projeções manuais.
- [x] Ocultar a aba Modelos no menu e na renderização; normalizar acesso antigo tab=models para Visão Geral e remover a rota declarada. Preservar componente, dados, categorização, filtros de modelo, matriz regional, contagens e totais diários. D-1 São Paulo e permissões intactos; sem importação, publicação ou alteração do dashboard antigo.

Evidência: TypeScript, 43 regressões focadas, suíte completa de 268 testes em 39 arquivos e build aprovados; health e manifesto HTTP 200. Testes usam mocks/fixtures, sem escrita real. Diferença com a V1 investigada somente leitura: V2 atual 1.851 contra 1.843 da imagem; regras de data/identidade do código legado diferem, mas ainda sem prova da origem exata dos oito registros. Nenhum total foi artificialmente ajustado nem houve nova sincronização.

## Mesma regra de Leads da versão antiga — 06/11/2026

- [x] Aplicar no dashboard atual as regras verificáveis de data analítica, deduplicação por conteúdo e ciclo de canais da versão antiga, sem número fixo ou ajuste artificial de oito registros. Usar seleção única no servidor para total, pacing, gráfico diário/acumulado, modelos/regiões, dealers, paginação e volumes CRM, com filtros e D-1 São Paulo preservados.
- [x] Preservar todos os registros físicos, proveniência, IDs, sincronização manual, metas, fontes comerciais, projeções e validações/checks; não apagar linhas, alterar Sheets ou dashboard V1. Validar paridade e resultado real somente leitura, com limitações explícitas se a fotografia/transformação original não estiver disponível. Salvar no Manus sem publicação ou novo agendamento.

Evidência: transformador V1 localizado no histórico autorizado e reproduzido por aba. Consulta real da seleção compartilhada produziu 1.843 em 01–05/11/2026, dias 188/321/359/483/492, exatamente a referência. Meta 997, Site 618, Webmotors 110, Mercado Livre 118; 49.626 linhas físicas mantidas. TypeScript, build e suíte de 282 testes em 40 arquivos aprovados; 13 regressões novas da regra e regressão CRM com deduplicação/preparação/check intacto. Cache seguro invalidado por versão da importação; nenhuma chave privada, contato ou hash em respostas/cliente. Saúde e manifesto HTTP 200. Não houve migração, importação ou escrita em dados reais.

Revisão final: cache inclui inputSha256 para duas cargas no mesmo segundo; calendário JS com dia de um dígito não desloca a data; aliases do cadastro extra são compartilhados também em CRM/preparação. Após essas correções, 34 testes afetados (15 de contagem, 10 CRM, 3 preparação diária, 6 cadastro) passaram, TypeScript/build final aprovado e nova consulta real permaneceu 1.843 com os mesmos cinco totais diários. E-mails/telefones privados e proveniência não são acrescentados à API pela regra de contagem; o contrato anterior de nomes não foi expandido nesta tarefa.

## CRM igual à aba Envios — 06/11/2026

- [x] Alinhar responsáveis, integrações, SYONET diário e Manual de origem ao XLSX autorizado de 01–05/11; manter o padrão de layout e a mesma distribuição por dealer/dia. Não usar Vol. Lead do arquivo como fonte de Leads nem ajustar contagens artificialmente.
- [x] Resolver aliases por de-para explícito e evidenciado, com nomes originais de Leads intactos; incluir Leads em qualificação/repasse no CRM e reconciliar total e diário ao dashboard D-1. Explicar que o total geral estava correto e a distribuição apresentada tinha diferenças.
- [x] Importar de modo idempotente e transacional sem excluir Leads, linhas/células, checks ou histórico; preservar versões e autoria, distinguir OK do arquivo de validação Wini e aplicar a precedência temporal de fonte atualizada versus conferência futura. Parser aceita conteúdo efetivo válido, sem perder vazios ou confundir com zeros. Registros pessoais, planilha e snapshots fora do Git. Sem alterar V1, metas ou publicação.

Evidência: importação real de 41 linhas/5 dias; 49.626 Leads físicos, cinco checks e seis eventos de auditoria idênticos antes/depois. Nova conferência de 205 células não encontrou diferenças em volumes, SYONET, Manual, nomes, responsáveis ou integrações. CRM/base/Envios totalizam 1.843, dias 188/321/359/483/492; linha de qualificação incluída. Aliases exatos sustentados pelo de-para histórico autorizado e unidades atuais do Envios, sem fuzzy, UF residencial ou rateio de grupos. TypeScript, 294 testes em 40 arquivos e build aprovados; health/manifesto HTTP 200. Salvamento remoto pendente: addon do workspace em recuperação e helper Git ausente; não foi feito push, publicação nem alteração de credenciais.

Revisão de borda: dealers não conciliados/genéricos ambíguos com Leads positivos permanecem na resposta CRM; aliases da mesma unidade consolidam volumes sem duplicar controles, mantendo IDs/validações e escopo expresso. Dois testes novos, 36 testes afetados, TypeScript/build e reconferência real sem nova importação aprovados; 205 células continuam idênticas e total 1.843. O salvamento remoto segue pendente enquanto o addon não recupera o helper, sem contornar credenciais.

## Atualizar base realmente e informar cobertura — 08/11/2026

- [x] Identificar por que o botão não avança a base além de 05/11; conferir acesso/fonte e executar a mesma importação autorizada até D-1, sem novos números manuais, remoção de Leads ou alteração V1/Sheets.
- [x] Corrigir falhas confirmadas e mostrar erro/ausência de dados honestamente, sem sucesso fictício nem tratar dias ainda não carregados como resultado zero. Dashboard e CRM consultam a mesma base após atualização, sem queries duplicadas desnecessárias.
- [x] Preservar IDs, proveniência, checks/auditoria CRM, metas e permissões; testes com mocks sem gravações reais. Dados pessoais, snapshot e segredos fora do Git. Salvar sem publicação automática, sem configurar cron nesta correção.

Evidência: base sem nova importação desde 06/11, cobertura só até 05/11. Conexão e mutação funcionaram na reprodução; carga real confirmou 1.055 inserções/1.180 atualizações em 49.737 ms, 50.681 linhas físicas. Não se reproduziu erro específico do clique anterior nem se atribuiu timeout sem prova. Sincronização otimizada grava somente delta com lock/transação/auditoria preservados; repetição idêntica foi noop em 13.220 ms, sem nova importação. Cinco checks/seis eventos de auditoria CRM idênticos por assinatura; dashboard e CRM conferem 2.795 até 07/11, dias 188/321/359/483/502/540/402, com dez Leads tardios em 05/11. D-1 exclui 08/11 dos indicadores. Busy/erro/cobertura explícitos; dias sem carga nulos, canal sem Lead em dia coberto zero real. TypeScript, 303 testes em 40 arquivos, revisão read-only e build aprovados; ajuste final de canal coberto revalidado em 17 testes e build. Sem nova credencial, cron, acesso direto Meta ou publicação.

## Retail MTD do FUP e progresso do XLSX — 08/11/2026

- [x] Importar o total geral de vendas pelo valor Retail no bloco Current Month da aba DAILY_FUP; para o arquivo anexado, DAILY_FUP!F3 é 84. Esse campo representa Retail e não inclui Test Drive nem Direct Sales; não somar essas categorias e não usar MTD Registration como total Retail. Exibir data do snapshot e deixar Retail MTD agregado separado da distribuição por concessionária, sem atribuir valor geral a uma loja.
- [x] Ao selecionar .xlsx de até 1 MiB, mostrar barra real de progresso de 0 a 100% enquanto o navegador lê/prepara o arquivo. Desabilitar prévia durante a leitura e habilitar confirmação de importação somente depois de prévia válida. Durante processamento no servidor, manter estado ocupado sem inventar percentuais; erros/cancelamento liberam os controles para nova tentativa sem permitir importar arquivo parcial.
- [x] Preservar fonte semanal por dealer, Leads, cortes, IDs e histórico comercial, checks CRM e perfis. XLSX e dados pessoais fora do Git; não tocar V1 nem publicar automaticamente. Atualizar o arquivo atual só após validar a regra e preservar/expor os dealers não conciliados, sem rateio artificial.

Evidência: Retail 84 persistido na nova versão imutável 180001, com referência 08/11 e corte D-1 07/11; versão 150001 e 33 linhas/vínculos mantidos. Comparação de assinaturas comprovou Leads físicos 50.681, metas e checks/auditoria CRM intactos; reenvio igual foi idempotente. Retail geral 84 confirmado em leitura e total/conversão de modelo indisponíveis; Registration 90 permanece apenas referência, sem fallback de registros antigos ou soma semanal. Migração aditiva sem backfill aplicada. Oito testes de progresso/erros/concorrência/unmount; 320 testes/41 arquivos, TypeScript, build e revisão read-only aprovados; health e manifesto HTTP 200. Sem arquivo de dados ou segredo no Git, sem V1/publicação.
