# Correções v3.2 — Painel DEV + endurecimento do boot

Base: **commit `cfaf3dd`** ("relatorios"). Nada foi enviado ao GitHub por aqui — aplique localmente.

> **Entrega: um único patch**, `correcoes-v3.2.patch`, gerado a partir do estado atual da sua máquina (v3 aplicada + `iniciar.bat` CRLF). Descarte v1/v2/v3.1.

---

## 🆕 Painel DEV (feature flags)

Incluído nesta versão. Serve para esconder abas do sistema com **uma linha** ou por uma **URL**:

- **Uma linha:** abra `dev-flags.json` e troque `"relatorios": true` por `"relatorios": false`. Salve e dê **F5** no sistema — não precisa reiniciar o servidor.
- **URL:** `http://localhost:5090/dev` — liga/desliga qualquer módulo com um clique (também salva em `dev-flags.json`). Há um link discreto `⚙ DEV` na barra lateral.
- **Trava:** `MODULOS_DESATIVADOS=relatorios` no `.env` (o painel não consegue religar). `DEV_KEY=...` exige `/dev?chave=...`.
- O servidor injeta o CSS/`window.GP_FLAGS` no `index.html` — **nenhum arquivo do front-end é alterado**. A API `GET /api/relatorios/vendas` também é bloqueada (404) quando os relatórios estão desligados.
- O painel só responde em `localhost` (loopback) e funciona mesmo sem o SQL Server, para ajudar no diagnóstico.

Detalhes em `LEIA-ME-PAINEL-DEV.md`.

---

## ⚠️ "Cliquei no bat, o cmd abriu por 1 segundo e fechou" — corrigido

**Causa:** o `iniciar.bat` da v3 foi gravado com quebras de linha **Unix (LF)** e continha blocos `if (...)` de várias linhas + `goto :label`. No `cmd.exe` do Windows isso faz o arquivo terminar imediatamente, sem executar `node server.js` e sem deixar mensagem.

**O que a v3.1 mudou:**

- `iniciar.bat` agora é **CRLF** e **não tem nenhum bloco multilinha** — só `if ... goto :rotulo` em linhas simples.
- `cd /d "%~dp0."` (o `.` final evita o problema da contrabarra antes das aspas).
- Antes de iniciar, confere se existem `server.js`, `src/config.js`, `src/boot-database.js`, `wwwroot/js/boot.js` e se o comando `node` está no PATH. Se faltar algo, mostra **mensagem clara + `pause`** em vez de fechar.
- Se `node server.js` encerrar, a janela **continua aberta**, mostra o código de saída e reinicia em 5 s (dá tempo de ler o erro). `Ctrl+C` encerra.
- **`diagnostico.bat` (novo)**: confere versão do Node, presença dos arquivos, sintaxe dos JS novos, `PORT`/`HOST`/`DB_*` do `.env`, porta 5090 em uso e sobe o servidor por 6 s gravando `boot-teste.log` e `boot-teste-erro.log`. Use se ainda falhar e me envie esses dois arquivos.
- **`server.js` blindado**: um erro **síncrono** ao carregar `src/boot-database` (arquivo ausente, `msnodesqlv8` não instalado, `.env` inválido, etc.) agora vira mensagem no console e na tela de boot — antes era uma exceção não tratada que derrubava o processo e fechava a janela. `PORT=5090 # comentário` também não quebra mais a leitura da porta.

---

## O que o projeto novo exigiu

O commit `cfaf3dd` trouxe `src/reports.js`, `wwwroot/js/relatorios.js`, a rota `GET /api/relatorios/vendas` e, sobretudo, **`sql/relatorios.sql`, `sql/tipos-entidades.sql` e `sql/vendedores.sql` aplicados no boot** via `applySqlBatches()`.

1. **O hash do schema inclui todos os `sql/*.sql`.** Se você editar `dbo.usp_RelatorioVendas`, a procedure é reimplantada automaticamente no próximo boot — sem `FORCE_SCHEMA_CHECK`. O hash lê `schema.sql` + todos os `.sql` de `sql/` (em ordem) + `src/database.js`.
2. **`server.js` preserva os relatórios** (`getSalesReport` + rota) junto com as melhorias de inicialização.
3. **`wwwroot/index.html` intacto** — mantém `js/relatorios.js` e a versão `2026.10.26-relatorios-vendas`. A tela de boot é injetada pelo servidor; o `boot.js` **acrescenta** `· boot5090 (2026.11.02)` à etiqueta em vez de substituí-la.
4. **`src/database.js`, `package.json`, `ESTRUTURA.md` e `sql/*` intactos.** Quando a estrutura muda, `src/boot-database.js` delega ao `initializeDatabase()` original, que roda schema + migrações + os 3 scripts SQL como antes.
5. **`README.md`** atualizado em cima das seções novas de Relatórios / Tipos de entidades / Vendedores.

## Como aplicar — UM patch só

Este é o **único** arquivo pendente, gerado a partir exatamente do estado atual da sua máquina:

```powershell
cd D:\pessoal\projetos\sistema_em_producao
git apply ./correcoes-v3.2.patch
npm test
```

