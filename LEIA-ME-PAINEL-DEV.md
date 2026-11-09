# Painel DEV — esconder abas com 1 linha ou por uma URL

## Instalação (um único patch)

Na pasta `D:\pessoal\projetos\sistema_em_producao`, abra o PowerShell e rode **um comando**:

```
git apply ./correcoes-v3.2.patch
```

Depois feche a janela preta (`Ctrl+C`) e dê duplo clique no `iniciar.bat` de novo
(é preciso reiniciar porque o `server.js` mudou).

> Este patch NÃO mexe em `ESTRUTURA.md`, `package.json`, `src/database.js` nem
> `wwwroot/index.html` — suas alterações locais ficam intactas. Também não mexe
> no `iniciar.bat`, no `.env` nem em `node_modules`.
>
> **Se a janela preta ainda fechar em 1 segundo** (caso você não tenha trocado o
> `iniciar.bat` antes): copie `patches/iniciar.bat` por cima do `iniciar.bat` da
> raiz. Ele já está em CRLF, que é o que o `cmd.exe` exige.

---

## O que é

Um interruptor por aba do sistema. Você pode, por exemplo, **tirar os Relatórios do menu** sem apagar código, sem mexer no banco e sem reiniciar o servidor.

Funciona de **2 jeitos** (os dois mexem no mesmo arquivo `dev-flags.json`):

### Jeito 1 — editar UMA LINHA (o mais simples)

Abra `dev-flags.json` (está na pasta do projeto) e mude:

```json
"relatorios": true      →      "relatorios": false
```

Salve. Vá na janela do sistema e dê **F5**. O item "Relatórios" some do menu.

> Não precisa reiniciar o `iniciar.bat`. Para voltar, troque de volta para `true` e dê F5.

### Jeito 2 — pela URL

Abra **http://localhost:5090/dev**

Aparece a lista de todas as abas com botões liga/desliga. Clique no de "Relatórios", espere o "Salvo" e dê **F5** na janela do sistema. Também existe um link discreto `⚙ DEV` na barra lateral.

---

## Outras abas

O mesmo arquivo controla todas. Exemplos de linha em `dev-flags.json`:

| Para esconder | Mude para `false` |
|---|---|
| Relatórios | `"relatorios"` |
| Vendas | `"vendas"` |
| Financeiro | `"financeiro"` |
| Carga e descarga | `"cargas"` |
| Formas de pagamento | `"condicoesPagamento"` |

Ids disponíveis: `painel`, `clientes`, `veiculos`, `produtos`, `servicos`, `carcacas`, `estoque`, `producao`, `vendas`, `cargas`, `financeiro`, `relatorios`, `condicoesPagamento`.

No painel `/dev` é só clicar, sem decorar nome.

---

## Extras

**Travar de vez (o painel não consegue religar)** — acrescente uma linha no `.env`:

```
MODULOS_DESATIVADOS=relatorios
```

Mais de um: `MODULOS_DESATIVADOS=relatorios,cargas`. Nesse caso é preciso reiniciar o servidor (o `.env` só é lido no boot).

**Proteger o painel com senha** (opcional) — no `.env`:

```
DEV_KEY=minha-chave
```

Aí o endereço passa a ser `http://localhost:5090/dev?chave=minha-chave`.

**Segurança:** o painel só responde de `localhost` (`127.0.0.1` / `::1`). Se você abrir o sistema para a rede com `HOST=0.0.0.0`, quem estiver em outro computador recebe `403`.

**API:** com os relatórios desligados, `GET /api/relatorios/vendas` devolve `404` — não é só esconder o botão. As outras abas são flags visuais (o menu some; as rotas genéricas continuam, para não quebrar o sistema).

---

## O que este patch mexe

| Arquivo | Situação |
|---|---|
| `src/dev-panel.js` | **novo** — lê/escreve `dev-flags.json`, serve `/dev` e injeta as flags no HTML |
| `dev-flags.json` | **novo** — o arquivo de uma linha que você edita |
| `LEIA-ME-PAINEL-DEV.md` | **novo** — este arquivo |
| `test/dev-panel.test.js` | **novo** — 6 testes |
| `patches/iniciar.bat` | **novo** — cópia CRLF de segurança do launcher |
| `server.js` | +4 linhas de integração do painel + endurecimento de boot (erro amigável em vez de janela que fecha) |
| `src/config.js`, `test/boot.test.js` | aceita `PORT=5090 # comentário` e testa isso |
| `.env.example`, `CORRECOES.md` | documentação das flags e das correções |
| `.gitattributes`, `diagnostico.bat` | força CRLF nos `.bat` + script de diagnóstico |
| `wwwroot/index.html`, `app.js`, `forms.js`, `utils.js` | **intactos** — nada do front-end do projeto foi alterado |

`npm test`: **20/20**. Validado ao vivo: `/dev` = 200, `POST /api/dev/flags` grava o arquivo, e no **mesmo instante** (sem reiniciar) o `/` passa a entregar o CSS que esconde `data-page="relatorios"`.
