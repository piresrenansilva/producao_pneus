# Gestão de Pneus — versão Node.js

Conversão do sistema para **HTML, CSS e JavaScript**, com servidor local em **Node.js** e banco **Microsoft SQL Server**. A interface existente foi mantida; o backend C#/.NET foi substituído por rotas Express/Node.

## Requisitos

- Windows 10/11 (para o modo de autenticação integrada recomendado).
- Node.js 22 ou superior.
- SQL Server instalado e em execução (Express ou edição completa).
- Microsoft ODBC Driver 18 for SQL Server para autenticação integrada do Windows.
- Permissão no SQL Server para criar o banco `FabricaPneus` e criar/alterar tabelas. Se o banco já existir, não o apague.

## Iniciar no Windows

1. Extraia esta pasta para um local gravável.
2. Dê duplo clique em `iniciar.bat` uma vez. Se `.env` ainda não existir, o arquivo será criado a partir de `.env.example` e o iniciador vai parar para você configurá-lo.
3. Abra `.env` e confira a configuração do SQL Server:
   - Instância padrão: `DB_SERVER=localhost` e deixe `DB_INSTANCE` vazio.
   - SQL Server Express: `DB_SERVER=localhost` e `DB_INSTANCE=SQLEXPRESS` (ajuste o nome se sua instância for diferente).
   - Para login SQL, mude `DB_AUTH=sql` e preencha `DB_USER` e `DB_PASSWORD`.
4. Dê duplo clique em `iniciar.bat` novamente. Se preferir o terminal, copie `.env.example` para `.env`, ajuste a configuração e execute:

   ```powershell
   npm install
   npm start
   ```

5. Acesse **http://localhost:5080**. No primeiro acesso, crie o usuário e a senha (mínimo de 12 caracteres).
6. Para encerrar, volte ao terminal do servidor e pressione `Ctrl+C`.

O inicializador **não encerra outros processos Node.js ou .NET**. O servidor escuta somente em `127.0.0.1` por padrão, para uso local.

## Configuração do banco

As opções ficam no arquivo `.env`, que não deve ser enviado ao GitHub:

```env
DB_AUTH=windows
DB_ODBC_DRIVER=ODBC Driver 18 for SQL Server
DB_SERVER=localhost
DB_INSTANCE=SQLEXPRESS
DB_NAME=FabricaPneus
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true
HOST=127.0.0.1
PORT=5080
```

Se a instância local não for Express, deixe `DB_INSTANCE` vazio. O servidor prepara o schema e as migrações ao iniciar. O SQL Server precisa permitir a criação do banco caso ele ainda não exista.

`JWT_KEY` pode ficar em branco para uso local: o servidor gera uma chave temporária para aquela execução. Para manter a sessão válida entre reinicializações, defina uma chave aleatória de pelo menos 32 bytes em `.env`. Exemplo para gerar uma chave no terminal:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

## O que foi convertido

- ASP.NET Minimal API → Node.js + Express.
- Acesso a dados → pacote `mssql`, com suporte a autenticação integrada do Windows e login SQL.
- Hash de senha PBKDF2-SHA256, autenticação JWT e rotas protegidas.
- Cadastros, consultas externas de CEP/CNPJ, estoque, vendas, faturamento e geração de PDF.
- A interface HTML/CSS/JavaScript existente é servida pelo mesmo processo Node.
- O schema inclui a correção dos nomes repetidos das constraints de `codigo` em `contas` e `boletos`.
- O CRUD genérico não cria pedidos/itens fora do fluxo de vendas, para evitar baixa de estoque incorreta.

## Vendas, carcaças, produção e carga/descarga