Sem ZIP, sem `--3way`, sem `--whitespace`, sem stash. O `git apply` sai **sem nenhum aviso** (os `.bat` entram como diff binário para preservar o CRLF).

Depois feche a janela preta (`Ctrl+C`) e dê duplo clique no `iniciar.bat` de novo — é preciso reiniciar porque o `server.js` mudou.

**O que o patch NÃO toca:** `ESTRUTURA.md`, `package.json`, `src/database.js`, `wwwroot/index.html` (suas alterações locais), `.env`, `node_modules` e o `iniciar.bat` da raiz (que já está CRLF). Se, por acaso, a janela preta ainda fechar em 1 segundo, copie `patches/iniciar.bat` por cima do `iniciar.bat` da raiz — é a cópia CRLF de segurança que vem dentro do próprio patch.

### Arquivos do patch

| Modificados                                                                       | Novos                                                                                                                                               |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.js`, `src/config.js`, `.env.example`, `CORRECOES.md`, `test/boot.test.js` | `src/dev-panel.js`, `dev-flags.json`, `test/dev-panel.test.js`, `LEIA-ME-PAINEL-DEV.md`, `.gitattributes`, `diagnostico.bat`, `patches/iniciar.bat` |

## Correções de porta e boot (mantidas)

### Porta única 5090

- `server.js` escuta, exibe e abre o navegador na **mesma porta** (padrão `5090`). Removido o `exec('start "" "http://localhost:5090"')` solto no fim do arquivo, que rodava antes do `listen` enquanto o servidor usava `5080`.
- O navegador só abre **depois** de confirmar `/api/status`, via `cmd.exe /c start` (`OPEN_BROWSER=false` desliga).
- Escuta em `127.0.0.1` **e** `::1`, então `localhost:5090` funciona mesmo quando o Windows resolve para IPv6.
- `.env` antigo com `PORT=5080` é migrado para `5090` na 1ª execução (`ALLOW_LEGACY_PORT=true` mantém 5080).
- Se já houver uma instância na 5090, abre o navegador nela em vez de "não foi possível conectar".

### Boot rápido

- **HTTP primeiro, banco depois**: interface abre na hora, progresso via `/api/status`, chamadas `/api` aguardam e o sistema reconecta sozinho se o SQL Server estiver subindo. Ajudou mais ainda agora que o boot completo cresceu com os 3 scripts SQL.
- **`dbo.schema_meta`**: 2 consultas leves no boot normal em vez de ~70+ comandos. `FORCE_SCHEMA_CHECK=true` força reexecução (útil se alguém apagar a procedure `usp_RelatorioVendas` direto no banco).
- Sem conexão extra com `master` no boot normal; `DB_CONNECT_TIMEOUT` configurável; console com tempo por etapa; driver nativo carregado sob demanda.
- HTML/CSS/JS com `Cache-Control: no-cache` — sem `Ctrl+F5` obrigatório.

## Validação

- `npm run check`: OK. **`npm test`: 14/14** (8 testes do projeto atual + 6 novos, incluindo `PORT` com comentário).
- Testes novos: 1º boot aplica `schema.sql`, migrações **e** `usp_RelatorioVendas`; 2º boot usa ≤ 2 consultas; alterar `sql/relatorios.sql` ou `src/database.js` muda o hash; `FORCE_SCHEMA_CHECK` reaplica os scripts; `index.html`/`database.js` seguem intactos.
- Patch aplica limpo em clone de `cfaf3dd` e em checkout **CRLF** com alterações locais simuladas.
- Servidor real: `/` = 200 com `boot.js` injetado e `relatorios.js` preservado, `/api/relatorios/vendas` = 503 amigável enquanto o DB sobe, `::1:5090` = 200, **5080 sem escuta**.
- `iniciar.bat` conferido: 76 linhas **CRLF**, zero blocos `if (...)` multilinha, todos os `goto` com rótulo correspondente.

## Se ainda não funcionar

1. Dê duplo clique em **`diagnostico.bat`** (a janela fica aberta com `pause`).
2. Me envie `boot-teste.log`, `boot-teste-erro.log` e o texto da tela.
3. Ou, no PowerShell na pasta do projeto: `node server.js` e cole a saída — agora qualquer erro aparece em vez de fechar a janela.

## Depois que subir

1. Feche janelas antigas do `iniciar.bat` (`Ctrl+C`), inclusive alguma na **5080**.
2. Confira `PORT=5090` no `.env` (ou apague a linha).
3. Acesse **http://localhost:5090**. O **primeiro** boot roda schema + migrações + `sql/*.sql` uma vez (idempotentes, sem apagar dados); do **segundo** em diante é rápido.
4. Etiqueta esperada: `versão 2026.10.26-relatorios-vendas · boot5090 (2026.11.02)`.

## Observações

- As únicas menções a `5080` restantes são a detecção/migração do `.env` antigo, o teste correspondente e textos explicativos. Nenhuma URL ou porta ativa usa 5080.
- `JWT_KEY` vazio derruba sessões ao reiniciar; gere com `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` e coloque no `.env` se quiser manter o login.
