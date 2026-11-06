# Contribuição e manutenção

## Princípios

Faça mudanças pequenas, revisáveis e vinculadas a um resultado do produto. Preserve rótulos originais de arquivos e o histórico de fontes. Não altere dados reais apenas para verificar uma implementação.

Esta cópia do código usa a branch `dashboard-v2` no repositório `digocordova83-cyber/v2-mgmotor`. Não use o repositório antigo, sua `main` ou o Git de outro serviço como destino. Não use force push. O projeto Manus permanece independente desta cópia: commit ou push no GitHub não publica o site.

## Preparação

1. Leia o [README](README.md) e os guias em [docs](docs/ARQUITETURA.md).
2. Use Node.js 22 e pnpm 10.18.0.
3. Instale com `pnpm install --frozen-lockfile`.
4. Configure somente um banco isolado de desenvolvimento e segredos próprios.
5. Antes de editar, confira `git status` e preserve trabalho concorrente.

## Onde implementar

| Tipo de mudança | Local |
| --- | --- |
| Layout, filtros, estados e acessibilidade | `client/src/` |
| Regras de cálculo e persistência | `server/` |
| Autorização de endpoints | `server/routers.ts` e serviços de permissões |
| Contratos e conciliação | `shared/` |
| Alteração de schema | `drizzle/` e runner revisado em `server/migrate*.ts` |
| Documentação | `README.md`, `docs/`, `CHANGELOG.md` |

Não use `legacy/` como aplicação ativa. Evite criar um segundo cálculo de KPI no frontend quando já há uma regra no servidor.

## Validação antes de salvar

```bash
pnpm check
pnpm test
pnpm build
git diff --check
```

Formate somente os arquivos alterados quando possível:

```bash
pnpm exec prettier --write caminho/do/arquivo.ts
```

A suíte existente usa fixtures e mocks. Novos testes devem continuar sem gravar no banco real. Uma migration ou import executado manualmente é uma mudança de dados, não apenas uma verificação de código.

## Regressões importantes

Ao mudar cálculos ou uploads, preserve:

- D-1 no calendário de São Paulo e independência entre período geral e competência mensal.
- Zero real versus `null`/indisponível.
- Metas coletivas sem duplicação ou rateio implícito.
- Valores e nomes originais da fonte, incluindo aliases conciliados.
- Metas manuais e projeções mensais já salvas.
- Transação única para fontes combinadas e novos dealers.
- Idempotência, autoria e controle de concorrência dos checks Manual.
- WEEKLY_REG como fonte de vendas por loja, sem somar snapshots semanais.
- Separação entre MTD Registration geral e a distribuição de vendas por dealer.
- Permissões de Administrador, Cliente e BBRO também no servidor.

## Banco e migrations

Uma mudança de schema deve ser aditiva quando possível, com documentação de pré-requisitos, idempotência e efeito esperado. Revise a ordem das tabelas e a dependência de migrations anteriores. Não execute `db:push` indiscriminadamente; as tabelas customizadas possuem SQL e runners próprios.

Nunca conecte uma instalação experimental ao banco de produção. No ambiente Manus gerenciado, desenvolvimento e publicação podem compartilhar o mesmo banco: gravações são reais.

## Checklist de revisão

- [ ] A mudança atende ao pedido sem acrescentar dados simulados na interface.
- [ ] A API valida entradas e autoriza a operação no servidor.
- [ ] Estados de vazio, erro e carregamento continuam compreensíveis.
- [ ] O comportamento móvel, rolagem e foco de teclado foram considerados.
- [ ] Tipos, testes afetados e build passaram.
- [ ] Nenhuma credencial, planilha, export de Leads ou dump foi incluído.
- [ ] Documentação e regras de negócio estão atualizadas.
- [ ] O destino Git e a branch autorizada foram conferidos antes do push.

## Segurança e incidentes

Não publique dados pessoais ou segredos em Issues, Pull Requests, logs ou exemplos. Registre apenas informações técnicas redigidas e comunique o responsável pelo sistema por canal privado. Se uma credencial for exposta, sua remoção do arquivo não basta: rotacione-a e avalie o histórico Git.

## Dependências

Preserve `pnpm-lock.yaml`, `pnpm-workspace.yaml` e os patches. Não troque gerenciador de pacotes nem habilite scripts de instalação desconhecidos para contornar um erro. Documente atualizações de dependências junto com a validação afetada.
