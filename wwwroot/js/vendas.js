function iniciarPedido() {
  editingPedidoId = null;
  vendaRascunho = {
    clienteId: "", veiculoId: "", data: today(), pagamento: "pix", vendedor: "", previsao: "",
    obs: "", box: "", agendamento: "", horario: "", status: "orçamento", descontoPercentual: 0, itens: []
  };
  etapaVenda = 1;
  pedidoId = null;
  render();
}

function editarOrcamento(pedido) {
  if (pedido.status !== "orçamento") {
    alert("Somente orçamentos podem ser editados. Pedidos faturados são somente leitura.");
    return;
  }
  const cliente = db.clientes.find((item) => sameId(item.id, pedido.clienteId));
  if (!cliente) {
    alert("O cliente deste orçamento não está mais cadastrado. Não é possível editá-lo.");
    return;
  }
  const itens = pedido.itens.map((item) => {
    const tipo = item.tipo === "servico" ? "servico" : "pneu";
    const referencia = tipo === "servico" ? item.servicoRef : item.produtoRef;
    const cadastro = tipo === "servico"
      ? db.servicos.find((servico) => sameId(servico.id, referencia))
      : db.produtos.find((produto) => sameId(produto.id, referencia));
    return cadastro ? {
      tipo,
      referencia: cadastro.id,
      produtoRef: tipo === "pneu" ? cadastro.id : "",
      servicoRef: tipo === "servico" ? cadastro.id : "",
      produtoId: tipo === "pneu" ? cadastro.produtoId || "" : cadastro.codigo || "",
      descricao: cadastro.nome,
      medida: tipo === "pneu" ? cadastro.medida || "" : "",
      qtd: Number(item.qtd),
      unitario: Number(item.unitario ?? cadastro.preco) || 0
    } : null;
  });
  if (!itens.length || itens.some((item) => item === null)) {
    alert("Não foi possível carregar todos os itens deste orçamento para edição. Confira se os produtos e serviços ainda estão cadastrados e ativos.");
    return;
  }
  editingPedidoId = pedido.id;
  vendaRascunho = {
    clienteId: cliente.id,
    clienteBusca: cliente.nome,
    veiculoId: db.veiculos.find((veiculo) => sameId(veiculo.id, pedido.veiculoId))?.id || "",
    data: pedido.data || today(),
    pagamento: pedido.pagamento || "pix",
    vendedor: pedido.vendedor || "",
    previsao: pedido.previsao || "",
    obs: pedido.obs || "",
    box: pedido.box || "",
    agendamento: pedido.agendamento || "",
    horario: pedido.horario || "",
    status: "orçamento",
    descontoPercentual: Number(pedido.descontoPercentual) || 0,
    descontoValor: Number(pedido.descontoValor) || 0,
    itens
  };
  etapaVenda = 1;
  render();
}

function clienteSelecionado() {
  return db.clientes.find((cliente) => cliente.id === vendaRascunho?.clienteId);
}

function limiteDisponivel(cliente) {
  const usado = db.pedidos
    .filter((pedido) => pedido.clienteId === cliente.id && pedido.status === "faturado" && ["boleto", "a prazo"].includes(pedido.pagamento))
    .reduce((soma, pedido) => soma + totalPedido(pedido), 0);
  return Math.max(0, Number(cliente.limiteCredito || 0) - usado);
}

function estoqueLocal(produto) {
  return db.estoque
    .filter((linha) => linha.produtoRef === produto.id || (!linha.produtoRef && linha.produtoId === produto.produtoId))
    .reduce((soma, linha) => soma + Number(linha.qtd || 0), 0);
}

function produtoEhPneu(produto) {
  const categoria = String(produto.categoria || "").trim().toLocaleLowerCase("pt-BR");
  // Carcaças são cadastradas como produto, mas não podem ser vendidas: entram
  // nos apontamentos de entrada (aba Carcaças), não no catálogo da venda.
  return !["serviço", "servicos", "serviços", "carcaça", "carcaca", "carcaças", "carcacas"].includes(categoria);
}

function subtotalPorTipo(tipo) {
  return vendaRascunho.itens
    .filter((item) => item.tipo === tipo)
    .reduce((soma, item) => soma + item.qtd * item.unitario, 0);
}

