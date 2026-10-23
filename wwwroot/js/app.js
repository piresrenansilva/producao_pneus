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
  const creates = { clientes: "Cadastrar entidade", veiculos: "Cadastrar veículo", servicos: "Cadastrar serviço", produtos: "Cadastrar produto", carcacas: "Novo apontamento", estoque: "Novo item", producao: "Novo apontamento", cargas: "Novo movimento", vendas: "Novo pedido", financeiro: "Novo lançamento", contas: "Novo título", boletos: "Novo boleto" };
  actions.innerHTML = creates[page] ? `<button class="btn" id="addBtn">${creates[page]}</button>` : "";
  addLogoutButton();
  view.innerHTML = views[page]();
  const add = document.getElementById("addBtn");
  if (add) add.onclick = () => page === "vendas" ? iniciarPedido() : openForm(page === "carcacas" ? "carcacaOrdens" : page);
  const q = document.getElementById("q");
  if (q) q.oninput = () => { query = q.value; const pos = q.selectionStart; render(); const next = document.getElementById("q"); if (next) { next.focus(); next.selectionStart = next.selectionEnd = pos; } };
  view.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => {
    const [kind, id] = b.dataset.edit.split(":");
    openForm(kind, db[kind].find((row) => row.id === id));
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
    const ent = db.financeiro.filter((r) => r.tipo === "entrada").reduce((a, r) => a + Number(r.valor || 0), 0);
    const sai = db.financeiro.filter((r) => r.tipo === "saída").reduce((a, r) => a + Number(r.valor || 0), 0);
    const alertas = [
      ...baixos.map((r) => `Estoque baixo: ${r.item} (${r.qtd} de ${r.minimo})`),
      ...db.contas.filter((r) => overdue(r.vencimento, r.status)).map((r) => `Título vencido: ${r.pessoa} · ${money(r.valor)}`),
      ...db.boletos.filter((r) => overdue(r.vencimento, r.status)).map((r) => `Boleto vencido: ${r.pessoa} · ${money(r.valor)}`)
    ];
    return `<div class="kpis">
      <div class="card"><span>Carcaças</span><strong>${carc}</strong><em>unidades</em></div>
      <div class="card"><span>Estoque</span><strong>${est}</strong><em>${baixos.length} abaixo do mínimo</em></div>
      <div class="card"><span>Produção no mês</span><strong>${prod}</strong><em>pneus</em></div>
      <div class="card"><span>Saldo</span><strong>${money(ent - sai)}</strong><em>entradas menos saídas</em></div>
    </div>
    <div>
      <section class="card"><h2>Alertas</h2>${alertas.length ? `<ul class="list">${alertas.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : `<p class="hint">Nenhum alerta.</p>`}</section>
    </div>`;
  },
  produtos() {
    const busca = normalizarBuscaEntidade(query);
    const produtos = db.produtos.filter((produto) => !busca || normalizarBuscaEntidade([
      produto.produtoId, produto.nome, produto.categoria, produto.medida, produto.status
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
        <label>Pesquisar produto<input id="q" type="search" placeholder="Nome, código, categoria ou medida" value="${escapeAttr(query)}"></label>
        <span>${produtos.length} de ${db.produtos.length} produtos</span>
      </div>
      <div class="produto-admin-grid">${produtos.length ? produtos.map((produto) => {
        const estoque = estoqueLocal(produto);
        return `<article class="produto-admin-card">
          <div class="produto-admin-topo"><span class="produto-codigo">${escapeHtml(produto.produtoId || "Sem código")}</span>${badge(produto.status)}</div>
          <div class="produto-admin-info"><h2>${escapeHtml(produto.nome)}</h2><p>${escapeHtml([produto.categoria, produto.medida].filter(Boolean).join(" · ") || "Produto sem categoria ou medida")}</p></div>
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
        <div class="produto-admin-acoes">${registrado
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
  cargas() { return table("cargas", ["Tipo", "Data", "Venda", "Cliente", "Peças", "Motorista", "Funcionário", "Status"], (r) => {
    const venda = db.pedidos.find((pedido) => sameId(pedido.id, r.pedidoId));
    const cliente = venda?.cliente || db.clientes.find((item) => sameId(item.id, venda?.clienteId))?.nome || "—";
    return [
      escapeHtml(r.tipo), br(r.data), escapeHtml(venda?.numero || "—"), escapeHtml(cliente),
      venda ? totalPecasPedido(venda) : "—", escapeHtml(r.motorista), escapeHtml(r.funcionario), badge(r.status)
    ];
  }); },
  vendas() {
    const q = query.toLowerCase();
    const lista = db.pedidos.filter((p) => !q || `${p.numero} ${p.cliente} ${p.pagamento} ${p.status} ${p.vendedor}`.toLowerCase().includes(q));
    return `<div class="toolbar"><input id="q" placeholder="Filtrar por cliente, número ou status" value="${escapeAttr(query)}" /></div>
      ${lista.map((p) => `<button class="pedido pedido-listagem" data-open="${p.id}" type="button">
        <div class="back" style="justify-content:space-between"><span class="mono">${escapeHtml(p.numero)}</span>${badge(p.status)}</div>
        <h3>${escapeHtml(p.cliente)}</h3>
        <dl class="capa">
          <div><dt>Data</dt><dd>${br(p.data)}</dd></div>
          <div><dt>Pagamento</dt><dd>${escapeHtml(p.pagamento)}</dd></div>
          <div><dt>Itens</dt><dd class="num">${p.itens.length}</dd></div>
          <div><dt>Total</dt><dd class="num">${money(totalPedido(p))}</dd></div>
        </dl>
      </button>`).join("") || `<p class="hint">Nenhum pedido.</p>`}`;
  },
  financeiro() { return table("financeiro", ["Data", "Tipo", "Categoria", "Descrição", "Valor"], (r) => [br(r.data), badge(r.tipo), escapeHtml(r.categoria), escapeHtml(r.descricao), money(r.valor)]); },
  contas() { return table("contas", ["Tipo", "Pessoa", "Descrição", "Valor", "Vencimento", "Status"], (r) => [escapeHtml(r.tipo), escapeHtml(r.pessoa), escapeHtml(r.descricao), money(r.valor), br(r.vencimento), badge(r.status, r.vencimento)]); },
  boletos() { return table("boletos", ["Origem", "Pessoa", "Número", "Valor", "Vencimento", "Status"], (r) => [r.origem === "empresa" ? "Empresa" : "Cliente", escapeHtml(r.pessoa), escapeHtml(r.numero), money(r.valor), br(r.vencimento), badge(r.status, r.vencimento)]); },
  clientes() { return table("clientes", ["Código", "Nome / Razão social", "Tipo", "CPF / CNPJ", "Telefone", "E-mail", "Cidade / UF", "Status"], (r) => [
    escapeHtml(r.codigo || r.id), escapeHtml(r.nome), escapeHtml(r.tipo), escapeHtml(r.documento), escapeHtml(r.telefone), escapeHtml(r.email),
    escapeHtml([r.cidade, r.estado].filter(Boolean).join(" / ")), badge(r.status)
  ]); }
};


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
