# Estrutura da versão Node.js

- `server.js` — servidor Express, rotas HTTP, autenticação e inicialização.
- `src/database.js` — conexão e preparação/migrações do SQL Server.
- `src/definitions.js` — lista permitida de tabelas e campos do CRUD.
- `src/operations.js` — leitura, CRUD, vendas e movimentação do estoque.
- `src/auth.js` — PBKDF2 e emissão/validação de JWT.
- `src/pdf.js` — geração de PDF do pedido com PDFKit.
- `schema.sql` — schema SQL Server; constraints de `contas` e `boletos` com nomes corrigidos.
- `wwwroot/` — interface estática HTML/CSS/JavaScript e logo.
- `wwwroot/js/theme.js` — alternância de tema na barra lateral: claro (padrão, branco com verde #01A956) e escuro (visual original); preferência salva no navegador.
- `iniciar.bat` — instala dependências quando necessário e inicia apenas o servidor Node desta pasta.
- `.env.example` — modelo de configuração local; copie para `.env`.
- `test/` — testes unitários básicos de autenticação.
