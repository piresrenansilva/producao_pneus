# Erro de conexão com o SQL Server — “localhost,1433 / Servidor não encontrado”

Mensagem que você recebeu:

```
Não foi possível preparar o banco de dados.
[Microsoft][ODBC Driver 18 for SQL Server] ... ao estabelecer uma conexão com localhost,1433.
Servidor não encontrado ou não acessível...
```

## O que esse erro diz (e o que ele NÃO diz)

O sistema não está com “bug de código”. O driver ODBC tentou abrir uma conexão TCP em
**localhost, porta 1433** e **ninguém respondeu nessa porta**. Ou seja, uma destas três coisas:

1. nenhum SQL Server está escutando em 1433 (caso mais comum: você instalou o **SQL Server Express**,
   que por padrão usa uma **porta dinâmica** e uma **instância nomeada**);
2. o serviço do SQL Server está **parado**, ou o **TCP/IP** da instância está **desabilitado**;
3. você está apontando para o servidor/instância errada (ou errado `DB_PORT`).

Do seu repositório: sem essas variáveis no `.env`, o código assume
`DB_AUTH=windows`, `DB_SERVER=localhost` e **sem** instância — e o driver `msnodesqlv8`
monta a string `Server=localhost,1433`. Daí a mensagem exata com `,1433`.

---

## 0) Leitura do SEU diagnóstico (máquina `E:\gestao_pneus-node`)

O que o output já provou:

| Achado | Significado |
|---|---|
| `Running MSSQL$SQLEXPRESS` **e** `Running MSSQLSERVER` | Você tem **duas instâncias** de SQL Server instaladas e rodando: a **padrão** (`MSSQLSERVER`, versão interna 17) e a **Express** (`SQLEXPRESS`, versão interna 16 = SQL Server 2022). |
| `Stopped SQLBrowser` | **SQL Server Browser parado** → `DB_INSTANCE=SQLEXPRESS` **não vai funcionar** enquanto ele estiver parado, porque ninguém descobre a porta dinâmica da instância. |
| Nenhuma porta **1433** em escuta | É exatamente a origem do `localhost,1433 / Servidor não encontrado`. Nenhuma das duas instâncias está atendendo em TCP na porta clássica. |
| `1434` aparece em `Get-NetTCPConnection` com PID 5040 | Cuidado: 1434 do Browser é **UDP**, não TCP. Esse listener TCP 1434 é de **outro programa** (o Browser está parado). Não conte com ele. |
| `sqlcmd -S localhost` e `-S localhost\SQLEXPRESS` → **erro de certificado SSL** | Notícia **boa**: é erro *depois* de a instância responder (o ODBC 18 vem com `Encrypt=Yes` por padrão e recusa o certificado autoassinado do SQL Server). Se fosse "servidor não encontrado", a mensagem seria outra. |

**Conclusão:** o SQL Server responde localmente (memória compartilhada/named pipes), mas **não está escutando em TCP**. O seu sistema falha antes disso porque o `src/database.js` monta a string **com porta fixa** (`Server=localhost,1433`), o que força TCP — e TCP não está atendendo.

### Caminho A — correção definitiva (2 minutos, recomendada)

1. Saiba **qual instância tem seus dados** (rode os dois, sempre com `-C`):

   ```powershell
   sqlcmd -S localhost -E -C -Q "SELECT @@SERVERNAME AS instancia; SELECT name FROM sys.databases"
   sqlcmd -S localhost\SQLEXPRESS -E -C -Q "SELECT @@SERVERNAME AS instancia; SELECT name FROM sys.databases"
   ```

2. Abra o **SQL Server Configuration Manager** → *Configuração de Rede do SQL Server* →
   *Protocolos de <instância escolhida>* → **TCP/IP** → *Habilitado = **Sim***.
