# Correções v3 — adaptadas ao projeto atualizado (`cfaf3dd relatorios`)

Base: **commit `cfaf3dd`** ("relatorios"), que acrescentou a aba Relatórios, `src/reports.js`, `wwwroot/js/relatorios.js`, `sql/relatorios.sql`, `sql/tipos-entidades.sql`, `sql/vendedores.sql` e `applySqlBatches()` no `src/database.js`.

> **Use esta versão.** Os patches v1/v2 foram gerados contra o commit antigo (`ba64abd`) e não servem mais. Nada foi enviado ao GitHub por aqui — aplique localmente.

## O que precisou mudar por causa do projeto novo

1. **O hash do schema agora inclui `sql/*.sql`.** Antes o cache de boot considerava só `schema.sql` + `src/database.js`. Como o projeto passou a criar/atualizar a procedure `dbo.usp_RelatorioVendas` e os cadastros auxiliares a partir de 3 arquivos SQL no boot, editar `sql/relatorios.sql` **não** reimplantaria a procedure se esses arquivos ficassem de fora. Agora `computeFingerprint()` lê `schema.sql` + todos os `.sql` de `sql/` (em ordem) + `src/database.js`. Mexeu em qualquer um → o boot reaplica tudo automaticamente.
2. **`server.js` preserva os relatórios.** O `require('./src/reports')` e a rota `GET /api/relatorios/vendas` do commit novo foram mantidos, junto com todas as melhorias de inicialização.
3. **`wwwroot/index.html` continua intacto** — inclui o `<script src="js/relatorios.js">` e a versão `2026.10.26-relatorios-vendas`. A tela de boot é injetada pelo servidor. O `boot.js` **acrescenta** `· boot5090 (2026.11.02)` à etiqueta em vez de substituí-la, então a versão dos relatórios continua visível.
4. **`src/database.js`, `package.json` e `ESTRUTURA.md` não são tocados.** O `applySqlBatches()` e o script `check` novo (que já inclui `relatorios.js`) permanecem como estão. Quando a estrutura muda, `src/boot-database.js` delega ao `initializeDatabase()` original, que roda `schema.sql`, as migrações **e** os três scripts SQL exatamente como antes.
5. **`README.md`** foi atualizado em cima do texto novo (com as seções de Relatórios, Tipos de entidades e Vendedores), documentando que os scripts `sql/*.sql` também entram no cache.

## Como aplicar (PowerShell, na pasta do projeto)

```powershell
git apply ./patches/correcoes-v3.patch
```

Conferência:

```powershell
git status --short
npm run check
npm test
```

Se houver alterações locais não commitadas e aparecer `patch does not apply`:

```powershell
git add -A
git apply --3way --whitespace=nowarn ./patches/correcoes-v3.patch
```

Alternativa sem git: extraia `producao_pneus_corrigido-v3.zip` e copie **somente** os arquivos da lista "modificados" + "novos". **Não** substitua `src/database.js`, `wwwroot/index.html`, `package.json` nem `ESTRUTURA.md`.

### Arquivos

| Modificados | Novos |
|---|---|
| `server.js`, `.env.example`, `iniciar.bat`, `README.md`, `LEIA-ME-INSTRUCOES.md`, `PROBLEMA-CONEXAO-SQL.md`, `diagnostico-sql.js` | `src/config.js`, `src/boot-database.js`, `wwwroot/js/boot.js`, `test/boot.test.js`, `CORRECOES.md` |

**Intactos:** `src/database.js`, `wwwroot/index.html`, `package.json`, `ESTRUTURA.md`, `schema.sql`, `sql/*`, `src/reports.js`, `wwwroot/js/relatorios.js` e todos os demais arquivos do projeto.

## Correções mantidas da v2

### Porta única 5090

- `server.js` escuta, exibe e abre o navegador na **mesma porta** (padrão `5090`). Removido o `exec('start "" "http://localhost:5090"')` solto no fim do arquivo, que rodava antes do `listen` enquanto o servidor usava `5080`.
- O navegador só abre **depois** de confirmar `/api/status`, via `cmd.exe /c start` (`OPEN_BROWSER=false` desliga).
- Escuta em `127.0.0.1` **e** `::1`, então `localhost:5090` funciona mesmo quando o Windows resolve para IPv6. `HOST=0.0.0.0` segue disponível para LAN.
- `.env` antigo com `PORT=5080` é migrado automaticamente para `5090` na 1ª execução (`ALLOW_LEGACY_PORT=true` mantém 5080).
- Se já houver uma instância na 5090, abre o navegador nela em vez de exibir "não foi possível conectar".

### Boot rápido

- **HTTP primeiro, banco depois**: interface abre na hora, tela de progresso via `/api/status`, chamadas `/api` aguardam o pool e o sistema reconecta sozinho se o SQL Server ainda estiver subindo. Isso ajuda ainda mais agora, pois o boot completo ficou maior com os 3 scripts SQL novos.
- **`dbo.schema_meta`**: 2 consultas leves no boot normal em vez de ~70+ comandos. `FORCE_SCHEMA_CHECK=true` força reexecução (útil se alguém apagar a procedure `usp_RelatorioVendas` direto no banco).
- Sem conexão extra com `master` no boot normal; `DB_CONNECT_TIMEOUT` configurável; console com tempo por etapa (`[boot] ... (+0.4s)`); driver nativo carregado sob demanda.
- HTML/CSS/JS com `Cache-Control: no-cache` — sem `Ctrl+F5` obrigatório. `iniciar.bat` usa `%~dp0`, cria `.env` e instala dependências na 1ª vez.

## Validação

- `npm run check`: OK. `npm test`: **14/14** (8 testes do projeto atual + 6 novos).
- Testes novos comprovam: 1º boot aplica `schema.sql`, migrações **e** `usp_RelatorioVendas`; 2º boot usa ≤ 2 consultas; alterar `sql/relatorios.sql` ou `src/database.js` muda o hash; `FORCE_SCHEMA_CHECK` reaplica os scripts de relatórios; `index.html`/`database.js` do projeto seguem intactos.
- Patch aplicado com sucesso num clone limpo de `cfaf3dd` e num clone com `core.autocrlf=true` (checkout estilo Windows).

## Depois de aplicar

1. Feche a janela antiga do `iniciar.bat` (`Ctrl+C`), inclusive alguma instância na **5080**.
2. Confira `PORT=5090` no `.env` (ou apague a linha).
3. Rode `iniciar.bat` / `npm start` e acesse **http://localhost:5090**.
4. O **primeiro** boot roda schema + migrações + `sql/*.sql` uma vez (idempotentes, sem apagar dados) e grava a versão; do **segundo** em diante é rápido.
5. A etiqueta deve mostrar `versão 2026.10.26-relatorios-vendas · boot5090 (2026.11.02)`.

## Observações

- As únicas menções a `5080` que restam são a detecção/migração do `.env` antigo (`src/config.js`), o teste correspondente e textos explicativos. Nenhuma URL ou porta ativa usa 5080.
- Se você editar `sql/relatorios.sql`, `sql/tipos-entidades.sql`, `sql/vendedores.sql`, `schema.sql` ou `src/database.js`, **não precisa** de `FORCE_SCHEMA_CHECK`: o hash muda sozinho e a estrutura é reaplicada no próximo boot.
- `JWT_KEY` vazio por padrão derruba sessões ao reiniciar; gere uma chave com `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` e coloque no `.env` se quiser manter o login.
