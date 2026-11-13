# Auditoria operacional — versão para validação

**Não instale em produção sem testar em um banco de homologação restaurado de backup.** Esta alteração usa triggers SQL Server e altera operações centrais do sistema. Não foi validada em SQL Server real neste ambiente. Faça backup antes de qualquer aplicação. Precisa de SQL Server com `CREATE OR ALTER TRIGGER`, `SESSION_CONTEXT` e `FOR JSON` (SQL Server 2016 SP1 ou posterior; compatibilidade do banco 130 ou superior).

## Escopo

A tabela `dbo.auditoria_operacoes` é criada no banco selecionado pelo `DB_NAME`. Não altera o arquivo `.env`. As alterações de clientes, veículos, serviços, tipos, produtos, estoque, produção, carcaças, ordens, cargas, pedidos, itens, condições e lançamentos financeiros são registradas por triggers na mesma transação. O JSON anterior e posterior contém os dados armazenados na linha, inclusive dados pessoais e financeiros: restrinja a consulta ao histórico e aos backups. Senhas, tokens, logins e requisições de leitura não são registrados. Falhas e transações revertidas não são registradas nessa tabela transacional.

`usuario` identifica o login da aplicação validado pelo servidor. Se pessoas compartilharem esse login, o histórico não poderá diferenciá-las. `loginSql` identifica a conta do SQL Server. `usuario`, `origem` e `requisicaoId` podem ser nulos em alterações externas ao aplicativo e em migrações. Alterações feitas diretamente no banco poderão ter autoria apenas da conta SQL; quem possui privilégios administrativos pode editar ou excluir registros, alterar triggers ou simular contexto. A tabela por si só não é um registro inviolável: restrinja permissões, mantenha backup e, quando for necessário alto grau de comprovação, envie cópias para armazenamento externo protegido.

O histórico passa a valer após a instalação; não reconstrói mudanças anteriores. Não há tela ou API de consulta nova. Apenas tabelas explicitamente listadas em `sql/auditoria.sql` estão incluídas; autenticação, outros sistemas, arquivos e tabelas não listadas não estão cobertos.

Cargas vinculadas a venda não baixam estoque pela segunda vez. A baixa original aparece na operação de faturamento. Edições de carga podem gerar um estorno e uma nova movimentação na mesma requisição. Registros de estoque usam `anterior` e `posterior` em JSON, e o identificador `requisicaoId` agrupa alterações da mesma chamada da aplicação.

## Consulta inicial

```sql
SELECT TOP (200) id, dataUtc, usuario, loginSql, requisicaoId, origem,
       tabela, registroId, operacao, anterior, posterior
FROM dbo.auditoria_operacoes
ORDER BY id DESC;
```

Movimentações do estoque, com saldo anterior/posterior:

```sql
SELECT TOP (200) id, dataUtc, usuario, requisicaoId, origem, registroId, operacao,
       JSON_VALUE(anterior, '$.produtoId') AS codigoAnterior,
       JSON_VALUE(posterior, '$.produtoId') AS codigoPosterior,
       TRY_CONVERT(int, JSON_VALUE(anterior, '$.qtd')) AS saldoAnterior,
       TRY_CONVERT(int, JSON_VALUE(posterior, '$.qtd')) AS saldoPosterior,
       TRY_CONVERT(int, JSON_VALUE(posterior, '$.qtd'))
         - TRY_CONVERT(int, JSON_VALUE(anterior, '$.qtd')) AS variacao
FROM dbo.auditoria_operacoes
WHERE tabela = N'estoque'
ORDER BY id DESC;
```

A variação de uma linha recém-criada ou excluída é nula porque um dos saldos não existe. `dataUtc` está em UTC; ajuste a apresentação ao fuso desejado.

## Validação obrigatória no banco de teste

1. Confirme que o `.env` aponta **somente** para o banco de teste. Reinicie, verifique se a migração terminou e confira a tabela e os triggers.
2. Cadastre, altere e exclua um cliente de teste e confira o histórico e o login. Repita com um produto.
3. Com saldo conhecido, crie carga e descarga sem venda; confira quantidade e saldos anterior/posterior. Edite e exclua uma carga e confira os estornos.
4. Fatore e cancele um pedido; confira estoque, financeiro, itens e IDs de requisição. Faça uma carga vinculada a essa venda e confirme ausência de segunda baixa.
5. Force uma falha por estoque insuficiente e confirme que nem estoque, nem log da operação foram gravados. Verifique operações concorrentes e login em duas sessões.
6. Teste formas de pagamento, lançamentos e ordens de carcaça; verifique reinicialização com boot rápido e também a migração completa.
7. Confirme que operações SQL externas não aparecem atribuídas ao último usuário da aplicação. Teste falhas de conexão e reutilização de conexões para evitar contexto de usuário residual.

Os testes automatizados locais usam driver simulado; não substituem estes testes em SQL Server real. Em caso de falha, não use em produção. A reversão do arquivo via Git não remove automaticamente tabela ou triggers já instalados: precisa de procedimento de desinstalação e avaliação do histórico.