3. Em **Endereços IP → IPAll**: *Portas Dinâmicas TCP* = **vazio**, *Porta TCP* = **1433**
   (se for a instância padrão) ou **14330** (se for a SQLEXPRESS — as duas **não** podem usar 1433).
4. `services.msc` → `SQL Server (SQLEXPRESS)` (ou `SQL Server (MSSQLSERVER)`) → **Reiniciar**.
   Opcional: `SQL Server Browser` → início **Automático** → *Iniciar*.
5. `.env`:

   ```env
   # instância padrão em 1433
   DB_SERVER=localhost
   DB_INSTANCE=
   DB_PORT=1433
   ```
   ou, na SQLEXPRESS em porta fixa:
   ```env
   DB_SERVER=localhost
   DB_INSTANCE=
   DB_PORT=14330
   DB_ENCRYPT=false
   DB_TRUST_SERVER_CERT=true
   ```

> ⚠️ Como você tem duas instâncias, o sistema **cria o banco indicado em `DB_NAME` na instância para onde apontar**.
> Se os dados antigos estão na outra, você veria “sistema vazio” — aponte para a certa (passo 1).

### Caminho B — funciona agora, sem mexer em configuração do SQL Server

O banco responde localmente; então dá para usar uma **connection string sem porta** (permite
memória compartilhada / named pipes). Isso já é suportado pelo patch em `src/database.js`:

```env
DB_AUTH=windows
DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DB_SERVER=localhost
DB_INSTANCE=
DB_PORT=
DB_NAME=NomeDoSeuBanco
DB_ENCRYPT=false
DB_CONNECTION_STRING=Driver={ODBC Driver 18 for SQL Server};Server=localhost\SQLEXPRESS;Trusted_Connection=Yes;Encrypt=No;
```

Troque `localhost\SQLEXPRESS` por `localhost` se os dados estiverem na instância padrão.
Se o driver reclamar de protocolo, acrescente `;Network Library=dbmslpcn` no fim.

O script `diagnostico-sql.js` (v2) testa **exatamente essas variantes** e, se alguma conectar,
imprime o bloco de `.env` pronto — inclusive a `DB_CONNECTION_STRING` que funcionou.

### Rode de novo

```bat
node diagnostico-sql.js
```

Agora ele mostra, por instância: **TcpEnabled**, porta fixa, porta dinâmica, as **portas reais de
cada serviço** (PID → socket), e separa `UDP 1434` (Browser) de TCP 1434 (outro programa).
O log completo fica em `diagnostico-sql.log`.

---

## 1) Diagnóstico automático (recomendado, 1 minuto)

Coloquei no projeto um script que **não altera nada** e testa sozinho o que estiver acessível.
Na pasta do projeto (a mesma do `server.js`):

```bat
node diagnostico-sql.js
```

Ele mostra:

- o `.env` que está sendo lido (ou avisa que ele **não existe**);
- serviços `MSSQL*` / `SQL Server Browser` (rodando ou parados);
- instâncias instaladas no registro do Windows (ex.: `MSSQL15.SQLEXPRESS` → instância `SQLEXPRESS`);
- se as portas **1433/1434** estão em escuta e se o processo `sqlservr.exe` está ativo;
- drivers ODBC instalados;
- testes reais de conexão com várias combinações: `.env` atual, `localhost\SQLEXPRESS`,
  `localhost,1433`, LocalDB e (se você preencher) login SQL;
- no fim, imprime **exatamente o bloco de `.env` que funciona** na sua máquina.

Se o resultado for `[FALHA] Nenhuma configuração conectou`, é problema de instalação/serviço — siga o item 2.

---

## 2) Caminho mais provável: SQL Server Express (instância nomeada)

Descubra o nome da instância (PowerShell):

```powershell
Get-Service MSSQL* | Select-Object Status,Name
```

Você verá algo como `MSSQL$SQLEXPRESS` → a instância chama-se **SQLEXPRESS**.
(Se aparecer apenas `MSSQLSERVER`, sua instalação é a instância padrão, que normalmente usa 1433.)

