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
- [ ] Checkpoint do recurso novo e push somente para dashboard-v2 no GitHub autorizado, sem force push nem alteração de main no GitHub.
- [ ] Publicação confirmada em endereço Manus novo, privado/homologação. Informar resultado, conta temporária, conexões pendentes e V1 preservada; URL somente após publicação bem-sucedida.
