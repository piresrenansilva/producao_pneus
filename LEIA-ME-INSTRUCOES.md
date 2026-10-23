# ✅ Versão com apontamento de carcaças — como aplicar (jeito fácil)

⚠️ **As alterações NÃO vão para o seu computador automaticamente.** O GitHub e o sistema na sua máquina continuam na versão antiga até você substituir os arquivos. O jeito mais garantido é usar o ZIP completo:

## Passo a passo (5 minutos)

1. **Baixe o arquivo `gestao_pneus-node-atualizado.zip`** (está aqui no workspace).
2. **Feche o servidor**: vá na janela preta do `iniciar.bat` e pressione `Ctrl+C` (ou feche a janela).
3. **Extraia o ZIP** (botão direito → *Extrair Tudo...*). Você terá uma pasta `gestao_pneus-node-main`.
4. **Copie TODO o conteúdo** dessa pasta para dentro da pasta do projeto no seu computador (a mesma pasta onde já existem `server.js`, `schema.sql` e `wwwroot`), escolhendo **Substituir todos os arquivos** quando o Windows perguntar.
   - Não se preocupe: suas pastas `node_modules` e o arquivo `.env` **não são apagados** (o ZIP não os contém).
   - O `iniciar.bat` **não está no ZIP** de propósito, para não mexer no seu.
5. **Inicie de novo** (`iniciar.bat` ou `npm start`). Na primeira inicialização, o servidor cria sozinho as tabelas novas `carcaca_ordens` e `carcaca_ordem_itens` — sem apagar nada do banco atual.
6. No navegador, **force a atualização**: `Ctrl + F5` (ou `Ctrl + Shift + R`). Isso limpa o cache dos arquivos antigos.

## Como confirmar que funcionou

| Verificação | O que você deve ver |
|---|---|
| Barra lateral, embaixo | a etiqueta **"versão 2026.10.21-carcacas"** |
| Aba Produtos → Cadastrar produto | campo **Categoria virou uma lista** (Revenda / Carcaça) |
| Aba Carcaças | botão **"Novo apontamento"** e tela de ordens (em vez da tabela antiga) |
| Aba Vendas → etapa Pneus | carcaças **não aparecem** no catálogo |

> Se a etiqueta de versão **não aparecer** depois do Ctrl+F5: os arquivos foram copiados para a pasta errada ou há outra instância do servidor rodando em outra porta. Confira se o endereço aberto é o mesmo `http://localhost:5080` iniciado pelo bat e se a pasta onde você colou os arquivos é a mesma que o `iniciar.bat` usa (o `cd /d "..."` na primeira linha dele).

---

# O que foi implementado

1. **Produtos**: Categoria virou seleção **Revenda / Carcaça** — as carcaças agora são cadastradas aqui (código, nome, medida, custo, preço). Categorias antigas de produtos já cadastrados são preservadas ao editar.
2. **Vendas**: produtos da categoria Carcaça **não aparecem** no catálogo nem na busca.
3. **Carcaças → ordem de apontamento**:
   - Botão **"Novo apontamento"**: data, dono/fornecedor, origem (cliente/compra/retorno), status (Registrado/Conferido) e observações;
   - **Busca com no mínimo 2 letras** (nada é listado antes de pesquisar), retornando só produtos da categoria Carcaça;
   - "Adicionar" insere a carcaça com qtd 1 e valor unitário vindo do **custo cadastrado**; qtd e valor podem ser ajustados;
   - Cada linha mostra **qtd × valor = total da linha**; rodapé com o **total do apontamento ao vivo**;
   - Servidor revalida tudo e **recalcula o total** (o valor exibido no navegador nunca é confiável sozinho); numeração automática `CAR-0001…`;
   - Lista com KPIs (apontamentos, unidades, valor total) e **"Ver itens"** expansível;
   - **Registrado**: edita/exclui · **Conferido**: somente leitura (bloqueado também no servidor).
4. **Produção**: medidas passam a vir das carcaças dos Produtos (e do legado, para dados antigos).
5. **Painel**: cartão "Carcaças" soma as unidades apontadas.

## Banco de dados

- Novas tabelas `carcaca_ordens` (cabeçalho com `total`) e `carcaca_ordem_itens` (linhas, excluídas em cascata), sequência `seq_carcaca_ordem`, rotas `POST/PUT /api/carcaca-ordens(/:id)`. Tudo criado automaticamente no boot — **sem apagar nem recriar** nada existente.
- A tabela antiga `carcacas` permanece intacta no banco (só sai da tela); os dados antigos seguem alimentando as medidas da Produção.

## Arquivos alterados (se preferir aplicar manualmente)

| Arquivo no workspace (raiz) | Destino no projeto |
|---|---|
| `server.js`, `schema.sql` | pasta raiz do projeto |
| `src\definitions.js`, `src\operations.js` | pasta `src\` |
| `index.html`, `styles.css` | pasta `wwwroot\` |
| `utils.js`, `forms.js`, `vendas.js`, `app.js` | pasta `wwwroot\js\` |

Na pasta `patches/` há um `.patch` cumulativo por arquivo (contra a `main` do GitHub), para aplicar com `git apply` se preferir.

## Decisões de projeto (confirme)

- **O apontamento não dá entrada no estoque** — ele registra a entrada e os valores. Se quiser que "conferir" alimente o estoque automaticamente, avisa que implemento.
- **Conferido é definitivo** (espelha a regra de pedido faturado).

## Testes executados

- **Backend 20/20**: total recalculado no servidor, custo padrão quando valor não informado, rejeição de produto não-carcaça / sem itens / qtd inválida / valor negativo, edição apenas quando "registrado", commit/rollback corretos.
- **Frontend 34/34**: carcaça fora da venda, categoria seletiva com legado, busca mínima, totais ao vivo, payload POST/PUT, apontamento vazio bloqueado, conferido somente leitura, medidas da Produção.
