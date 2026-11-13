# Estrutura do projeto

Visão geral da organização após a refatoração de boas práticas.

## Raiz

- `server.js` — composição do processo: variáveis de ambiente, porta, abertura do navegador, sinais de shutdown.
- `package.json` — scripts de execução, teste, lint e formatação.
- `.env.example` — modelo de configuração local. `.env` não vai para o Git.
- `schema.sql` e `sql/*.sql` — schema, migrações e procedures do SQL Server.
- `dev-flags.json` — flags do painel DEV (ligar/desligar módulos).
- `iniciar.bat` / `diagnostico.bat` — atalhos Windows.
- `wwwroot/` — interface estática (HTML, CSS, JS e logo).
- `test/` — testes automatizados com `node:test`.
- `scripts/` — utilitários de linha de comando (`check-syntax.js`, `diagnostico-sql.js`).
- `docs/` — documentação de operação, correções históricas e arquitetura.

## Backend (`src/`)

- `src/http/app.js` — fábrica do Express: middlewares, ordem das rotas, tratamento de erro.
- `src/http/routes/` — rotas por assunto (`auth`, `data`, `sales`, `pdf`, `reports`, `lookup`).
- `src/http/middleware/` — contexto de requisição, cabeçalhos de segurança, gate do banco, rate limit, erro.
- `src/runtime/database-state.js` — estado do pool/boot em segundo plano e `/api/status`.
- `src/services/` — regras de negócio por domínio:
  - `crud.js` — CRUD genérico das tabelas permitidas.
  - `sales.js` — vendas/orçamentos e PDF do pedido.
  - `carcass-orders.js` — apontamentos de carcaças.
  - `cargo.js` — carga/descarga e romaneio.
  - `finance.js` — lançamentos financeiros e títulos de venda.
  - `payment-terms.js` — formas/condições de pagamento.
  - `lookups.js` — validações de vendedor, categoria, tipo, código, condição.
  - `stock.js` — movimentação e sincronização de estoque.
  - `authentication.js` — login, configuração inicial e status de acesso.
- `src/core/` — blocos compartilhados:
  - `sql.js` — carregamento preguiçoso do driver SQL Server.
  - `transaction.js` — transação + contexto de auditoria com commit/rollback garantidos.
  - `validators.js` — parsing/validação de datas, GUIDs, números, textos.
  - `columns.js` — mapeamento de colunas para tipos SQL.
- `src/operations.js` — fachada de compatibilidade para imports antigos.
- `src/database.js` / `src/boot-database.js` — conexão, schema e boot rápido (comportamento preservado).
- `src/auth.js`, `src/audit-context.js`, `src/errors.js`, `src/definitions.js`, `src/config.js`, `src/db-config.js`, `src/dev-panel.js`, `src/reports.js`, `src/pdf.js`, `src/sale-prices.js` — módulos de apoio.

## Frontend (`wwwroot/js/`)

Ainda usa scripts clássicos compartilhando escopo global, na ordem:

1. `theme.js` — tema claro/escuro.
2. `utils.js` — estado, API, máscaras, helpers.
3. `forms.js` — formulários e cadastros.
4. `relatorios.js` — aba de relatórios.
5. `vendas.js` — fluxo de venda.
6. `app.js` — renderização, navegação e login.
7. `boot.js` — tela de inicialização injetada pelo servidor.

Próximo passo recomendado: migrar para ES modules com imports/exports explícitos.

## Qualidade

- `npm run lint` — ESLint.
- `npm run format:check` / `npm run format` — Prettier.
- `npm test` — testes unitários e de HTTP.
- `npm run verify` — lint + formatação + testes.
- `.github/workflows/ci.yml` — CI em Node 22 e 24.