function formatarValorVenda(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function alterarItem(tipo, id, quantidade) {
  const produto = tipo === "pneu" ? db.produtos.find((item) => item.id === id) : db.servicos.find((item) => item.id === id);
  if (!produto) return;
  const item = vendaRascunho.itens.find((linha) => linha.tipo === tipo && linha.referencia === id);
  if (quantidade <= 0) {
    vendaRascunho.itens = vendaRascunho.itens.filter((linha) => linha !== item);
  } else if (item) {
    item.qtd = Math.floor(quantidade);
  } else {
    vendaRascunho.itens.push({
      tipo,
      referencia: id,
      produtoRef: tipo === "pneu" ? id : "",
      servicoRef: tipo === "servico" ? id : "",
      produtoId: tipo === "pneu" ? produto.produtoId || "" : produto.codigo || "",
      descricao: produto.nome,
      medida: tipo === "pneu" ? produto.medida || "" : "",
      qtd: Math.floor(quantidade),
      unitario: Number(produto.preco) || 0
    });
  }
  render();
}

function itensMarkup(tipo) {
  const catalogo = tipo === "pneu" ? db.produtos.filter(produtoEhPneu) : db.servicos;
  const ativos = catalogo.filter((item) => String(item.status || "").toLowerCase() !== "inativo");
  return ativos.length ? ativos.map((item) => {
    const selecionado = vendaRascunho.itens.find((linha) => linha.tipo === tipo && linha.referencia === item.id);
    const qtd = selecionado?.qtd || 0;
    const precoUnitario = Number(selecionado?.unitario ?? item.preco) || 0;
    const detalhe = tipo === "pneu"
      ? [item.categoria, item.medida].filter(Boolean).join(" · ")
      : item.descricao || "Serviço de montagem";
    const estoque = tipo === "pneu" ? `<span>Estoque: <strong>${estoqueLocal(item)}</strong> un</span>` : "";
    return `<article class="venda-item ${qtd ? "selecionado" : ""}">
      <label class="venda-item-check"><input type="checkbox" data-check-item="${tipo}:${escapeHtml(item.id)}" ${qtd ? "checked" : ""}><span></span></label>
      <div class="venda-item-info">
        <span class="mono">${escapeHtml(tipo === "pneu" ? item.produtoId || "Sem código" : item.codigo || "Serviço")}</span>
        <h3>${escapeHtml(item.nome)}</h3><p>${escapeHtml(detalhe || "—")}</p>${estoque}
      </div>
      <strong class="venda-item-preco">${money(precoUnitario)}</strong>
      <div class="quantidade">
        <button type="button" aria-label="Diminuir quantidade" data-qty-change="${tipo}:${escapeHtml(item.id)}:-1">−</button>
        <input type="number" min="0" step="1" value="${qtd}" aria-label="Quantidade de ${escapeHtml(item.nome)}" data-qty-value="${tipo}:${escapeHtml(item.id)}">
        <button type="button" aria-label="Aumentar quantidade" data-qty-change="${tipo}:${escapeHtml(item.id)}:1">+</button>
      </div>
    </article>`;
  }).join("") : `<p class="hint">Nenhum ${tipo === "pneu" ? "pneu" : "serviço"} ativo cadastrado. Use as abas Produtos e Serviços para montar o catálogo.</p>`;
}

function etapasMarkup() {
  const nomes = ["Entidade / Veículo", "Pneus", "Serviços", "Valores", "Pagamento"];
  return `<div class="venda-etapas">${nomes.map((nome, index) => {
    const numero = index + 1;
    const estado = numero < etapaVenda ? "concluida" : numero === etapaVenda ? "atual" : "";
    return `<button type="button" class="venda-etapa ${estado}" data-etapa="${numero}" ${numero > etapaVenda ? "disabled" : ""}>
      <span>${numero < etapaVenda ? "✓" : numero}</span>${nome}
    </button>`;
  }).join("")}</div>`;
}

function clienteEtapaMarkup() {
  const selecionado = clienteSelecionado();
  const termoBusca = String(vendaRascunho.clienteBusca || "").trim();
  const sugestoes = !selecionado && termoBusca.length >= 3
    ? entidadesCorrespondentes(termoBusca).slice(0, 8)
    : [];
  const veiculos = selecionado
    ? db.veiculos.filter((veiculo) => sameId(veiculo.clienteId, selecionado.id) && String(veiculo.status || "").toLowerCase() !== "inativo")
    : [];
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 1 de 5</span><h2>Dados do cliente e veículo</h2>
    <label class="venda-busca">Buscar cliente por nome ou CPF / CNPJ
      <input id="buscaEntidadeVenda" type="search" placeholder="Digite ao menos 3 letras ou números" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="sugestoesEntidadeVenda" aria-expanded="${sugestoes.length ? "true" : "false"}" value="${escapeHtml(vendaRascunho.clienteBusca || "")}">
    </label>
    <div id="sugestoesEntidadeVenda" class="cliente-sugestoes" role="listbox">
      ${termoBusca.length >= 3 && !selecionado
      ? sugestoes.length
        ? sugestoes.map((cliente) => `<button type="button" class="cliente-sugestao" role="option" aria-selected="false" data-cliente-venda="${escapeHtml(cliente.id)}">
              <span><strong>${escapeHtml(cliente.nome)}</strong><small>${escapeHtml(cliente.documento || "Documento não cadastrado")}</small></span>
              <span class="cliente-sugestao-contato">${escapeHtml(cliente.telefone || cliente.email || "")}</span>
            </button>`).join("")
        : `<p class="cliente-sugestoes-vazio">Nenhum cliente correspondente.</p>`
      : ""}
    </div>
    ${selecionado ? `<div class="cliente-resumo">
      <div><span class="meta">Cliente</span><strong>${escapeHtml(selecionado.nome)}</strong><span>${escapeHtml(selecionado.documento || "Documento não cadastrado")}</span></div>
      <div><span class="meta">Limite de crédito</span><strong>${money(selecionado.limiteCredito)}</strong><span>Disponível: ${money(limiteDisponivel(selecionado))}</span></div>
    </div>
    <label class="venda-busca">Veículo
      <select id="veiculoVenda"><option value="">Sem veículo</option>${veiculos.map((v) => `<option value="${escapeHtml(v.id)}" ${v.id === vendaRascunho.veiculoId ? "selected" : ""}>${escapeHtml([v.marca, v.modelo, v.ano, v.placa].filter(Boolean).join(" · "))}</option>`).join("")}</select>
    </label>${!veiculos.length ? `<p class="hint">Este cliente ainda não tem veículo cadastrado. Você pode continuar sem veículo ou cadastrá-lo na aba Veículos.</p>` : ""}`
      : `<p class="hint">${db.clientes.length ? "Escolha uma opção do cadastro para exibir os dados e os veículos da entidade." : "Cadastre uma entidade antes de iniciar uma venda."}</p>`}
    <div class="venda-navegacao"><span></span><button class="btn" type="button" data-proxima ${selecionado ? "" : "disabled"}>Próximo: Pneus →</button></div>
  </section>`;
}

function normalizarBuscaEntidade(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function entidadesCorrespondentes(termo) {
  const buscaTexto = normalizarBuscaEntidade(termo);
  const buscaDocumento = buscaTexto.replace(/\D/g, "");
  return db.clientes.filter((cliente) => {
    if (String(cliente.status || "").toLowerCase() === "inativo") return false;
    const nome = normalizarBuscaEntidade(cliente.nome);
    const documento = normalizarBuscaEntidade(cliente.documento);
    return nome.includes(buscaTexto) || (buscaDocumento.length >= 3 && documento.replace(/\D/g, "").includes(buscaDocumento));
  });
}

function produtoVendaCardMarkup(produto) {
  const selecionado = vendaRascunho.itens.find((item) => item.tipo === "pneu" && item.referencia === produto.id);
  const quantidade = selecionado?.qtd || 0;
  const precoUnitario = Number(selecionado?.unitario ?? produto.preco) || 0;
  const estoque = estoqueLocal(produto);
  const detalhe = [produto.categoria, produto.medida].filter(Boolean).join(" · ");
  return `<article class="produto-venda-card ${quantidade ? "selecionado" : ""}">
    <div class="produto-venda-cabecalho">
      <span class="produto-codigo">${escapeHtml(produto.produtoId || "Sem código")}</span>
      <span class="produto-estoque ${estoque > 0 ? "disponivel" : "indisponivel"}">${estoque > 0 ? `${estoque} em estoque` : "Sem estoque local"}</span>
    </div>
    <div class="produto-venda-info">
      <h3>${escapeHtml(produto.nome)}</h3>
      <p>${escapeHtml(detalhe || "Pneu")}</p>
    </div>
    <div class="produto-venda-rodape">
      <div class="produto-venda-preco"><span>Preço unitário</span><strong>${money(precoUnitario)}</strong></div>
      <div class="quantidade produto-venda-quantidade">
        <button type="button" aria-label="Diminuir quantidade de ${escapeHtml(produto.nome)}" data-qty-change="pneu:${escapeHtml(produto.id)}:-1">−</button>
        <input type="number" min="0" step="1" value="${quantidade}" aria-label="Quantidade de ${escapeHtml(produto.nome)}" data-qty-value="pneu:${escapeHtml(produto.id)}">
        <button type="button" aria-label="Aumentar quantidade de ${escapeHtml(produto.nome)}" data-qty-change="pneu:${escapeHtml(produto.id)}:1">+</button>
      </div>
    </div>
  </article>`;
}

function produtosEtapaMarkup() {
  const MIN_CARACTERES_BUSCA = 2;
  const catalogo = db.produtos.filter((produto) => produtoEhPneu(produto) && String(produto.status || "").toLowerCase() !== "inativo");
  const termo = String(vendaRascunho.buscaProduto || "");
  const busca = normalizarBuscaEntidade(termo.trim());
  const buscaAtiva = busca.length >= MIN_CARACTERES_BUSCA;
  // Sem pesquisa, o catálogo não é exibido. Apenas os pneus já incluídos no
  // pedido permanecem visíveis, para permitir ajustar ou remover a quantidade.
  const produtos = buscaAtiva
    ? catalogo.filter((produto) => normalizarBuscaEntidade([
      produto.produtoId, produto.nome, produto.categoria, produto.medida
    ].join(" ")).includes(busca))
    : catalogo.filter((produto) => vendaRascunho.itens.some((item) => item.tipo === "pneu" && item.referencia === produto.id));
  const quantidadeSelecionada = vendaRascunho.itens.filter((item) => item.tipo === "pneu").reduce((soma, item) => soma + item.qtd, 0);
  const contagem = buscaAtiva ? `${produtos.length} de ${catalogo.length} produtos` : `${catalogo.length} produtos no catálogo`;
  const vazio = buscaAtiva
    ? "Nenhum produto corresponde à busca."
    : catalogo.length
      ? `Pesquise por nome, código, categoria ou medida para exibir os produtos (mínimo de ${MIN_CARACTERES_BUSCA} caracteres).`
      : "Nenhum pneu ativo cadastrado. Use a aba Produtos para montar o catálogo.";
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 2 de 5</span><h2>Catálogo de pneus</h2><p class="hint">O catálogo abre vazio: pesquise por nome, código, categoria ou medida para exibir os pneus e ajuste a quantidade no próprio produto.</p>
    <div class="produto-venda-toolbar">
      <label>Buscar no catálogo<input id="buscaProdutoVenda" type="search" placeholder="Ex.: Continental, 205/55 R16 ou código" autocomplete="off" value="${escapeHtml(termo)}"></label>
      <span class="produto-contagem">${contagem}</span>
    </div>
    <div class="produto-venda-grid">${produtos.length ? produtos.map(produtoVendaCardMarkup).join("") : `<p class="hint">${vazio}</p>`}</div>
    <div class="venda-subtotal"><span>${quantidadeSelecionada} pneus selecionados</span><strong>Subtotal pneus: ${money(subtotalPorTipo("pneu"))}</strong></div>
    <div class="venda-navegacao"><button class="btn ghost" type="button" data-anterior>← Anterior</button><button class="btn" type="button" data-proxima>Próximo: Serviços →</button></div>
  </section>`;
}

function servicosEtapaMarkup() {
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 3 de 5</span><h2>Serviços para a montagem</h2><p class="hint">Marque os serviços e ajuste a quantidade na lista.</p>
    <div class="venda-lista">${itensMarkup("servico")}</div>
    <div class="venda-subtotal"><span>Subtotal pneus: ${money(subtotalPorTipo("pneu"))}</span><strong>Subtotal serviços: ${money(subtotalPorTipo("servico"))}</strong></div>
    <div class="venda-navegacao"><button class="btn ghost" type="button" data-anterior>← Anterior</button><button class="btn" type="button" data-proxima>Próximo: Valores →</button></div>
  </section>`;
}

function valoresEtapaMarkup() {
  const itens = vendaRascunho.itens;
  const linhas = itens.map((item) => {
    const chave = `${item.tipo}:${item.referencia}`;
    const cadastro = item.tipo === "pneu"
      ? db.produtos.find((produto) => sameId(produto.id, item.referencia))
      : db.servicos.find((servico) => sameId(servico.id, item.referencia));
    const detalhe = [item.tipo === "servico" ? "Serviço" : "Pneu", item.medida].filter(Boolean).join(" · ");
    return `<div class="venda-valores-linha">
      <div class="venda-valores-item">
        <strong>${escapeHtml(item.descricao)}</strong>
        <span>${escapeHtml(detalhe)} · ${item.qtd} un.</span>
        <small>Preço padrão do cadastro: ${money(cadastro?.preco)}</small>
      </div>
      <label class="venda-valores-preco">Preço unitário nesta venda
        <input type="text" required class="preco-mask" data-preco-item="${escapeHtml(chave)}" aria-label="Preço unitário de ${escapeHtml(item.descricao)} nesta venda" value="${formatarValorVenda(item.unitario)}">
      </label>
      <strong class="venda-valores-total" data-total-item="${escapeHtml(chave)}">${money(item.qtd * item.unitario)}</strong>
    </div>`;
  }).join("");
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 4 de 5</span><h2>Revisar valores</h2>
    <p class="hint">Altere o preço unitário dos pneus ou serviços para este pedido. O preço padrão do cadastro não será alterado; as próximas vendas continuarão usando o valor padrão.</p>
    ${linhas ? `<div class="venda-valores-lista">${linhas}</div>` : `<p class="hint">Adicione ao menos um item nas etapas anteriores para revisar os valores.</p>`}
    <div class="venda-valores-resumo">
      <div><span>Subtotal pneus</span><strong id="subtotalValoresPneus">${money(subtotalPorTipo("pneu"))}</strong></div>
      <div><span>Subtotal serviços</span><strong id="subtotalValoresServicos">${money(subtotalPorTipo("servico"))}</strong></div>
    </div>
    <div class="venda-total"><span>Subtotal geral dos itens</span><strong id="subtotalValoresGeral">${money(total(itens))}</strong></div>
    <div class="venda-navegacao"><button class="btn ghost" type="button" data-anterior>← Anterior</button><button class="btn" type="button" data-proxima ${itens.length ? "" : "disabled"}>Próximo: Pagamento →</button></div>
  </section>`;
}

function pagamentoEtapaMarkup() {
  const subtotal = total(vendaRascunho.itens);
  const percentual = Number(vendaRascunho.descontoPercentual) || 0;
  const descontoCalculado = Math.round(subtotal * percentual) / 100;
  const desconto = editingPedidoId
    ? Math.min(subtotal, Math.max(0, Number(vendaRascunho.descontoValor) || 0))
    : descontoCalculado;
  vendaRascunho.descontoValor = desconto;
  return `<section class="card venda-etapa-conteudo">
    <span class="meta">Etapa 5 de 5</span><h2>Pagamento e conclusão</h2>
    <div class="venda-resumo">${vendaRascunho.itens.map((item) => `<div><span>${item.qtd} × ${escapeHtml(item.descricao)}${item.medida ? ` ${escapeHtml(item.medida)}` : ""}</span><strong>${money(item.qtd * item.unitario)}</strong></div>`).join("") || `<p class="hint">Nenhum item selecionado. Volte e adicione pneus ou serviços.</p>`}
      <div class="resumo-subtotal"><span>Subtotal pneus</span><strong>${money(subtotalPorTipo("pneu"))}</strong></div>
      <div><span>Subtotal serviços</span><strong>${money(subtotalPorTipo("servico"))}</strong></div>
      <div class="desconto-linha"><label>Desconto (%)<input id="descontoPercentual" class="desc-perc" value="${percentual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}"></label>
        <label>Valor do desconto (R$)<input id="descontoValor" class="desc-val" value="${desconto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}"></label></div>
      <div class="venda-total"><span>Total final</span><strong id="totalFinal">${money(Math.max(0, subtotal - desconto))}</strong></div>
    </div>
    <div class="grid venda-pagamento">
      <label>Forma de pagamento<select id="pagamentoVenda">${["pix", "dinheiro", "cartão", "boleto", "a prazo"].map(v => `<option ${v === vendaRascunho.pagamento ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      ${editingPedidoId
      ? `<div class="pedido-status-bloqueado"><span class="meta">Status</span><strong>Orçamento · sem baixa de estoque</strong></div>`
      : `<label>Status da venda<select id="statusVenda"><option value="orçamento" ${vendaRascunho.status === "orçamento" ? "selected" : ""}>Pedido (não baixa estoque)</option><option value="faturado" ${vendaRascunho.status === "faturado" ? "selected" : ""}>Faturar agora (baixa estoque)</option><option value="pago" ${vendaRascunho.status === "pago" ? "selected" : ""}>Pago e faturado (baixa estoque)</option></select></label>`}
    </div>
    <h3 class="venda-agenda-titulo">Agendar na oficina (opcional)</h3>
    <div class="grid venda-pagamento">
      <label>Box<input id="boxVenda" type="text" value="${escapeHtml(vendaRascunho.box)}" placeholder="Ex.: Box 02 - Elevador 1"></label>
      <label>Data<input id="dataAgendaVenda" type="date" value="${escapeHtml(vendaRascunho.agendamento)}"></label>
      <label>Horário<input id="horarioVenda" type="time" value="${escapeHtml(vendaRascunho.horario)}"></label>
    </div>
    <div class="venda-navegacao">
      <button class="btn ghost" type="button" data-anterior>← Anterior</button>
      <div class="venda-acoes-salvar">
        <button class="btn ghost" type="button" id="salvarVenda" ${vendaRascunho.itens.length ? "" : "disabled"}>${editingPedidoId ? "Salvar alterações" : "Salvar pedido"}</button>
        <button class="btn" type="button" id="salvarVendaPdf" ${vendaRascunho.itens.length ? "" : "disabled"}>${editingPedidoId ? "Salvar alterações e gerar PDF" : "Salvar e gerar PDF"}</button>
      </div>
    </div>
  </section>`;
}

function renderVenda() {
  const nomes = ["Entidade / Veículo", "Pneus", "Serviços", "Valores", "Pagamento"];
  document.getElementById("title").textContent = `${editingPedidoId ? `Editar orçamento ${db.pedidos.find((pedido) => pedido.id === editingPedidoId)?.numero || ""}` : "Nova venda"} · Etapa ${etapaVenda} de 5`;
  document.getElementById("lede").textContent = "Sistema SFA / PDV — complete as etapas para concluir a venda.";
  document.getElementById("actions").innerHTML = `<button class="btn ghost" id="cancelarVenda" type="button">Cancelar venda</button>`;
  const conteudo = [clienteEtapaMarkup, produtosEtapaMarkup, servicosEtapaMarkup, valoresEtapaMarkup, pagamentoEtapaMarkup][etapaVenda - 1]();
  document.getElementById("view").innerHTML = `<section class="card venda-topo"><div><span class="meta">Sistema SFA / PDV</span><h2>${escapeHtml(nomes[etapaVenda - 1])}</h2></div><span class="badge">${etapaVenda} / 5</span></section>${etapasMarkup()}${conteudo}`;

  document.querySelectorAll("[data-etapa]").forEach((button) => button.onclick = () => { etapaVenda = Number(button.dataset.etapa); render(); });
  document.getElementById("cancelarVenda").onclick = () => {
    if (!confirm("Descartar os dados desta venda?")) return;
    vendaRascunho = null;
    editingPedidoId = null;
    render();
  };
  document.querySelectorAll("[data-anterior]").forEach((button) => button.onclick = () => { etapaVenda--; render(); });
  document.querySelectorAll("[data-proxima]").forEach((button) => button.onclick = () => {
    if (etapaVenda === 1 && !vendaRascunho.clienteId) {
      alert("Selecione um cliente cadastrado para continuar.");
      return;
    }
    if (etapaVenda === 3 && !vendaRascunho.itens.length) {
      alert("Adicione ao menos um pneu ou serviço antes de revisar os valores.");
      return;
    }
    if (etapaVenda === 4 && vendaRascunho.itens.some((item) => !Number.isFinite(Number(item.unitario)) || Number(item.unitario) < 0)) {
      alert("Revise os preços unitários. Os valores devem ser numéricos e iguais ou maiores que zero.");
      return;
    }
    etapaVenda++;
    render();
  });

  const busca = document.getElementById("buscaEntidadeVenda");
  if (busca) {
    busca.oninput = () => {
      vendaRascunho.clienteBusca = busca.value;
      vendaRascunho.clienteId = "";
      vendaRascunho.veiculoId = "";
      render();
      const novoCampo = document.getElementById("buscaEntidadeVenda");
      novoCampo.focus();
      novoCampo.setSelectionRange(novoCampo.value.length, novoCampo.value.length);
    };
  }
  document.querySelectorAll("[data-cliente-venda]").forEach((button) => button.onclick = () => {
    const cliente = db.clientes.find((item) => item.id === button.dataset.clienteVenda);
    if (!cliente) return;
    vendaRascunho.clienteId = cliente.id;
    vendaRascunho.clienteBusca = cliente.nome;
    vendaRascunho.veiculoId = "";
    render();
  });
  const buscaProduto = document.getElementById("buscaProdutoVenda");
  if (buscaProduto) buscaProduto.oninput = () => {
    const posicao = buscaProduto.selectionStart;
    vendaRascunho.buscaProduto = buscaProduto.value;
    render();
    const novoCampo = document.getElementById("buscaProdutoVenda");
    novoCampo.focus();
    novoCampo.setSelectionRange(posicao, posicao);
  };
  const veiculo = document.getElementById("veiculoVenda");
  if (veiculo) veiculo.onchange = () => { vendaRascunho.veiculoId = veiculo.value; };

  document.querySelectorAll("[data-check-item]").forEach((control) => control.onchange = () => {
    const [tipo, id] = control.dataset.checkItem.split(":");
    alterarItem(tipo, id, control.checked ? 1 : 0);
  });
  document.querySelectorAll("[data-qty-change]").forEach((button) => button.onclick = () => {
    const [tipo, id, incremento] = button.dataset.qtyChange.split(":");
    const atual = vendaRascunho.itens.find((item) => item.tipo === tipo && item.referencia === id)?.qtd || 0;
    alterarItem(tipo, id, atual + Number(incremento));
  });
  document.querySelectorAll("[data-qty-value]").forEach((input) => input.onchange = () => {
    const [tipo, id] = input.dataset.qtyValue.split(":");
    const qtd = Number(input.value);
    if (!Number.isInteger(qtd) || qtd < 0) { alert("Informe uma quantidade inteira igual ou maior que zero."); render(); return; }
    alterarItem(tipo, id, qtd);
  });
  // Desconto: formatação direita-esquerda + sincronização
  setTimeout(() => {
    const percEl = document.getElementById("descontoPercentual");
    const valEl = document.getElementById("descontoValor");
    if (!percEl || !valEl) return;

    const fmt = (n) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const updateTotal = (v) => {
      const t = document.getElementById("totalFinal");
      if (t) t.textContent = money(Math.max(0, total(vendaRascunho.itens) - v));
    };

    function setupRightToLeft(el, onChange) {
      el.type = "text";
      el.inputMode = "numeric";
      el.autocomplete = "off";
      el.value = fmt(parsePrecoBR(el.value));

      el.addEventListener("keydown", (e) => {
        if (e.key === "Backspace") {
          e.preventDefault();
          let d = el.value.replace(/\D/g, "");
          d = d.slice(0, -1);
          const n = Number(d || "0") / 100;
          el.value = fmt(n);
          onChange(n);
        } else if (e.key.length === 1 && !/\d/.test(e.key)) {
          e.preventDefault();
        }
      });

      el.addEventListener("input", () => {
        let d = el.value.replace(/\D/g, "").slice(-8);
        if (!d) d = "0";
        const n = Number(d) / 100;
        el.value = fmt(n);
        onChange(n);
      });
    }

    setupRightToLeft(percEl, (p) => {
      p = Math.min(100, p);
      vendaRascunho.descontoPercentual = p;
      const sub = total(vendaRascunho.itens);
      const v = Math.round(sub * p) / 100;
      vendaRascunho.descontoValor = v;
      valEl.value = fmt(v);
      updateTotal(v);
    });

    setupRightToLeft(valEl, (v) => {
      const sub = total(vendaRascunho.itens);
      v = Math.min(sub, Math.max(0, v));
      const p = sub ? Math.round((v / sub) * 10000) / 100 : 0;
      vendaRascunho.descontoValor = v;
      vendaRascunho.descontoPercentual = p;
      percEl.value = fmt(p);
      updateTotal(v);
    });
  }, 30);
  const pagamento = document.getElementById("pagamentoVenda");
  if (pagamento) pagamento.onchange = () => { vendaRascunho.pagamento = pagamento.value; };
  const status = document.getElementById("statusVenda");
  if (status) status.onchange = () => { vendaRascunho.status = status.value; };
  const box = document.getElementById("boxVenda");
  if (box) box.oninput = () => { vendaRascunho.box = box.value; };
  const dataAgenda = document.getElementById("dataAgendaVenda");
  if (dataAgenda) dataAgenda.onchange = () => { vendaRascunho.agendamento = dataAgenda.value; };
  const horario = document.getElementById("horarioVenda");
  if (horario) horario.onchange = () => { vendaRascunho.horario = horario.value; };
  const salvar = document.getElementById("salvarVenda");
  if (salvar) salvar.onclick = () => concluirVenda(false);
  const salvarPdf = document.getElementById("salvarVendaPdf");
  if (salvarPdf) salvarPdf.onclick = () => concluirVenda(true);
  // Aplica a máscara primeiro para que os totais leiam o valor já normalizado.
  document.querySelectorAll(".preco-mask").forEach(aplicarMascaraPreco);
  document.querySelectorAll("[data-preco-item]").forEach((input) => {
    const sincronizarPreco = () => {
      const item = vendaRascunho.itens.find((linha) => `${linha.tipo}:${linha.referencia}` === input.dataset.precoItem);
      if (!item) return;
      const valor = parsePrecoBR(input.value);
      if (!Number.isFinite(valor) || valor < 0) return;
      item.unitario = Math.round((valor + Number.EPSILON) * 100) / 100;
      const subtotalLinha = document.querySelectorAll("[data-total-item]");
      for (const totalLinha of subtotalLinha) {
        if (totalLinha.dataset.totalItem === input.dataset.precoItem) {
          totalLinha.textContent = money(item.qtd * item.unitario);
          break;
        }
      }
      const pneus = document.getElementById("subtotalValoresPneus");
      const servicos = document.getElementById("subtotalValoresServicos");
      const geral = document.getElementById("subtotalValoresGeral");
      if (pneus) pneus.textContent = money(subtotalPorTipo("pneu"));
      if (servicos) servicos.textContent = money(subtotalPorTipo("servico"));
      if (geral) geral.textContent = money(total(vendaRascunho.itens));
    };
    input.addEventListener("input", sincronizarPreco);
    input.addEventListener("change", sincronizarPreco);
  });
  document.querySelectorAll(".percent-mask").forEach(aplicarMascaraPercentual);
}

async function concluirVenda(gerarPdf) {
  if (!vendaRascunho?.clienteId || !vendaRascunho.itens.length) {
    alert("Selecione o cliente e adicione ao menos um item antes de concluir.");
    return;
  }
  if (vendaRascunho.itens.some((item) => !Number.isFinite(Number(item.unitario)) || Number(item.unitario) < 0)) {
    etapaVenda = 4;
    render();
    alert("Revise os preços unitários. Os valores devem ser numéricos e iguais ou maiores que zero.");
    return;
  }
  const corpo = {
    ...vendaRascunho,
    status: editingPedidoId ? "orçamento" : vendaRascunho.status,
    itens: vendaRascunho.itens.map((item) => ({
      tipo: item.tipo, produtoRef: item.produtoRef, servicoRef: item.servicoRef,
      qtd: item.qtd, unitario: Number(item.unitario)
    }))
  };
  let pedido;
  try {
    pedido = editingPedidoId
      ? await api(`/api/vendas/${editingPedidoId}`, { method: "PUT", body: JSON.stringify(corpo) })
      : await api("/api/vendas", { method: "POST", body: JSON.stringify(corpo) });
  } catch (error) {
    alert(`Não foi possível ${editingPedidoId ? "salvar as alterações do orçamento" : "salvar o pedido"}: ${error.message}`);
    return;
  }

  vendaRascunho = null;
  editingPedidoId = null;
  pedidoId = pedido.id;
  etapaVenda = 1;
  try {
    await load();
  } catch (error) {
    pedidoId = null;
    render();
    alert(`O pedido ${pedido.numero} foi salvo, mas não foi possível atualizar a tela: ${error.message}`);
  }
  render();
  if (!gerarPdf) return;
  try { await baixarPdf(pedido.id); }
  catch (error) { alert(`O pedido ${pedido.numero} foi salvo, mas não foi possível baixar o PDF: ${error.message}`); }
}

async function baixarPdf(id) {
  const token = sessionStorage.getItem("token");
  const headers = {};
  if (token) headers["Authorization"] = "Bearer " + token;
  const response = await fetch(`/api/pedidos/${id}/pdf`, { headers });
  if (response.status === 401) {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("usuario");
    const overlay = document.getElementById("loginOverlay");
    if (overlay) overlay.style.display = "flex";
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    try { const body = await response.json(); message = body.detail || message; } catch { }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "pedido.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderPedido() {
  const pedido = db.pedidos.find((p) => p.id === pedidoId);
  if (!pedido) { pedidoId = null; return render(); }
  document.getElementById("title").textContent = pedido.numero;
  document.getElementById("lede").textContent = pedido.cliente;
  document.getElementById("actions").innerHTML = `<button class="btn ghost" id="backBtn" type="button">Voltar às vendas</button><button class="btn" id="baixarPedidoPdf" type="button">Baixar pedido em PDF</button>`;
  document.getElementById("view").innerHTML = `<section class="card">
    <div class="venda-detalhe-topo"><div><span class="meta">Pedido de venda</span><h2>${escapeHtml(pedido.numero)}</h2></div>${badge(pedido.status)}</div>
    <dl class="capa venda-detalhe">
      <div><dt>Cliente</dt><dd>${escapeHtml(pedido.cliente)}</dd></div>
      <div><dt>Veículo</dt><dd>${escapeHtml(db.veiculos.find((v) => sameId(v.id, pedido.veiculoId))?.modelo || "—")}</dd></div>
      <div><dt>Data</dt><dd>${br(pedido.data)}</dd></div>
      <div><dt>Pagamento</dt><dd>${escapeHtml(pedido.pagamento)}</dd></div>
      <div><dt>Agendamento</dt><dd>${br(pedido.agendamento)} ${escapeHtml(pedido.horario)}</dd></div>
      <div><dt>Box</dt><dd>${escapeHtml(pedido.box || "—")}</dd></div>
    </dl>
    <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Item</th><th>Tipo</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>
      ${pedido.itens.map((item) => `<tr><td>${escapeHtml(item.descricao)} ${escapeHtml(item.medida)}</td><td>${item.tipo === "servico" ? "Serviço" : "Pneu"}</td><td>${item.qtd}</td><td>${money(item.unitario)}</td><td>${money(item.qtd * item.unitario)}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="venda-total"><span>Subtotal</span><strong>${money(total(pedido.itens))}</strong></div>
    <div class="venda-total"><span>Desconto (${Number(pedido.descontoPercentual || 0).toLocaleString("pt-BR")}%)</span><strong>− ${money(pedido.descontoValor)}</strong></div>
    <div class="venda-total"><span>Total final</span><strong>${money(totalPedido(pedido))}</strong></div>
    <div class="venda-navegacao">
      ${pedido.status === "orçamento" ? `<button class="btn ghost" id="editarOrcamento" type="button">Editar orçamento</button>` : ""}
      ${pedido.status === "orçamento" ? `<button class="btn" id="faturarPedido" type="button">Faturar e baixar estoque</button>` : ""}
      ${confirmDelete === `pedido:${pedido.id}`
      ? `<button class="btn danger" id="confirmarExclusaoPedido" type="button">Confirmar exclusão</button><button class="btn ghost" id="cancelarExclusaoPedido" type="button">Cancelar</button>`
      : `<button class="btn danger" id="pedirExclusaoPedido" type="button">Excluir pedido</button>`}
    </div>
  </section>`;
  document.getElementById("backBtn").onclick = () => { pedidoId = null; render(); };
  document.getElementById("baixarPedidoPdf").onclick = async () => {
    try { await baixarPdf(pedido.id); } catch (error) { alert(`Não foi possível baixar o PDF: ${error.message}`); }
  };
  const editar = document.getElementById("editarOrcamento");
  if (editar) editar.onclick = () => editarOrcamento(pedido);
  const faturar = document.getElementById("faturarPedido");
  if (faturar) faturar.onclick = async () => {
    try {
      await api(`/api/pedidos/${pedido.id}`, { method: "PUT", body: JSON.stringify({ status: "faturado" }) });
      await load();
      render();
    } catch (error) { alert(`Não foi possível faturar a venda: ${error.message}`); }
  };
  const pedirExclusao = document.getElementById("pedirExclusaoPedido");
  if (pedirExclusao) pedirExclusao.onclick = () => { confirmDelete = `pedido:${pedido.id}`; render(); };
  const cancelarExclusao = document.getElementById("cancelarExclusaoPedido");
  if (cancelarExclusao) cancelarExclusao.onclick = () => { confirmDelete = ""; render(); };
  const confirmarExclusao = document.getElementById("confirmarExclusaoPedido");
  if (confirmarExclusao) confirmarExclusao.onclick = async () => {
    try {
      await api(`/api/pedidos/${pedido.id}`, { method: "DELETE" });
      pedidoId = null;
      confirmDelete = "";
      await load();
      render();
    } catch (error) { alert(`Não foi possível excluir o pedido: ${error.message}`); }
  };
}

// Evita tela em branco no primeiro carregamento
setTimeout(() => {
  try { reloadAndRender(); }
  catch (e) { console.error(e); location.reload(); }
}, 50);


