function render() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === (pedidoId ? "vendas" : page)));
  const actions = document.getElementById("actions");
  const view = document.getElementById("view");
  if (vendaRascunho) {
    renderVenda();
    addLogoutButton();
    return;
  }
  if (pedidoId) {
    renderPedido();
    addLogoutButton();
    return;
  }
  const [title, lede] = TITLES[page];
  document.getElementById("title").textContent = title;
  document.getElementById("lede").textContent = lede;
  const creates = { clientes: "Cadastrar entidade", veiculos: "Cadastrar veículo", servicos: "Cadastrar serviço", produtos: "Cadastrar produto", carcacas: "Novo apontamento", estoque: "Novo item", producao: "Novo apontamento", cargas: "Novo movimento", vendas: "Novo pedido", financeiro: "Novo lançamento", condicoesPagamento: "Nova forma de pagamento" };
  actions.innerHTML = creates[page] ? `<button class="btn" id="addBtn">${creates[page]}</button>` : "";
  addLogoutButton();
  view.innerHTML = views[page]();
  const add = document.getElementById("addBtn");
  if (add) add.onclick = () => page === "vendas" ? iniciarPedido() : openForm(({ carcacas: "carcacaOrdens", financeiro: "lancamentos" })[page] || page);
  const q = document.getElementById("q");
  if (q) q.oninput = () => { query = q.value; vendaPagina = 1; const pos = q.selectionStart; render(); const next = document.getElementById("q"); if (next) { next.focus(); next.selectionStart = next.selectionEnd = pos; } };
  view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
    const [kind, id] = b.dataset.edit.split(":");
    openForm(kind, db[kind].find((row) => sameId(row.id, id)));
  });
  view.querySelectorAll("[data-pdf-carcaca]").forEach((b) => b.onclick = async () => {
    const textoOriginal = b.textContent;
    b.disabled = true;
    b.textContent = "Gerando PDF...";
    try { await baixarArquivo(`/api/carcaca-ordens/${b.dataset.pdfCarcaca}/pdf`, "apontamento.pdf"); }
    catch (error) { toast(`Não foi possível gerar o PDF: ${error.message}`, "bad"); }
    finally { b.disabled = false; b.textContent = textoOriginal; }
  });
  if (page === "financeiro") ligarFinanceiro(view);
  view.querySelectorAll("[data-venda-filtro]").forEach((b) => b.onclick = () => { vendaFiltro = b.dataset.vendaFiltro; vendaPagina = 1; render(); });
  view.querySelectorAll("[data-venda-pagina]").forEach((b) => b.onclick = () => {
    vendaPagina = Number(b.dataset.vendaPagina) || 1;
    render();
    window.scrollTo({ top: 0 });
  });
  view.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    const [kind, id] = b.dataset.del.split(":");
    removeRow(kind, id);
  });
  view.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => {
    pedidoId = b.dataset.open;
    editingPedidoId = null;
    vendaRascunho = null;
    confirmDelete = "";
    render();
  });
}

