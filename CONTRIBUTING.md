# Contribuição e manutenção

> Documentação vigente revisada em **09/11/2026**. Comece pelo [README](README.md) e pelos [guias técnicos](docs/ARQUITETURA.md). `plan.md`, `TODO.md` e `V2_BASE.md` preservam decisões e evidências datadas; instruções antigas nesses registros não substituem os guias atuais.

## Repositório e branches

O repositório canônico conectado ao projeto WebDev é o **GitHub privado [rodrigocordovabbro/mg-motor-brasil-dashboard](https://github.com/rodrigocordovabbro/mg-motor-brasil-dashboard)**. `dashboard-v2` é a branch de trabalho; `main` registra as versões usadas pelos checkpoints Manus. Confira destino, referências remotas e mudanças concorrentes antes de salvar; integre sem reescrever histórico.

Os repositórios anteriores, incluindo o dashboard V1, **não** são destinos deste projeto. Não use force push. Push e checkpoint não equivalem a publicação: a publicação automática está desativada e um deploy exige autorização separada. Banco, contas, sessões, arquivos privados, credenciais e serviços do ambiente não são transferidos pelo Git.

## Preparação e organização

Use Node.js 22 e pnpm 10.18.0, conforme `package.json` e `Dockerfile`. Instale com `pnpm install --frozen-lockfile`. Configure segredos somente no ambiente autorizado e use banco isolado para novas instalações e testes experimentais. O banco gerenciado do projeto Manus atual é compartilhado por desenvolvimento e publicação: qualquer gravação nele é real.

Antes de editar, consulte `git status`, preserve o trabalho existente e leia as regras do domínio afetado.

| Mudança                                    | Local principal                                           |
| ------------------------------------------ | --------------------------------------------------------- |
| Layout, filtros, idioma e acessibilidade   | `client/src/`                                             |
| Contagem canônica, projeção e persistência | `server/`                                                 |
| Autorização e projeção de respostas        | `server/routers.ts`, `server/v2Permissions.ts` e serviços |
| Tipos, calendário, aliases e capacidades   | `shared/`                                                 |
| Evolução do banco                          | `drizzle/` e runner explícito em `server/migrateV2*.ts`   |
| Documentação vigente                       | `README.md`, `docs/`, `CONTRIBUTING.md`, `CHANGELOG.md`   |

Não trate `legacy/` como aplicação ativa. Evite criar no frontend uma segunda regra de KPI que concorra com a implementada no servidor.

## Verificações antes de salvar

Para mudanças funcionais, execute os comandos existentes sem usar dados reais como fixtures:

```bash
pnpm check
pnpm test
pnpm build
git diff --check
```

Formate somente os arquivos alterados, por exemplo:

```bash
pnpm exec prettier --write caminho/do/arquivo.ts
```

Para mudanças apenas documentais, confira links locais, coerência com o código e diff; não declare uma nova execução da suíte funcional se ela não ocorreu. Os testes do projeto usam mocks e fixtures. Uma migration, sincronização ou importação manual é uma alteração de dados, não apenas uma validação de código.

## Regressões que não podem ser perdidas

| Área           | Contrato a preservar                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendário     | D-1 em `America/Sao_Paulo`; recorte geral e MTD são leituras distintas.                                                                                 |
| Dados          | Zero conhecido é diferente de `null`/indisponível; nunca simular histórico, resultados ou progresso.                                                    |
| Contagem       | Origem física preservada; mesma projeção analítica canônica em Leads, CRM, CSV e modelos. Não apagar ocorrências para ajustar totais.                   |
| Atualizar base | Somente ADMIN importa Google no servidor; confirmar a versão retornada ao dashboard depois do commit. Demais perfis só relêem indicadores.              |
| Curva          | Plano histórico normalizado, meta global somente em escopo comparável, projeção identificada e realizado só até a cobertura válida.                     |
| Metas          | Grupos permanecem coletivos, sem duplicação/rateio; overrides manuais e nomes de origem preservados.                                                    |
| Vendas         | Uma coluna semanal `Wn_Reg` por unidade; Retail geral e Registration separados. Conversão global usa Retail, não Registration.                          |
| Upload         | Prévia sem escrita; confirmação transacional, limites XLSX e progresso real da preparação do arquivo.                                                   |
| CRM            | Origem de arquivo distinta da validação auditada; `Check`/`--` são apresentação. Preservar versões, autoria e checks existentes.                        |
| Perfis         | `admin`, `client_admin`, `client`, `bbro`; autorização no servidor. Cliente só Overview e agregados de dealers, não registros pessoais/CSV/outras abas. |
| Idioma         | Login sempre inglês; interfaces Cliente/ADM Cliente em inglês, sem traduzir ou regravar nomes reais de origem.                                          |
| Modelos        | Análise administrativa protegida; gaps de mix são heurísticas, não metas/vendas por modelo inventadas.                                                  |
| CSV            | Recorte completo aplicado, sem truncamento/página-only; campos autorizados, máscara, escaping e neutralização de fórmulas.                              |

## Banco e operação

Uma mudança de schema precisa de pré-requisitos, efeito esperado e procedimento de aplicação explícitos. Prefira alterações aditivas, revise dependências e faça backup aprovado antes de DDL. Os runners customizados não são executados no startup; `pnpm db:migrate` não instala todo o schema do produto e `pnpm db:push` não deve ser usado indiscriminadamente.

Consulte [Operação e deploy](docs/OPERACAO_E_DEPLOY.md) para a ordem atual de migrações e diagnóstico. Não habilite comandos SQL não suportados como no-op para dar aparência de lock ou segurança. Não altere dados, usuários, metas ou checks apenas para experimentar uma mudança.

## Revisão e segurança

A mudança deve atender ao pedido, manter estados de vazio/erro/carregamento, respeitar foco e rolagem, autorizar entradas na API e atualizar a documentação afetada. Confira o diff e a branch antes do push. Preserve lockfile, patches e política de instalação; não troque gerenciador nem habilite scripts desconhecidos para contornar erros.

Nunca versionar ou anexar a Issues/PRs credenciais, `.env`, conta de serviço, cookies, hashes de senha, contatos de Leads, XLSX, CSV operacional, dumps ou logs sensíveis. Use exemplos fictícios e canal privado para incidentes. Se houver exposição, apagar o arquivo não basta: é necessário rotacionar a credencial e avaliar o histórico Git.
