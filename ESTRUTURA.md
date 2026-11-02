# Estrutura da versão Node.js

- `server.js` — servidor Express, rotas HTTP, autenticação e inicialização.
- `src/database.js` — conexão e preparação/migrações do SQL Server.
- `src/definitions.js` — lista permitida de tabelas e campos do CRUD.
- `src/operations.js` — leitura, CRUD, vendas e movimentação do estoque.
- `src/auth.js` — PBKDF2 e emissão/validação de JWT.
- `src/pdf.js` — geração de PDF do pedido com PDFKit.
- `src/reports.js` — validação de filtros e execução das procedures de relatórios.
- `schema.sql` — schema SQL Server; constraints de `contas` e `boletos` com nomes corrigidos.
- `sql/relatorios.sql` — índices e procedure `dbo.usp_RelatorioVendas`, aplicada a cada inicialização.
- `sql/tipos-entidades.sql` — tabela `tiposEntidades`, migração dos tipos antigos e vínculo com entidades.
- `sql/vendedores.sql` — vínculo de vendedor nas vendas e criação do vendedor padrão quando necessário.
- `wwwroot/` — interface estática HTML/CSS/JavaScript e logo.
- `wwwroot/js/relatorios.js` — filtros e apresentação da aba Relatórios.
- `wwwroot/js/theme.js` — alternância de tema na barra lateral: claro (padrão, branco com verde #01A956) e escuro (visual original); preferência salva no navegador.
- `iniciar.bat` — instala dependências quando necessário e inicia apenas o servidor Node desta pasta.
- `.env.example` — modelo de configuração local; copie para `.env`.
- `test/` — testes unitários básicos de autenticação.