const views = {
  painel() {
    const carc = (db.carcacaOrdens || []).reduce((soma, ordem) => soma + (ordem.itens || []).reduce((a, i) => a + Number(i.qtd || 0), 0), 0);
    const est = db.estoque.reduce((a, r) => a + Number(r.qtd || 0), 0);
    const baixos = db.estoque.filter((r) => Number(r.qtd) < Number(r.minimo));
    const mes = today().slice(0, 7);
    const prod = db.producao.filter((r) => String(r.data).startsWith(mes)).reduce((a, r) => a + Number(r.qtd || 0), 0);
    const pagos = db.lancamentos.filter((l) => situacaoLancamento(l) === "pago");
    const ent = pagos.filter((l) => l.tipo === "receber").reduce((a, l) => a + Number(l.valor || 0), 0);
    const sai = pagos.filter((l) => l.tipo === "pagar").reduce((a, l) => a + Number(l.valor || 0), 0);
    const alertas = [
      ...baixos.map((r) => `Estoque baixo: ${r.item} (${r.qtd} de ${r.minimo})`),
      ...db.lancamentos.filter((l) => situacaoLancamento(l) === "vencido").map((l) =>
        `${l.tipo === "pagar" ? "A pagar" : "A receber"} vencido: ${l.pessoa || l.descricao || l.codigo} · ${money(l.valor)} · venceu em ${br(l.vencimento)}`)
    ];
    return `<div class="kpis">
      <div class="card"><span>Carcaças</span><strong>${carc}</strong><em>unidades</em></div>
      <div class="card"><span>Estoque</span><strong>${est}</strong><em>${baixos.length} abaixo do mínimo</em></div>
      <div class="card"><span>Produção no mês</span><strong>${prod}</strong><em>pneus</em></div>
      <div class="card"><span>Saldo</span><strong>${money(ent - sai)}</strong><em>recebido menos pago (Financeiro)</em></div>
    </div>
    <div>
      <section class="card"><h2>Alertas</h2>${alertas.length ? `<ul class="list">${alertas.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : `<p class="hint">Nenhum alerta.</p>`}</section>
    </div>`;
  },
  produtos() {
    const busca = normalizarBuscaEntidade(query);
    const produtos = db.produtos.filter((produto) => !busca || normalizarBuscaEntidade([
      produto.produtoId, produto.nome, produto.categoria, produto.modelo, produto.medida, produto.status
    ].join(" ")).includes(busca));
    const ativos = db.produtos.filter((produto) => String(produto.status || "").toLowerCase() !== "inativo").length;
    const estoqueLocalTotal = db.produtos.reduce((soma, produto) => soma + estoqueLocal(produto), 0);
    return `<div class="produto-resumo-kpis">
      <div class="produto-resumo-kpi"><span>Produtos cadastrados</span><strong>${db.produtos.length}</strong></div>
      <div class="produto-resumo-kpi"><span>Produtos ativos</span><strong>${ativos}</strong></div>
      <div class="produto-resumo-kpi"><span>Estoque local</span><strong>${estoqueLocalTotal} <small>un.</small></strong></div>
          </div>
    <section class="card produto-admin">
      <div class="produto-admin-toolbar">
        <label>Pesquisar produto<input id="q" type="search" placeholder="Nome, código, categoria, modelo ou medida" value="${escapeAttr(query)}"></label>
        <span>${produtos.length} de ${db.produtos.length} produtos</span>
      </div>
      <div class="produto-admin-grid">${produtos.length ? produtos.map((produto) => {
        const estoque = estoqueLocal(produto);
        return `<article class="produto-admin-card">
          <div class="produto-admin-topo"><span class="produto-codigo">${escapeHtml(produto.produtoId || "Sem código")}</span>${badge(produto.status)}</div>
          <div class="produto-admin-info"><h2>${escapeHtml(produto.nome)}</h2><p>${escapeHtml([produto.categoria, produto.modelo, produto.medida].filter(Boolean).join(" · ") || "Produto sem categoria ou medida")}</p></div>
          <div class="produto-admin-preco"><span>Preço de venda</span><strong>${money(produto.preco)}</strong></div>
          <div class="produto-admin-estoque">
            <div><span>Estoque local</span><strong class="${estoque > 0 ? "ok" : "warn"}">${estoque} <small>un.</small></strong></div>
                      </div>
          <div class="produto-admin-acoes"><button class="btn ghost small" type="button" data-edit="produtos:${escapeHtml(produto.id)}">Editar produto</button><button class="btn danger small" type="button" data-del="produtos:${escapeHtml(produto.id)}">Excluir</button></div>
        </article>`;
      }).join("") : `<p class="hint">${db.produtos.length ? "Nenhum produto corresponde à pesquisa." : "Nenhum produto cadastrado. Use “Cadastrar produto” para criar o primeiro item do catálogo."}</p>`}</div>
    </section>`;
  },
  veiculos() { return table("veiculos", ["Entidade", "Marca", "Modelo", "Ano", "Placa", "Medida do pneu", "Status"], (r) => [
    escapeHtml(db.clientes.find((cliente) => cliente.id === r.clienteId)?.nome || "Entidade não encontrada"),
    escapeHtml(r.marca), escapeHtml(r.modelo), escapeHtml(r.ano), escapeHtml(r.placa), escapeHtml(r.medidaPneu), badge(r.status)
  ]); },
  servicos() { return table("servicos", ["Código", "Serviço", "Descrição", "Preço", "Status"], (r) => [
    escapeHtml(r.codigo), escapeHtml(r.nome), escapeHtml(r.descricao), money(r.preco), badge(r.status)
  ]); },
  carcacas() {
    const ordens = db.carcacaOrdens || [];
    const busca = normalizarBuscaEntidade(query);
    const lista = ordens.filter((ordem) => !busca || normalizarBuscaEntidade([
      ordem.numero, ordem.dono, ordem.origem, ordem.status
    ].join(" ")).includes(busca));
    const quantidadeTotal = ordens.reduce((soma, ordem) => soma + (ordem.itens || []).reduce((a, i) => a + (Number(i.qtd) || 0), 0), 0);
    const valorTotal = ordens.reduce((soma, ordem) => soma + (Number(ordem.total) || 0), 0);
    return `<div class="produto-resumo-kpis carcacas-resumo-kpis">
      <div class="produto-resumo-kpi"><span>Apontamentos</span><strong>${ordens.length}</strong></div>
      <div class="produto-resumo-kpi"><span>Carcaças apontadas</span><strong>${quantidadeTotal} <small>un.</small></strong></div>
      <div class="produto-resumo-kpi"><span>Valor total apontado</span><strong>${money(valorTotal)}</strong></div>
    </div>
    <div class="toolbar"><input id="q" placeholder="Filtrar por número, dono ou status" value="${escapeAttr(query)}" /></div>
    ${lista.length ? lista.map((ordem) => {
      const itens = ordem.itens || [];
      const quantidade = itens.reduce((a, i) => a + (Number(i.qtd) || 0), 0);
      const registrado = String(ordem.status || "").trim().toLocaleLowerCase("pt-BR") === "registrado";
      return `<section class="card ordem-carcaca">
        <div class="ordem-carcaca-topo"><span class="mono">${escapeHtml(ordem.numero || "—")}</span>${badge(ordem.status)}</div>
        <dl class="capa">
          <div><dt>Data</dt><dd>${br(ordem.data)}</dd></div>
          <div><dt>Dono / fornecedor</dt><dd>${escapeHtml(ordem.dono || "—")}</dd></div>
          <div><dt>Origem</dt><dd>${escapeHtml(ordem.origem || "—")}</dd></div>
          <div><dt>Carcaças</dt><dd class="num">${quantidade} un.</dd></div>
          <div><dt>Total</dt><dd class="num">${money(ordem.total)}</dd></div>
        </dl>
        <details class="ordem-carcaca-itens"><summary>Ver itens (${itens.length})</summary>
          <div class="table-wrap"><table><thead><tr><th>Código</th><th>Carcaça</th><th>Medida</th><th>Qtd</th><th>Valor unit.</th><th>Total</th></tr></thead>
          <tbody>${itens.map((item) => `<tr>
            <td>${escapeHtml(item.produtoId || "—")}</td><td>${escapeHtml(item.item || "—")}</td><td>${escapeHtml(item.medida || "—")}</td>
            <td>${item.qtd}</td><td>${money(item.valorUnitario)}</td>
            <td>${money(item.valorTotal !== "" && item.valorTotal != null ? item.valorTotal : (Number(item.qtd) || 0) * (Number(item.valorUnitario) || 0))}</td>
          </tr>`).join("")}</tbody></table></div>
        </details>
        <div class="produto-admin-acoes"><button class="btn ghost small" type="button" data-pdf-carcaca="${escapeAttr(ordem.id)}">Baixar PDF</button>${registrado
          ? `<button class="btn ghost small" type="button" data-edit="carcacaOrdens:${escapeHtml(ordem.id)}">Editar</button><button class="btn danger small" type="button" data-del="carcacaOrdens:${escapeHtml(ordem.id)}">Excluir</button>`
          : `<span class="hint">Apontamento conferido — somente leitura.</span>`}</div>
      </section>`;
    }).join("") : `<p class="hint">${ordens.length ? "Nenhum apontamento corresponde à pesquisa." : "Nenhum apontamento criado. Use “Novo apontamento” para registrar a entrada de carcaças."}</p>`}`;
  },
  estoque() { return table("estoque", ["produtoId", "Descrição", "Medida", "Qtd", "Mínimo"], (r) => {
    const produto = db.produtos.find(p =>
      p.produtoId && r.produtoId && String(p.produtoId).trim().toLowerCase() === String(r.produtoId).trim().toLowerCase()
    );
    return [escapeHtml(r.produtoId || produto?.produtoId || ""), escapeHtml(produto?.nome || r.item || ""), escapeHtml(r.medida || produto?.medida || ""), r.qtd, r.minimo];
  }); },
  producao() { return table("producao", ["Data", "Turno", "Medida", "Qtd", "Operador", "Status"], (r) => [br(r.data), escapeHtml(r.turno), escapeHtml(r.medida), r.qtd, escapeHtml(r.operador), badge(r.status)]); },
  cargas() { return table("cargas", ["Tipo", "Data", "Venda", "Cliente", "Produtos", "Peças", "Estoque", "Motorista", "Funcionário", "Status"], (r) => {
    const venda = db.pedidos.find((pedido) => sameId(pedido.id, r.pedidoId));
    const cliente = venda?.cliente || db.clientes.find((item) => sameId(item.id, venda?.clienteId))?.nome || "—";
    const itens = Array.isArray(r.itens) ? r.itens : [];
    const pecas = itens.length ? itens.reduce((soma, item) => soma + (Number(item.qtd) || 0), 0) : (venda ? totalPecasPedido(venda) : "—");
    const produtos = itens.length
      ? `<span title="${escapeAttr(itens.map((item) => `${item.qtd}× ${item.item || item.produtoId || "Produto"}`).join("\n"))}">${itens.length} ${itens.length === 1 ? "produto" : "produtos"}</span>`
      : "—";
    const estoque = r.estoqueMovimentado === true || r.estoqueMovimentado === 1
      ? (String(r.tipo).toLowerCase() === "descarga" ? "Entrada" : "Saída")
      : "—";
    return [
      escapeHtml(r.tipo), br(r.data), escapeHtml(venda?.numero || "—"), escapeHtml(cliente),
      produtos, pecas, estoque, escapeHtml(r.motorista), escapeHtml(r.funcionario), badge(r.status)
    ];
  }); },
  vendas() {
    const q = query.toLowerCase();
    const situacoes = new Map(db.pedidos.map((p) => [p.id, situacaoVenda(p)]));
    const contar = (filtro) => db.pedidos.filter((p) => filtro === "todas" || situacoes.get(p.id).chave === filtro).length;
    const chip = (valor, rotulo) => {
      const ativo = vendaFiltro === valor;
      return `<button type="button" class="fin-chip${ativo ? " ativo" : ""}" aria-pressed="${ativo}" data-venda-filtro="${valor}">${rotulo} <span class="venda-chip-qtd">${contar(valor)}</span></button>`;
    };
    const lista = db.pedidos
      .filter((p) => vendaFiltro === "todas" || situacoes.get(p.id).chave === vendaFiltro)
      .filter((p) => !q || `${p.numero} ${p.cliente} ${nomeCondicao(p)} ${p.status} ${situacoes.get(p.id).rotulo} ${p.vendedor}`.toLowerCase().includes(q));
    const vazio = vendaFiltro === "todas" && !q ? "Nenhum pedido." : "Nenhum pedido com esse filtro.";
    const totalPaginas = Math.max(1, Math.ceil(lista.length / VENDAS_POR_PAGINA));
    vendaPagina = Math.min(Math.max(1, vendaPagina), totalPaginas);
    const inicio = (vendaPagina - 1) * VENDAS_POR_PAGINA;
    const paginaAtual = lista.slice(inicio, inicio + VENDAS_POR_PAGINA);
    return `<div class="fin-filtros venda-filtros">
        <div class="fin-chips" role="group" aria-label="Situação da venda">${chip("todas", "Todas")}${chip("orcamento", "Orçamento")}${chip("apagar", "Faturado a pagar")}${chip("pago", "Faturado pago")}${chip("cancelado", "Cancelados")}</div>
        <label class="fin-busca">Pesquisar<input id="q" type="search" placeholder="Cliente, número ou forma de pagamento" value="${escapeAttr(query)}" /></label>
      </div>
      ${paginaAtual.map((p) => {
        const situacao = situacoes.get(p.id);
        return `<button class="pedido pedido-listagem" data-open="${p.id}" type="button">
        <div class="back" style="justify-content:space-between"><span class="mono">${escapeHtml(p.numero)}</span><span class="badge ${situacao.tom}">${escapeHtml(situacao.rotulo)}</span></div>
        <h3>${escapeHtml(p.cliente)}</h3>
        <dl class="capa">
          <div><dt>Data</dt><dd>${br(p.data)}</dd></div>
          <div><dt>Pagamento</dt><dd>${escapeHtml(nomeCondicao(p) || "—")}</dd></div>
          <div><dt>Itens</dt><dd class="num">${p.itens.length}</dd></div>
          <div><dt>Total</dt><dd class="num">${money(totalPedido(p))}</dd></div>
          ${situacao.chave === "apagar" && situacao.emAberto > 0 ? `<div><dt>Em aberto</dt><dd class="num">${money(situacao.emAberto)}</dd></div>` : ""}
        </dl>
      </button>`;
      }).join("") || `<p class="hint">${vazio}</p>`}
      ${paginacaoMarkup(vendaPagina, totalPaginas, lista.length, inicio, paginaAtual.length, "data-venda-pagina")}`;
  },
  financeiro() {
    const lancamentos = db.lancamentos || [];
    const soma = (lista) => lista.reduce((total, l) => total + (Number(l.valor) || 0), 0);
    const abertos = lancamentos.filter((l) => ["pendente", "vencido"].includes(situacaoLancamento(l)));
    const aReceber = abertos.filter((l) => l.tipo === "receber");
    const aPagar = abertos.filter((l) => l.tipo === "pagar");
    const vencidos = abertos.filter((l) => situacaoLancamento(l) === "vencido");
    const mes = today().slice(0, 7);
    const pagosMes = lancamentos.filter((l) => situacaoLancamento(l) === "pago" && String(l.pagamento || "").startsWith(mes));
    const recebidoMes = soma(pagosMes.filter((l) => l.tipo === "receber"));
    const pagoMes = soma(pagosMes.filter((l) => l.tipo === "pagar"));

    const busca = normalizarBuscaEntidade(query.trim());
    const lista = lancamentos
      .filter((l) => finFiltro.tipo === "todos" || l.tipo === finFiltro.tipo)
      .filter((l) => {
        const situacao = situacaoLancamento(l);
        return finFiltro.situacao === "todos"
          || (finFiltro.situacao === "abertos" && (situacao === "pendente" || situacao === "vencido"))
          || (finFiltro.situacao === "vencidos" && situacao === "vencido")
          || (finFiltro.situacao === "pagos" && situacao === "pago")
          || (finFiltro.situacao === "cancelados" && situacao === "cancelado");
      })
      .filter((l) => !finFiltro.categoria || String(l.categoriaId) === finFiltro.categoria)
      .filter((l) => !busca || normalizarBuscaEntidade([l.codigo, l.pessoa, l.descricao, l.documento, l.categoria, l.pedidoNumero, l.obs].join(" ")).includes(busca))
      .sort(ordenarLancamentos);
    const listaReceber = soma(lista.filter((l) => l.tipo === "receber" && situacaoLancamento(l) !== "cancelado"));
    const listaPagar = soma(lista.filter((l) => l.tipo === "pagar" && situacaoLancamento(l) !== "cancelado"));

    const chip = (grupo, valor, rotulo) => {
      const ativo = finFiltro[grupo] === valor;
      return `<button type="button" class="fin-chip${ativo ? " ativo" : ""}" aria-pressed="${ativo}" data-fin-${grupo}="${valor}">${rotulo}</button>`;
    };
    const categorias = (db.financeiroCategoria || []).filter((c) => finFiltro.tipo === "todos" || !c.tipo || c.tipo === finFiltro.tipo);

    return `<div class="fin-kpis">
      <button type="button" class="fin-kpi receber" data-fin-atalho="receber"><span>A receber (em aberto)</span><strong>${money(soma(aReceber))}</strong><em>${aReceber.length} lançamento(s)</em></button>
      <button type="button" class="fin-kpi pagar" data-fin-atalho="pagar"><span>A pagar (em aberto)</span><strong>${money(soma(aPagar))}</strong><em>${aPagar.length} lançamento(s)</em></button>
      <button type="button" class="fin-kpi vencido" data-fin-atalho="vencidos"><span>Vencidos</span><strong>${money(soma(vencidos))}</strong><em>${vencidos.length} lançamento(s)</em></button>
      <div class="fin-kpi saldo"><span>Saldo do mês</span><strong>${money(recebidoMes - pagoMes)}</strong><em>recebido ${money(recebidoMes)} · pago ${money(pagoMes)}</em></div>
    </div>
    <section class="fin-painel">
      <div class="fin-filtros">
        <div class="fin-chips" role="group" aria-label="Tipo">${chip("tipo", "todos", "Todos")}${chip("tipo", "receber", "A receber")}${chip("tipo", "pagar", "A pagar")}</div>
        <div class="fin-chips" role="group" aria-label="Situação">${chip("situacao", "todos", "Todas")}${chip("situacao", "abertos", "Em aberto")}${chip("situacao", "vencidos", "Vencidos")}${chip("situacao", "pagos", "Pagos")}${chip("situacao", "cancelados", "Cancelados")}</div>
        <label>Categoria<select id="finCategoria"><option value="">Todas as categorias</option>${categorias.map((c) =>
          `<option value="${escapeAttr(c.id)}" ${String(c.id) === finFiltro.categoria ? "selected" : ""}>${escapeHtml(c.nome)}</option>`).join("")}</select></label>
        <label class="fin-busca">Pesquisar<input id="q" type="search" placeholder="Entidade, descrição, nº do boleto, venda..." value="${escapeAttr(query)}"></label>
      </div>
      <div class="table-wrap"><table class="fin-tabela"><thead><tr>
        <th>Vencimento</th><th>Tipo</th><th>Categoria</th><th>Entidade / favorecido</th><th>Descrição</th><th class="num">Valor</th><th>Situação</th><th></th>
      </tr></thead><tbody>
      ${lista.map((l) => {
        const situacao = situacaoLancamento(l);
        const aberto = situacao === "pendente" || situacao === "vencido";
        const detalhes = [l.documento ? `Doc. ${l.documento}` : "", l.pedidoNumero ? `Venda ${l.pedidoNumero}` : "", nomeCondicao(l, "formaPagamento"), l.codigo].filter(Boolean).join(" · ");
        const entidade = db.clientes.find((c) => sameId(c.id, l.entidadeId));
        return `<tr class="fin-linha ${situacao}">
          <td>${br(l.vencimento)}</td>
          <td><span class="fin-tipo ${l.tipo === "pagar" ? "pagar" : "receber"}">${l.tipo === "pagar" ? "A pagar" : "A receber"}</span></td>
          <td>${escapeHtml(l.categoria || "—")}</td>
          <td><strong>${escapeHtml(l.pessoa || "—")}</strong>${entidade?.tipo ? `<small class="fin-sub">${escapeHtml(entidade.tipo)}</small>` : ""}</td>
          <td>${escapeHtml(l.descricao || "—")}${detalhes ? `<small class="fin-sub">${escapeHtml(detalhes)}</small>` : ""}</td>
          <td class="num fin-valor ${l.tipo === "pagar" ? "pagar" : "receber"}">${l.tipo === "pagar" ? "- " : ""}${money(l.valor)}</td>
          <td><span class="badge ${tone(situacao)}">${situacao}</span>${situacao === "pago" && l.pagamento ? `<small class="fin-sub">em ${br(l.pagamento)}</small>` : ""}</td>
          <td class="fin-acoes">${aberto ? `<button class="btn small" type="button" data-fin-pagar="${escapeAttr(l.id)}">${l.tipo === "pagar" ? "Marcar pago" : "Marcar recebido"}</button>` : ""}
            <button class="btn ghost small" type="button" data-edit="lancamentos:${escapeAttr(l.id)}">Editar</button>
            <button class="btn danger small" type="button" data-del="lancamentos:${escapeAttr(l.id)}">Excluir</button></td>
        </tr>`;
      }).join("") || `<tr><td colspan="8">${lancamentos.length ? "Nenhum lançamento com esses filtros." : "Nenhum lançamento. Use “Novo lançamento” para registrar boletos, contas e despesas."}</td></tr>`}
      </tbody></table></div>
      <div class="fin-rodape"><span>${lista.length} lançamento(s)</span><span>A receber: <strong>${money(listaReceber)}</strong></span><span>A pagar: <strong>${money(listaPagar)}</strong></span><span>Diferença: <strong>${money(listaReceber - listaPagar)}</strong></span></div>
    </section>`;
  },
  condicoesPagamento() {
    const condicoes = db.condicoesPagamento || [];
    const busca = normalizarBuscaEntidade(query.trim());
    const lista = condicoes.filter((c) => !busca || normalizarBuscaEntidade([c.Codigo, c.Descricao, c.Tipo, c.Status, descreverVencimentos(c)].join(" ")).includes(busca));
    const usos = (c) => db.pedidos.filter((p) => sameId(p.condicaoPagamentoId, c.id)).length;
    const ativas = condicoes.filter((c) => String(c.Status || "").toLowerCase() !== "inativo").length;
    return `<div class="toolbar"><input id="q" type="search" placeholder="Filtrar por descrição, tipo ou status" value="${escapeAttr(query)}" /></div>
    ${ativas ? "" : `<p class="hint condicao-aviso">Nenhuma forma de pagamento ativa: cadastre ou ative uma para conseguir concluir vendas.</p>`}
    <div class="table-wrap"><table class="condicoes-tabela"><thead><tr>
      <th>Código</th><th>Descrição</th><th>Tipo</th><th class="num">Parcelas</th><th class="num">Prazo médio</th><th>Vencimentos</th><th class="num">Vendas</th><th>Status</th><th></th>
    </tr></thead><tbody>
    ${lista.map((c) => {
      const ativa = String(c.Status || "").toLowerCase() !== "inativo";
      return `<tr class="${ativa ? "" : "condicao-inativa"}">
        <td>${escapeHtml(c.Codigo)}</td>
        <td><strong>${escapeHtml(c.Descricao)}</strong></td>
        <td>${escapeHtml(c.Tipo)}</td>
        <td class="num">${escapeHtml(c.QuantidadeParcelas)}</td>
        <td class="num">${Number(c.PrazoMedio) ? `${escapeHtml(c.PrazoMedio)} dias` : "—"}</td>
        <td>${escapeHtml(descreverVencimentos(c))}</td>
        <td class="num">${usos(c)}</td>
        <td><span class="badge ${ativa ? "ok" : "bad"}">${ativa ? "Ativo" : "Inativo"}</span></td>
        <td class="fin-acoes"><button class="btn ghost small" type="button" data-edit="condicoesPagamento:${escapeAttr(c.id)}">Editar</button>
          <button class="btn danger small" type="button" data-del="condicoesPagamento:${escapeAttr(c.id)}">Excluir</button></td>
      </tr>`;
    }).join("") || `<tr><td colspan="9">${condicoes.length ? "Nenhuma forma de pagamento com esse filtro." : "Nenhuma forma de pagamento cadastrada."}</td></tr>`}
    </tbody></table></div>`;
  },
  clientes() { return table("clientes", ["Código", "Nome / Razão social", "Tipo", "CPF / CNPJ", "Telefone", "E-mail", "Cidade / UF", "Status"], (r) => [
    escapeHtml(r.codigo || r.id), escapeHtml(r.nome), escapeHtml(r.tipo), escapeHtml(r.documento), escapeHtml(r.telefone), escapeHtml(r.email),
    escapeHtml([r.cidade, r.estado].filter(Boolean).join(" / ")), badge(r.status)
  ]); }
};


// ===== Financeiro: situação, ordenação e ações da lista =====
// pendente com vencimento já passado aparece como "vencido".
// Paginação: "Mostrando 21–40 de 57" + Anterior · 1 … 4 5 6 … 9 · Próxima.
function paginacaoMarkup(atual, totalPaginas, totalItens, inicio, naPagina, atributo) {
  if (totalPaginas <= 1) return totalItens ? `<p class="paginacao-info">${totalItens} pedido(s)</p>` : "";
  const numeros = [];
  for (let n = 1; n <= totalPaginas; n++) {
    if (n === 1 || n === totalPaginas || Math.abs(n - atual) <= 1) numeros.push(n);
    else if (numeros[numeros.length - 1] !== "…") numeros.push("…");
  }
  const numero = (n) => `<button type="button" class="paginacao-btn${n === atual ? " ativo" : ""}" ${atributo}="${n}" ${n === atual ? 'aria-current="page"' : ""}>${n}</button>`;
  const seta = (n, rotulo, desabilitado) => `<button type="button" class="paginacao-btn" ${atributo}="${n}" ${desabilitado ? "disabled" : ""}>${rotulo}</button>`;
  return `<div class="paginacao" role="navigation" aria-label="Paginação">
    <span class="paginacao-info">Mostrando ${inicio + 1}–${inicio + naPagina} de ${totalItens}</span>
    <div class="paginacao-botoes">
      ${seta(atual - 1, "← Anterior", atual === 1)}
      ${numeros.map((n) => n === "…" ? `<span class="paginacao-reticencias">…</span>` : numero(n)).join("")}
      ${seta(atual + 1, "Próxima →", atual === totalPaginas)}
    </div>
  </div>`;
}

// Situação da venda para o filtro: orçamento, faturado a pagar, faturado pago ou cancelado.
// "Faturado pago" = venda marcada como paga ou com todos os lançamentos do Financeiro recebidos.
function situacaoVenda(pedido) {
  const status = String(pedido?.status || "").toLowerCase();
  if (status === "cancelado") return { chave: "cancelado", rotulo: "cancelado", tom: "bad", emAberto: 0 };
  if (status === "orçamento" || status === "orcamento") return { chave: "orcamento", rotulo: "orçamento", tom: "warn", emAberto: 0 };
  const titulos = (db.lancamentos || []).filter((l) => sameId(l.pedidoId, pedido.id) && String(l.status || "").toLowerCase() !== "cancelado");
  const abertos = titulos.filter((l) => String(l.status || "").toLowerCase() !== "pago");
  if (status === "pago" || (titulos.length && !abertos.length)) return { chave: "pago", rotulo: "faturado · pago", tom: "ok", emAberto: 0 };
  const emAberto = abertos.length ? abertos.reduce((soma, l) => soma + (Number(l.valor) || 0), 0) : totalPedido(pedido);
  const vencido = abertos.some((l) => situacaoLancamento(l) === "vencido");
  return { chave: "apagar", rotulo: vencido ? "faturado · a pagar (vencido)" : "faturado · a pagar", tom: vencido ? "bad" : "warn", emAberto };
}

function situacaoLancamento(lancamento) {
  const status = String(lancamento?.status || "").toLowerCase();
  if (status === "pago" || status === "cancelado") return status;
  return lancamento?.vencimento && lancamento.vencimento < today() ? "vencido" : "pendente";
}

// Vencidos primeiro, depois pendentes (vencimento mais próximo), pagos (mais recentes) e cancelados.
function ordenarLancamentos(a, b) {
  const peso = { vencido: 0, pendente: 1, pago: 2, cancelado: 3 };
  const sa = situacaoLancamento(a);
  const sb = situacaoLancamento(b);
  if (peso[sa] !== peso[sb]) return peso[sa] - peso[sb];
  if (peso[sa] <= 1) return String(a.vencimento || "9999").localeCompare(String(b.vencimento || "9999"));
  return String(b.pagamento || b.vencimento || "").localeCompare(String(a.pagamento || a.vencimento || ""));
}

function ligarFinanceiro(view) {
  view.querySelectorAll("[data-fin-tipo]").forEach((b) => b.onclick = () => {
    finFiltro.tipo = b.dataset.finTipo;
    const categoria = (db.financeiroCategoria || []).find((c) => String(c.id) === finFiltro.categoria);
    if (categoria?.tipo && finFiltro.tipo !== "todos" && categoria.tipo !== finFiltro.tipo) finFiltro.categoria = "";
    render();
  });
  view.querySelectorAll("[data-fin-situacao]").forEach((b) => b.onclick = () => { finFiltro.situacao = b.dataset.finSituacao; render(); });
  view.querySelectorAll("[data-fin-atalho]").forEach((b) => b.onclick = () => {
    const atalho = b.dataset.finAtalho;
    finFiltro = atalho === "vencidos"
      ? { tipo: "todos", situacao: "vencidos", categoria: "" }
      : { tipo: atalho, situacao: "abertos", categoria: "" };
    render();
  });
  const categoria = document.getElementById("finCategoria");
  if (categoria) categoria.onchange = () => { finFiltro.categoria = categoria.value; render(); };
  view.querySelectorAll("[data-fin-pagar]").forEach((b) => b.onclick = async () => {
    const lancamento = db.lancamentos.find((l) => sameId(l.id, b.dataset.finPagar));
    if (!lancamento) return;
    b.disabled = true;
    try {
      await api(`/api/lancamentos/${lancamento.id}`, { method: "PUT", body: JSON.stringify({ status: "pago", pagamento: today() }) });
      toast(`${lancamento.tipo === "pagar" ? "Pagamento" : "Recebimento"} registrado: ${lancamento.pessoa || lancamento.descricao || lancamento.codigo} · ${money(lancamento.valor)}`, "ok");
      await load();
      render();
    } catch (error) {
      b.disabled = false;
      toast(`Não foi possível registrar: ${error.message}`, "bad");
    }
  });
}

function showLoginOverlay(message = "") {
  const overlay = document.getElementById("loginOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  const error = document.getElementById("loginError");
  if (error) error.textContent = message;
  document.getElementById("loginUser")?.focus();
  if (!sessionStorage.getItem("token")) refreshLoginSetupMode();
}

async function refreshLoginSetupMode() {
  try {
    const response = await fetch("/api/login/status");
    if (!response.ok) throw new Error("Não foi possível verificar o acesso inicial.");
    const status = await response.json();
    setLoginSetupMode(!status.configurado);
  } catch (exception) {
    document.getElementById("loginError").textContent =
      exception.message || "Não foi possível verificar a configuração do acesso.";
  }
}

function hideLoginOverlay() {
  const overlay = document.getElementById("loginOverlay");
  if (overlay) overlay.hidden = true;
  const error = document.getElementById("loginError");
  if (error) error.textContent = "";
}

function setLoginSetupMode(setupRequired) {
  const confirmationLabel = document.getElementById("loginConfirmationLabel");
  const confirmationInput = document.getElementById("loginPassConfirmation");
  const passwordInput = document.getElementById("loginPass");
  if (setupRequired) {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("usuario");
    document.getElementById("loginError").textContent = "";
  }
  document.getElementById("loginTitle").textContent = setupRequired
    ? "Criar acesso inicial"
    : "Entrar no sistema";
  document.getElementById("loginButton").textContent = setupRequired
    ? "Criar acesso"
    : "Entrar";
  confirmationLabel.hidden = !setupRequired;
  confirmationInput.required = setupRequired;
  passwordInput.autocomplete = "off";
  if (setupRequired) passwordInput.minLength = 6;
  else passwordInput.removeAttribute("minlength");
}

function addLogoutButton() {
  const actions = document.getElementById("actions");
  if (!actions) return;
  if (!sessionStorage.getItem("token")) {
    document.getElementById("logoutBtn")?.remove();
    return;
  }
  if (document.getElementById("logoutBtn")) return;
  const button = document.createElement("button");
  button.id = "logoutBtn";
  button.type = "button";
  button.className = "btn ghost";
  button.textContent = "Sair";
  button.style.marginLeft = "8px";
  button.onclick = logout;
  actions.appendChild(button);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("loginForm");
  const submitButton = document.getElementById("loginButton");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const usuario = document.getElementById("loginUser").value.trim();
    const senha = document.getElementById("loginPass").value;
    const setupRequired = document.getElementById("loginConfirmationLabel").hidden === false;
    const error = document.getElementById("loginError");
    error.textContent = "";
    if (setupRequired && senha !== document.getElementById("loginPassConfirmation").value) {
      error.textContent = "A confirmação da senha não corresponde.";
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = "Entrando...";

    try {
      const response = await fetch(setupRequired ? "/api/login/setup" : "/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupRequired
          ? { usuario, senha, confirmacaoSenha: document.getElementById("loginPassConfirmation").value }
          : { usuario, senha })
      });
      if (!response.ok) {
        let message = response.status === 401
          ? "Usuário ou senha inválidos."
          : "Não foi possível entrar. Tente novamente.";
        try {
          const body = await response.json();
          message = body.detail || body.title || message;
        } catch {}
        if (setupRequired && response.status === 409) {
          setLoginSetupMode(false);
          document.getElementById("loginPassConfirmation").value = "";
        }
        throw new Error(message);
      }

      const data = await response.json();
      if (!data.token) throw new Error("O servidor não retornou um token de acesso.");
      sessionStorage.setItem("token", data.token);
      sessionStorage.setItem("usuario", data.usuario || usuario);
      document.getElementById("loginPass").value = "";
      document.getElementById("loginPassConfirmation").value = "";
      hideLoginOverlay();
      await reloadAndRender();
      addLogoutButton();
    } catch (exception) {
      error.textContent = exception instanceof TypeError
        ? "Não foi possível conectar ao servidor. Verifique se o sistema está rodando."
        : exception.message || "Falha no login. Tente novamente.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = document.getElementById("loginConfirmationLabel").hidden
        ? "Entrar"
        : "Criar acesso";
    }
  });

  if (sessionStorage.getItem("token")) {
    hideLoginOverlay();
    reloadAndRender().then(addLogoutButton);
  } else {
    showLoginOverlay();
  }
});

// Topo fixo: mede a altura do cabeçalho para a barra de filtros das vendas
// grudar logo abaixo dele, e marca a página como "rolada" para mostrar a divisória.
(function topoFixo() {
  const header = document.querySelector("header.top");
  if (!header) return;
  const medir = () => document.documentElement.style.setProperty("--altura-topo", `${header.offsetHeight}px`);
  if (typeof ResizeObserver === "function") new ResizeObserver(medir).observe(header);
  window.addEventListener("resize", medir);
  window.addEventListener("scroll", () => document.body.classList.toggle("rolado", window.scrollY > 4), { passive: true });
  medir();
})();