Então, no `.env` (crie na pasta do projeto, ao lado do `server.js`):

```env
DB_AUTH=windows
DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_PORT=
DB_NAME=NomeDoSeuBanco
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true
HOST=127.0.0.1
PORT=5090
```

Regras que o código aplica:

| Situação | Configuração |
|---|---|
| Instância padrão | `DB_SERVER=localhost`, `DB_INSTANCE=` vazio, `DB_PORT=` vazio (usa 1433) |
| Instância nomeada (Express) | `DB_INSTANCE=SQLEXPRESS`, `DB_PORT=` **vazio** (o driver resolve pelo SQL Browser) |
| Instância nomeada em porta fixa | `DB_INSTANCE=SQLEXPRESS` **e** `DB_PORT=1433` (ou a porta que você fixou) |
| LocalDB | `DB_CONNECTION_STRING=Driver={ODBC Driver 18 for SQL Server};Server=(localdb)\MSSQLLocalDB;Trusted_Connection=Yes;Encrypt=No;` |
| Outro PC / outro host | `DB_SERVER=NOME-DA-MAQUINA` ou `IP`, e lá o TCP/IP precisa estar habilitado e o firewall liberado |

⚠️ Tenha cuidado: `DB_INSTANCE` **não** é o nome do serviço (`MSSQL$SQLEXPRESS`), é só `SQLEXPRESS`.
Nunca coloque `DB_SERVER=localhost\SQLEXPRESS` — o código já compõe `servidor\instância`.

---

## 3) Checklist de instalação (na ordem)

1. **Serviço iniciado**: `services.msc` → `SQL Server (SQLEXPRESS)` → *Iniciar*;
   e `SQL Server Browser` → tipo de inicialização **Automático** → *Iniciar*
   (sem o Browser, conexão por instância nomeada não resolve a porta).
2. **TCP/IP habilitado**: SQL Server Configuration Manager →
   *Configuração de Rede do SQL Server* → *Protocolos de SQLEXPRESS* → **TCP/IP → Habilitado** →
   clique com o botão direito no serviço → **Reiniciar**.
   Em *Endereços IP* → **IPAll**: deixe *Portas Dinâmicas TCP* vazio e *Porta TCP* = `1433`
   se quiser fixar a porta (aí pode usar `DB_PORT=1433` e dispensar o Browser).
3. **Autenticação integrada**: seu usuário do Windows precisa existir como login no SQL Server
   com permissão para **criar banco** (o sistema tenta `CREATE DATABASE` para o nome definido em `DB_NAME` no primeiro boot).
   Instalações do Express com “usuários do Windows” já vêm assim; se você usa SQL Server em outro
   computador, costuma ser mais fácil usar `DB_AUTH=sql`, `DB_USER=sa` e `DB_PASSWORD=...`
   (com *Autenticação de Modo Misto* habilitada).
4. **Driver ODBC**: precisa do *Microsoft ODBC Driver 18 for SQL Server* instalado
   (Windows atualizado, 64-bit). Confira: `Get-OdbcDriver | ? Name -like '*SQL Server*'`.
5. **Firewall**: em `localhost` não atrapalha; só ao acessar de outra máquina
   (liberar o `sqlservr.exe` ou a porta 1433 em redes privadas).

Testes rápidos no Prompt (sem o sistema):

```powershell
Test-NetConnection localhost -Port 1433        # TcpTestSucceeded : True ?
sqlcmd -S localhost\SQLEXPRESS -E -Q "SELECT @@SERVERNAME"
```

Se o `sqlcmd` conecta com `localhost\SQLEXPRESS` e o sistema não conecta, o problema é só o `.env`.

---

## 4) Armadilhas que existiam no repositório — todas corrigidas

