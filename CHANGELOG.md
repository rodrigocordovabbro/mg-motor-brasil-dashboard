# Registro de entregas

Este documento resume a cópia de código preparada para o GitHub. Não representa um histórico completo das tarefas anteriores nem uma confirmação de publicação do site.

## 06/11/2026 — Cópia documentada para GitHub

### Produto entregue

- Identidade MG Motor Brasil, com logo e favicons fornecidos pelo usuário.
- Navegação ampliada e persistente; abas de Visão Geral, Regiões, Lojas & CRM e Leads.
- Pacing mensal, metas editáveis e indicadores comerciais.
- Distribuição conciliada em cinco modelos e matriz por estado/macrorregião.
- Cadastro oficial de dealers e cadastro extensível por arquivos confirmados.
- Controle CRM diário, volume calculado na base de Leads e check Manual auditável.
- Perfis Administrador, Cliente e BBRO com autorização no servidor.
- Plano de Mídia com projeções mensais e recálculo de CPL.

### Ajustes mais recentes

- Upload único de metas com `DEALER`, `TOTAL DEALER` e `SALES`, prévia e confirmação transacional.
- Novo dealer identificado no preview e cadastrado apenas na transação confirmada.
- Atualizar vendas mantido separado, exigindo WEEKLY_REG e conservando MTD Registration geral.
- Unidades EM BREVE ocultadas apenas da tabela comercial.
- Atalhos de período aplicados imediatamente, com Busca/Enter para alterações manuais.
- Filtro de Campanha removido, incluindo estado oculto.
- Metas manuais existentes preservadas durante a prévia do arquivo-modelo.

### Documentação e validação

- README de produto e instalação, `.env.example` sem segredos, arquitetura, regras de negócio, acesso e operação.
- Guia de contribuição e exclusões reforçadas para arquivos privados.
- Última validação funcional anterior à documentação: 218 testes em 33 arquivos, TypeScript e build aprovados.

### Limites

- O arquivo-modelo de metas não foi importado automaticamente.
- Banco, contas, contatos de Leads, senhas, checks salvos e segredos não fazem parte da cópia GitHub.
- O repositório GitHub é uma cópia de código; o repositório canônico do projeto WebDev continua gerenciado pelo Manus.
- Envio ao GitHub não executa migrations, não configura um servidor externo e não publica o site.

## 06/11/2026 — Diagnóstico da atualização da base

O botão relia corretamente o banco, mas o snapshot não cobria o último dia do período. Foram adicionados hora de consulta, cobertura global da fonte, última importação e aviso explícito de ausência de sincronização externa. A atualização também invalida caches relacionados sem fetch duplicado, bloqueia cliques simultâneos e distingue sessão expirada/fonte ausente. Leituras independentes foram paralelizadas. Nenhum Lead ou meta foi alterado nessa correção.