- A venda tem uma etapa **Valores** para revisar e alterar o preço unitário de cada pneu ou serviço. O valor ajustado é gravado no item do pedido e vale somente para aquele pedido; o preço do cadastro não é modificado.
- Em **Carcaças**, o formulário e a lista exibem **Medida, Quantidade, Valor unitário, Status e Valor total**. O valor total é calculado automaticamente (`quantidade × valor unitário`), sem precisar ser digitado. Os campos antigos permanecem no banco para preservar os dados já cadastrados.
- Em **Produção**, a medida é selecionada a partir das medidas existentes em **Carcaças**; o campo **Banda** foi retirado do formulário. Registros antigos continuam preservados.
- Em **Carga e descarga**, placa, item e quantidade saíram do formulário. O motorista é digitado; o funcionário pode ser selecionado entre as entidades cadastradas como funcionário, e há campo para transportadora. A venda vinculada é opcional: é possível digitar três ou mais números do pedido e escolher uma sugestão entre as vendas faturadas ou pagas; a tela então mostra o cliente e o total de pneus. As colunas antigas permanecem no banco para preservar o histórico.
- Na primeira inicialização após a atualização, uma migração adiciona `valorUnitario` às carcaças e os novos campos de vínculo da carga sem apagar nem recriar o banco. Registros antigos recebem `0,00` até que o custo de entrada seja informado.

## Relatórios de vendas

A aba **Relatórios** consulta a procedure SQL Server `dbo.usp_RelatorioVendas`, criada/atualizada automaticamente na inicialização pelo arquivo versionado `sql/relatorios.sql`.

- O filtro permite período e vendedor; os atalhos incluem hoje, mês atual e mês anterior. A lista de vendedores vem das entidades cujo `tipoEntidadeId` é `4`.
- O relatório considera somente pedidos com status **faturado** ou **pago** e usa a data do pedido.
- São exibidos faturamento bruto, descontos, faturamento líquido, ticket médio, pneus, serviços, totais diários, vendedor e condição de pagamento.
- O desconto é aplicado uma vez por pedido, mesmo quando ele tiver diversos itens.
- O relatório é de **faturamento**. Recebimentos de caixa devem usar uma procedure/relatório próprio baseado em `financeiro_lancamentos.pagamento`, pois uma venda a prazo pode ser recebida em outro período.

Para consultar diretamente no SQL Server:

```sql
EXEC dbo.usp_RelatorioVendas
  @DataInicial = '2026-10-01',
  @DataFinal = '2026-10-31',
  @VendedorId = NULL;
```

## Tipos de entidades

O campo **Tipo** do cadastro de entidades passa a ser alimentado pela tabela SQL Server `dbo.tiposEntidades`.

- A instalação cria os tipos iniciais **Cliente**, **Fornecedor** e **Funcionário**.
- Tipos já gravados em entidades antigas são importados automaticamente para a nova tabela e vinculados sem apagar o texto antigo.
- Somente tipos com status **Ativo** aparecem ao cadastrar uma nova entidade; tipos inativos permanecem visíveis apenas ao editar uma entidade que já os utiliza.
- Para adicionar um novo tipo, cadastre-o em `dbo.tiposEntidades` com os campos `nome` e `status`. O sistema carregará a nova opção no próximo acesso/recarregamento dos dados.
- O tipo chamado **Funcionário** continua sendo usado nos seletores de funcionário da carga/descarga e produção.

## Vendedores nas vendas

O tipo de entidade de id **4** é tratado como **Vendedor**.

- A etapa de pagamento da venda permite selecionar apenas entidades ativas com `tipoEntidadeId = 4`.
- A venda armazena o identificador da entidade em `pedidos.vendedorId` e mantém o nome em `pedidos.vendedor` para preservar o histórico/PDF.
- A inicialização garante a entidade ativa **Padrão** com tipo `4`, criando-a quando não existir ou reativando-a quando estiver inativa. Ela é o vendedor automático das novas vendas e das vendas antigas sem responsável.
- O filtro de vendedor em **Relatórios** usa os mesmos cadastros de entidades, sem depender de nomes digitados nos pedidos.

## Observações

- Esta versão continua usando SQL Server; não é um site estático. Node.js faz o papel do servidor local.
- O banco e os dados continuam fora dos arquivos do site e são compartilhados apenas por quem acessar essa instância do servidor.
- Não exponha o servidor diretamente à internet. Para múltiplos computadores em uma rede, configure hospedagem, HTTPS, autenticação e firewall adequadamente.
- Se o SQL Server apresentar erro de conexão, confirme o nome da instância e que o serviço está iniciado. Se a mensagem mencionar `CREATE DATABASE`, o login do SQL Server precisa ter permissão de criação ou o banco deve ser criado previamente por um administrador.
