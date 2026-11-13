# Boas práticas aplicadas

Refatoração incremental para reduzir acoplamento, padronizar o código e criar uma
rede de segurança automatizada, sem alterar as rotas HTTP nem o comportamento do
sistema.

## O que foi feito

### 1. Ferramentas de qualidade

- ESLint 10 com configuração flat (`eslint.config.js`).
- Prettier para formatação consistente.
- EditorConfig e `.gitattributes` para padronizar editor/Git.
- Scripts npm: `lint`, `lint:fix`, `format`, `format:check`, `check`, `test`,
  `test:coverage`, `verify`.
- CI no GitHub Actions em Node 22 e 24.

### 2. Backend separado por responsabilidade

- `server.js` ficou apenas com inicialização do processo, porta, navegador e shutdown.
- Express foi movido para `src/http/app.js`.
- Rotas separadas em `src/http/routes/`.
- Middlewares separados em `src/http/middleware/`.
- Estado do banco/boot isolado em `src/runtime/database-state.js`.
- `src/operations.js` (1.451 linhas) foi dividido em serviços por domínio
  (`crud`, `sales`, `carcass-orders`, `cargo`, `finance`, `payment-terms`,
  `lookups`, `stock`, `authentication`). O arquivo antigo virou fachada de
  compatibilidade.
- Transações com auditoria centralizadas em `src/core/transaction.js`.
- Validadores e mapeamento de colunas em `src/core/`.

### 3. Correções concretas

- Driver SQL Server agora é realmente preguiçoso: `src/core/sql.js` só carrega
  `src/database.js` no primeiro uso. Antes, `operations.js` carregava o driver no
  boot mesmo com a intenção de adiar.
- `orcamento_ms_pneus.html` estava rastreado apesar de ignorado; foi removido do
  índice Git (o arquivo local pode ser mantido).
- Dependências com vulnerabilidades foram atualizadas; `npm audit` retorna 0
  vulnerabilidades. Um override de `minimatch` corrige advisório transitivo do ESLint.
- Rate limit de autenticação ganhou limpeza periódica e cabeçalho `Retry-After`.
- Requisições ganharam `X-Request-Id`, usado também na auditoria.
- Cabeçalhos básicos de segurança: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`.
- Frontend: mensagem de erro de rede atualizada de `dotnet run` para `npm start`
  e escaping de opções geradas por `opts()`.

### 4. Organização de arquivos

- Documentação histórica movida para `docs/`.
- Script de diagnóstico movido para `scripts/diagnostico-sql.js`.
- Verificação de sintaxe deixou de ser uma lista manual de arquivos e passou a
  percorrer os diretórios de código (`scripts/check-syntax.js`).

### 5. Testes

- Testes existentes preservados.
- Novos testes de HTTP (status, boot, gate do banco, flags, JWT, 404) e de rate limit.
- Suíte atual: `npm test`.

## Como validar

```bash
npm install
npm run verify
npm start
```

Em Windows com SQL Server, validar também:

1. Boot rápido e boot com mudança de schema.
2. Login e configuração inicial.
3. Venda, faturamento, cancelamento e PDF.
4. Carga/descarga com e sem venda vinculada.
5. Apontamento de carcaças.
6. Financeiro e formas de pagamento.
7. Auditoria operacional em banco de homologação restaurado de backup.

## O que ainda não foi feito (próximos passos)

- Migrar o frontend de scripts globais para ES modules.
- Endurecer CSP (hoje há scripts/estilos inline).
- Aumentar cobertura de testes de negócio com SQL Server real ou testes de integração.
- Avaliar extração de `src/database.js`/migrações para arquivos menores, com cuidado
  para não alterar o fingerprint do schema sem necessidade.
- Revisar logs estruturados e observabilidade para uso em rede/produção.

> A refatoração não foi validada contra uma instância real de SQL Server neste
> ambiente. Use homologação antes de produção.

> Observação: `src/database.js` e `src/boot-database.js` foram apenas formatados.
> Como o fingerprint do schema inclui o conteúdo desses arquivos, o próximo boot
> deve reaplicar o schema uma única vez. Os scripts são idempotentes, mas faça
> backup antes de atualizar um banco de produção.