1. **O `.env` podia simplesmente não existir.** Agora o `iniciar.bat` copia
   `.env.example` para `.env` na primeira execução, pausa para você conferir os
   dados e também roda `npm install` quando `node_modules` não existe. O
   `.env.example` está versionado no repositório.
2. **O navegador abria na porta errada.** Antes o `server.js` tinha, solto no
   fim do arquivo, `exec('start "" "http://localhost:5090"')` — executado
   imediatamente (até quando o módulo era só importado), enquanto o servidor
   escutava na porta antiga configurada no `.env`. Resultado: página de "não foi possível conectar" e, no
   console, o endereço com a porta antiga.

   **Situação atual:** existe uma única porta, **5090**, em `server.js`,
   `.env.example`, `iniciar.bat` e em toda a documentação. O navegador só é
   aberto depois que o servidor responde de verdade em `/api/status`, e o
   endereço é montado a partir da porta realmente em uso:

   ```js
   const port = resolvePort();           // padrão 5090
   const url = displayUrl(port);         // http://localhost:5090
   app.listen(port, '127.0.0.1');        // e também em ::1
   // no callback de listen: confirma por HTTP e só então openBrowser(url)
   ```

   Se um `.env` antigo ainda tiver a porta legada, a primeira execução migra o
   valor para `5090` e avisa no console (`ALLOW_LEGACY_PORT=true` desativa isso).
3. **O boot parecia travado.** O HTTP só subia depois que ~70 comandos SQL
   terminavam. Agora o servidor e a interface sobem na hora, o banco é preparado
   em segundo plano com progresso na tela, e `schema.sql` + migrações só são
   reenviados quando o código muda (controle em `dbo.schema_meta`).

---

## 5) Depois que a conexão funcionar, os próximos erros comuns

| Mensagem | Causa / solução |
|---|---|
| `Login failed for user 'NT AUTHORITY\...'` | Seu usuário Windows não tem login no SQL Server → crie o login ou use `DB_AUTH=sql`. |
| `CREATE DATABASE permission denied` | A conta não pode criar banco → crie o banco indicado em `DB_NAME` manualmente como admin (não apague depois). |
| `Could not open a connection... SSL Provider: certificate chain` | `DB_ENCRYPT=true` sem CA válida → use `DB_TRUST_SERVER_CERT=true` (padrão do projeto) ou `DB_ENCRYPT=false`. |
| `Cannot find module 'msnodesqlv8'` | `npm install` incompleto (a dependência é opcional e compila nativo). Rode `npm install` novamente na pasta com o Node 22+; se falhar, use `DB_AUTH=sql`. |
| `A porta 5090 já está em uso` | Já existe uma instância do sistema aberta: o servidor detecta, avisa e abre o navegador na instância existente. Se for outro programa, feche-o ou altere `PORT` no `.env`. |

---

## 6) Ajuste que já deixei no código

`src/database.js` agora aceita **`DB_CONNECTION_STRING`** (opcional, não quebra nada):

```js
// Connection string completa (opcional). Necessária, por exemplo, para LocalDB.
const connectionString = connectionStringFor(database);
if (connectionString) {
  config.connectionString = connectionString;
  ...
}
```

Isso resolve os casos em que `server` + `instanceName` + `port` não são suficientes: com campos
separados o driver `msnodesqlv8` monta `Server=host,porta` (1433 por padrão) ou
`Server=host\instância` — e o **LocalDB** não é aceito em nenhum dos dois formatos. Com a connection string completa, `LocalDB`, portas exóticas e nomes com
caracteres especiais passam a funcionar sem gambiarra.

Arquivos entregues junto deste texto:

| Arquivo | Para que serve |
|---|---|
| `diagnostico-sql.js` | diagnóstico + teste de conexão + sugestão de `.env` (execução: `node diagnostico-sql.js`) |
| `.env.example` | modelo de configuração para versionar no repositório |
| `src/database.js` | já com suporte a `DB_CONNECTION_STRING` |
