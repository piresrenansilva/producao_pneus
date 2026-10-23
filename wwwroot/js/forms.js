// Um produto é considerado carcaça quando a categoria, sem acentos, é "carcaça(s)".
function ehCategoriaCarcaca(categoria) {
  const texto = String(categoria || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  return texto === "carcaca" || texto === "carcacas";
}

function field(name, label, type, extra = "") {
  const wide = type === "textarea" ? " full" : "";
  const rand = Math.random().toString(36).slice(2, 8);
  const fakeName = type === "select" ? name : `f_${rand}`;
  const auto = type !== "select" && type !== "textarea"
    ? 'autocomplete="new-password" autocorrect="off" spellcheck="false" data-lpignore="true"'
    : "";
  const control = type === "textarea"
    ? `<textarea name="${fakeName}" data-realname="${name}" ${extra} autocomplete="off"></textarea>`
    : type === "select"
      ? `<select name="${name}" ${extra}></select>`
      : `<input name="${fakeName}" data-realname="${name}" type="${type}" ${auto} ${extra} />`;
  return `<label class="${wide}">${label}${control}</label>`;
}

const FORMS = {
  clientes: () => [
    field("nome", "Nome / Razão social", "text", "required"),
    field("tipo", "Tipo", "select", "required"),
    `<label>CPF / CNPJ<div style="display:flex;gap:6px;align-items:center"><input name="f_doc" data-realname="documento" type="text" autocomplete="new-password" style="flex:1" data-lpignore="true" /><button type="button" class="btn small" id="btnBuscarCnpj">Buscar</button></div></label>`,
    field("telefone", "Telefone", "tel", "placeholder=\"(XX) 9XXXX-XXXX\" maxlength=\"15\""),
    field("email", "E-mail", "email"),
    field("limiteCredito", "Limite de crédito", "text", "class='preco-mask'"),
    `<label>CEP<div style="display:flex;gap:6px;align-items:center"><input name="f_cep" data-realname="cep" type="text" autocomplete="new-password" style="flex:1" data-lpignore="true" /><button type="button" class="btn small" id="btnBuscarCep">Buscar</button></div></label>`,
    field("endereco", "Endereço", "text"),
    field("numero", "Número", "text"),
    field("complemento", "Complemento", "text"),
    field("bairro", "Bairro", "text"),
    field("cidade", "Cidade", "text"),
    field("estado", "Estado", "text", "maxlength='2'"),
    field("status", "Status", "select"),
    field("obs", "Observações", "textarea")
  ].join(""),
  produtos: () => [
    field("produtoId", "Código do produto", "text"), field("nome", "Nome", "text", "required"),
    field("categoria", "Categoria", "select"),
    `<label class="full" id="carcacaProdutoCampo" hidden>Carcaça (origem da medida e do custo)
      <select id="carcacaProduto"></select>
    </label>`,
    field("medida", "Medida", "text"),
    field("unidade", "Unidade (ex.: un, pneu)", "text"), field("preco", "Preço de venda", "text", "required class='preco-mask'"),
    field("custo", "Custo unitário", "text", "required class='preco-mask'"),
    field("status", "Status", "select"),
    field("obs", "Observações", "textarea")
  ].join(""),
  veiculos: () => [
    field("clienteId", "Entidade", "select", "required"),
    field("marca", "Marca", "text"),
    field("modelo", "Modelo", "text", "required"),
    field("ano", "Ano", "text"),
    field("placa", "Placa", "text"),
    field("medidaPneu", "Medida do pneu", "text"),
    field("status", "Status", "select")
  ].join(""),
  servicos: () => [
    field("nome", "Nome do serviço", "text", "required"),
    field("descricao", "Descrição", "text"),
    field("preco", "Preço", "text", "required class='preco-mask'"),
    field("status", "Status", "select")
  ].join(""),
  carcacas: () => [
    field("medida", "Medida", "text", "required"),
    field("qtd", "Quantidade", "number", "required min='0' step='1'"),
    field("valorUnitario", "Valor unitário de entrada (R$)", "text", "required class='preco-mask'"),
    field("status", "Status", "select", "required"),
    `<label class="full carcaca-valor-total">Valor total (quantidade × valor unitário)<output id="valorTotalCarcaca" aria-live="polite">R$ 0,00</output></label>`
  ].join(""),
  carcacaOrdens: () => [
    `<div class="full apontamento-grade">
      <div class="grid apontamento-coluna">
        ${field("data", "Data", "date", "required")}
        ${field("dono", "Dono / fornecedor", "text")}
        ${field("origem", "Origem", "select")}
        ${field("status", "Status", "select")}
        <label class="full">Buscar carcaça (produtos da categoria Carcaça)
          <input id="buscaCarcacaApontamento" type="search" placeholder="Digite ao menos 2 letras: nome, medida ou código" autocomplete="off">
        </label>
        <div class="full apontamento-resultados" id="carcacaApontamentoResultados"></div>
        ${field("obs", "Observações", "textarea")}
      </div>
      <aside class="apontamento-lateral" aria-label="Carcaças selecionadas para o apontamento">
        <h3 class="apontamento-lateral-titulo">Carcaças do apontamento<small id="apontamentoResumoUnidades"></small></h3>
        <div class="apontamento-selecionados" id="carcacaApontamentoSelecionados"></div>
        <div class="apontamento-total-geral"><span>Total do apontamento</span><output id="totalApontamentoCarcacas" aria-live="polite">R$ 0,00</output></div>
      </aside>
    </div>`
  ].join(""),
  estoque: () => [
    field("produtoId", "Código do produto", "text", "required"), field("item", "Descrição", "text", "required"),
    field("medida", "Medida", "text"),
    field("qtd", "Quantidade", "number", "required"), field("minimo", "Mínimo", "number", "required")
  ].join(""),
  producao: () => [
    field("data", "Data", "date", "required"), field("turno", "Turno", "select"),
    field("medida", "Medida", "select", "required"), field("qtd", "Pneus produzidos", "number", "required"),
    field("operador", "Operador", "select"), field("status", "Status", "select")
  ].join(""),
  cargas: () => [
    field("tipo", "Tipo", "select"), field("data", "Data", "date", "required"),
    `<label class="full carga-pedido-campo">Venda / número do pedido
      <input id="buscaPedidoCarga" type="search" placeholder="Digite ao menos 3 números do pedido" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="sugestoesPedidoCarga" aria-expanded="false">
      <div class="carga-pedido-sugestoes" id="sugestoesPedidoCarga" role="listbox" hidden></div>
    </label>
    <select name="pedidoId" id="pedidoIdCarga" hidden></select>
    <div class="full carga-venda-preview" id="cargaVendaPreview" aria-live="polite"><p class="hint">Digite 3 ou mais números e escolha uma sugestão para ver o cliente e o total de peças. O vínculo é opcional.</p></div>`,
    field("motorista", "Motorista (nome)", "text"), field("funcionario", "Funcionário", "select"),
    field("status", "Status", "select")
  ].join(""),
  financeiro: () => [
    field("data", "Data", "date", "required"), field("tipo", "Tipo", "select"),
    field("categoria", "Categoria", "select"), field("descricao", "Descrição", "text", "required"),
    field("valor", "Valor", "text", "required class='preco-mask'")
  ].join(""),
  contas: () => [
    field("tipo", "Tipo", "select"), field("pessoa", "Pessoa", "text", "required"),
    field("descricao", "Descrição", "text", "required"), field("valor", "Valor", "text", "required class='preco-mask'"),
    field("vencimento", "Vencimento", "date", "required"), field("boleto", "Nº do boleto", "text"),
    field("status", "Status", "select")
  ].join(""),
  boletos: () => [
    field("origem", "Origem", "select"), field("pessoa", "Pessoa", "text", "required"),
    field("numero", "Número", "text", "required"), field("valor", "Valor", "text", "required class='preco-mask'"),
    field("vencimento", "Vencimento", "date", "required"), field("ref", "Referência", "text"),
    field("status", "Status", "select")
  ].join(""),
  capa: () => [
    field("cliente", "Entidade", "text", "required list='clientesPedido' autocomplete='off'"), field("data", "Data", "date", "required"),
    field("pagamento", "Pagamento", "select"), field("status", "Status", "select"),
    field("vendedor", "Vendedor", "text"), field("previsao", "Previsão", "date"),
    field("obs", "Observação", "textarea")
  ].join("")
};

const SELECTS = {
  clientes: { tipo: ["Cliente", "Fornecedor", "Funcionário"], status: ["Ativo", "Inativo"] },
  veiculos: { status: ["Ativo", "Inativo"] },
  servicos: { status: ["Ativo", "Inativo"] },
  produtos: { categoria: ["Revenda", "Carcaça"], status: ["Ativo", "Inativo"] },
  carcacas: {
    origem: ["cliente", "compra", "retorno"],
    status: ["recebida", "inspecionada", "aprovada", "reprovada", "em produção", "pronta"]
  },
  carcacaOrdens: { origem: ["cliente", "compra", "retorno"], status: [["registrado", "Registrado"], ["conferido", "Conferido"]] },
  estoque: { tipo: ["novo", "recapado", "insumo", "carcaça"] },
  producao: { turno: ["Manhã", "Tarde", "Noite"], status: ["em andamento", "concluída", "refugo"] },
  cargas: { tipo: ["carga", "descarga"], status: ["aguardando", "conferida", "saiu", "divergente"] },
  financeiro: { tipo: ["entrada", "saída"], categoria: ["venda", "recapagem", "insumo", "folha", "frete", "energia", "imposto", "outros"] },
  contas: { tipo: ["pagar", "receber"], status: ["aberto", "pago", "vencido"] },
  boletos: { origem: [["cliente", "Entidade (a receber)"], ["empresa", "Empresa (a pagar)"]], status: ["aberto", "pago", "vencido", "cancelado"] },
  capa: { pagamento: ["boleto", "pix", "dinheiro", "cartão", "a prazo"], status: ["orçamento", "faturado", "pago", "cancelado"] }
};

function vendasDisponiveisCarga(row) {
  const vendas = db.pedidos.filter((pedido) => ["faturado", "pago"].includes(String(pedido.status || "").trim().toLowerCase()));
  const vendaAtual = row?.pedidoId ? db.pedidos.find((pedido) => sameId(pedido.id, row.pedidoId)) : null;
  if (vendaAtual && !vendas.some((pedido) => sameId(pedido.id, vendaAtual.id))) vendas.unshift(vendaAtual);
  return vendas;
}

function fillSelects(root, kind, row) {
  const spec = SELECTS[kind] || {};
  root.querySelectorAll("select").forEach((sel) => {
    const options = spec[sel.name] || [];
    const isCliente = sel.name === "clienteId";
    const isOperador = sel.name === "operador";
    const isMedidaCarcaca = kind === "producao" && sel.name === "medida";
    const isFuncionarioCarga = kind === "cargas" && sel.name === "funcionario";
    const isVendaCarga = kind === "cargas" && sel.name === "pedidoId";
    let choices = options;
    if (isCliente) {
      choices = db.clientes
        .filter((cliente) => String(cliente.status || "").toLowerCase() !== "inativo")
        .map((cliente) => [cliente.id, `${cliente.nome}${cliente.documento ? ` · ${cliente.documento}` : ""}`]);
    } else if (isOperador || isFuncionarioCarga) {
      const funcionarios = db.clientes
        .filter((cliente) => String(cliente.tipo || "").trim().toLocaleLowerCase("pt-BR") === "funcionário" && String(cliente.status || "").toLowerCase() !== "inativo")
        .map((cliente) => String(cliente.nome || "").trim())
        .filter(Boolean);
      const atual = String(isFuncionarioCarga ? row?.funcionario || "" : "").trim();
      if (atual && !funcionarios.some((nome) => nome.toLocaleLowerCase("pt-BR") === atual.toLocaleLowerCase("pt-BR"))) {
        funcionarios.unshift(atual);
      }
      choices = [...new Map(funcionarios.map((nome) => [nome.toLocaleLowerCase("pt-BR"), nome])).values()];
    } else if (isMedidaCarcaca) {
      // Medidas das carcaças vêm dos produtos da categoria Carcaça (cadastro
      // atual) e, para registros antigos, também da tabela legada de carcaças.
      const medidas = [...new Set([
        ...db.produtos
          .filter((produto) => ehCategoriaCarcaca(produto.categoria))
          .map((produto) => String(produto.medida || "").trim()),
        ...(db.carcacas || []).map((carcaca) => String(carcaca.medida || "").trim())
      ].filter(Boolean))];
      const medidaAtual = String(row?.medida || "").trim();
      if (medidaAtual && !medidas.some((medida) => medida.toLocaleLowerCase("pt-BR") === medidaAtual.toLocaleLowerCase("pt-BR"))) {
        medidas.unshift(medidaAtual);
      }
      choices = medidas;
    } else if (isVendaCarga) {
      choices = vendasDisponiveisCarga(row).map((pedido) => {
        const cliente = pedido.cliente || db.clientes.find((item) => sameId(item.id, pedido.clienteId))?.nome || "Cliente não informado";
        const numero = pedido.numero || "Venda";
        return [pedido.id, `${numero} · ${cliente} · ${totalPecasPedido(pedido)} peças`];
      });
    }
    const dinamico = isCliente || isOperador || isMedidaCarcaca || isFuncionarioCarga || isVendaCarga;
    const placeholder = isMedidaCarcaca && choices.length === 0
      ? "Cadastre uma carcaça com medida"
      : isFuncionarioCarga && choices.length === 0
        ? "Cadastre um funcionário"
        : isVendaCarga && choices.length === 0
          ? "Nenhuma venda faturada ou paga"
          : isVendaCarga
            ? "Sem venda vinculada (opcional)"
            : "Selecione...";
    sel.innerHTML = (dinamico ? `<option value="">${placeholder}</option>` : "") + choices.map((o) => Array.isArray(o)
      ? `<option value="${escapeHtml(o[0])}">${escapeHtml(o[1])}</option>`
      : `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join("");
  });
}

document.getElementById("nav").innerHTML = NAV.map(([id, label]) => `<button data-page="${id}">${label}</button>`).join("");
document.getElementById("nav").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  page = b.dataset.page;
  pedidoId = null;
  editingPedidoId = null;
  vendaRascunho = null;
  query = "";
  confirmDelete = "";
  render();
};
document.getElementById("cancelBtn").onclick = () => document.getElementById("modal").classList.remove("show");
document.getElementById("form").onsubmit = async (e) => {
  e.preventDefault();
  const data = {};
  for (const el of e.target.elements) {
    if (!el.name || el.disabled || el.type === "button") continue;
    const key = el.dataset.realname || el.name;
    data[key] = el.value;
  }
  const camposPreco = ["custo", "preco", "valor", "unitario", "valorUnitario", "limiteCredito"];
  const camposNumero = ["qtd", "minimo", "carcacas"];
  camposPreco.forEach((k) => {
    if (k in data) data[k] = parsePrecoBR(data[k]);
  });
  camposNumero.forEach((k) => {
    if (k in data) data[k] = Number(data[k] || 0);
  });
  try {
    if (editing.id) {
      await api(`/api/${editing.kind}/${editing.id}`, { method: "PUT", body: JSON.stringify(data) });
    } else {
      await api(`/api/${editing.kind}`, { method: "POST", body: JSON.stringify(data) });
    }
    document.getElementById("modal").classList.remove("show");
    await load();
    render();
  } catch (error) {
    toast(`Não foi possível salvar: ${error.message}`, "bad");
  }
};


async function buscarCnpj() {
  const input = document.querySelector('#form input[data-realname="documento"]') || document.querySelector('#form input[name="documento"]');
  if (!input) return;
  let cnpj = (input.value || "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    toast("Informe um CNPJ válido com 14 dígitos.", "warn");
    return;
  }

  const btn = document.getElementById("btnBuscarCnpj");
  const originalText = btn ? btn.textContent : "Buscar";
  if (btn) { btn.disabled = true; btn.textContent = "Buscando..."; }

  try {
    const token = sessionStorage.getItem("token");
    const headers = token ? { "Authorization": "Bearer " + token } : {};
    const res = await fetch(`/api/consulta/cnpj/${cnpj}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "CNPJ não encontrado");
    }
    const raw = await res.json();

    // Normaliza tanto BrasilAPI quanto ReceitaWS
    function formatarTelefone(num) {
      if (!num) return "";
      const d = String(num).replace(/\D/g, "");
      if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
      if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
      return d;
    }

    let tels = [];
    if (raw.ddd_telefone_1) tels.push(raw.ddd_telefone_1);
    if (raw.ddd_telefone_2) tels.push(raw.ddd_telefone_2);
    if (raw.telefone) {
      // ReceitaWS pode vir com um ou mais números juntos ou separados
      const limpo = String(raw.telefone).replace(/\D/g, "");
      if (limpo.length > 11) {
        // tenta separar em blocos de 10 ou 11
        for (let i = 0; i < limpo.length;) {
          const resto = limpo.length - i;
          const tam = resto >= 11 && resto % 10 !== 0 ? 11 : 10;
          if (resto < 10) break;
          tels.push(limpo.slice(i, i + tam));
          i += tam;
        }
      } else if (limpo) {
        tels.push(limpo);
      }
    }
    tels = [...new Set(tels.map(t => String(t).replace(/\D/g, "")).filter(t => t.length >= 10))];
    const telefoneFormatado = tels.map(formatarTelefone).join(" / ");

    const data = raw.razao_social || raw.nome
      ? {
        razao_social: raw.razao_social || raw.nome,
        nome_fantasia: raw.nome_fantasia || raw.fantasia,
        cep: raw.cep,
        logradouro: raw.logradouro,
        numero: raw.numero,
        complemento: raw.complemento,
        bairro: raw.bairro,
        municipio: raw.municipio,
        uf: raw.uf,
        telefone: telefoneFormatado
      }
      : { ...raw, telefone: telefoneFormatado };

    const form = document.getElementById("form");
    const set = (n, v) => { const el = getField(form, n); if (el && v != null) el.value = v; };
    if (!getField(form, "nome")?.value) set("nome", data.razao_social || data.nome_fantasia || "");
    set("cep", (data.cep || "").replace(/\D/g, ""));
    set("endereco", data.logradouro || "");
    set("numero", data.numero || "");
    set("complemento", data.complemento || "");
    set("bairro", data.bairro || "");
    set("cidade", data.municipio || "");
    set("estado", data.uf || "");
    if (data.telefone && !getField(form, "telefone")?.value) set("telefone", data.telefone);

    toast("Dados preenchidos com sucesso.", "ok");
  } catch (e) {
    toast("Erro ao consultar CNPJ: " + e.message, "bad");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

async function buscarCep(auto = false) {
  const input = document.querySelector('#form input[data-realname="cep"]') || document.querySelector('#form input[name="cep"]');
  if (!input) return;
  let cep = (input.value || "").replace(/\D/g, "");
  if (cep.length !== 8) {
    if (!auto) toast("Informe um CEP válido com 8 dígitos.", "warn");
    return;
  }
  try {
    const token = sessionStorage.getItem("token");
    const headers = token ? { "Authorization": "Bearer " + token } : {};
    const res = await fetch(`/api/consulta/cep/${cep}`, { headers });
    const data = await res.json();
    if (data.erro) throw new Error("CEP não encontrado");
    const form = document.getElementById("form");
    const set = (n, v) => { const el = getField(form, n); if (el && v != null) el.value = v; };
    set("endereco", data.logradouro || "");
    set("bairro", data.bairro || "");
    set("cidade", data.localidade || "");
    set("estado", data.uf || "");
    if (!auto) toast("Endereço preenchido automaticamente.", "ok");
  } catch (e) {
    if (!auto) toast("Erro ao consultar CEP: " + e.message, "bad");
  }
}


function getField(form, realname) {
  return form.querySelector(`[data-realname="${realname}"]`) || form.elements[realname];
}

function openForm(kind, row) {
  // Máscaras no cadastro de cliente
  setTimeout(() => {
    if (kind === "clientes") {
      const tel = document.querySelector('#form input[data-realname="telefone"], #form input[name="f_telefone"]');
      if (tel && typeof aplicarMascaraTelefone === "function") aplicarMascaraTelefone(tel);
      const doc = document.querySelector('#form input[data-realname="documento"], #form input[name="f_doc"]');
      if (doc && typeof aplicarMascaraCpfCnpj === "function") aplicarMascaraCpfCnpj(doc);
    }
  }, 50);

  editing = { kind, id: row?.id || null };
  const titles = { clientes: row ? "Editar entidade" : "Cadastrar entidade", produtos: row ? "Editar produto" : "Cadastrar produto", carcacas: "Carcaça", carcacaOrdens: row ? `Apontamento ${row.numero || "de carcaças"}` : "Novo apontamento de carcaças", estoque: "Estoque", producao: "Produção", cargas: "Movimento", financeiro: "Lançamento", contas: "Título", boletos: "Boleto" };
  document.getElementById("modalTitle").textContent = titles[kind] || "Registro";
  document.getElementById("formFields").innerHTML = FORMS[kind]();
  const form = document.getElementById("form");
  // Restaura o envio padrão do formulário caso a abertura anterior tenha
  // instalado um envio customizado (fluxo do apontamento de carcaças).
  if (!openForm._submitPadrao) openForm._submitPadrao = form.onsubmit;
  else form.onsubmit = openForm._submitPadrao;
  // O apontamento usa um popup mais largo, com a lista de carcaças ao lado.
  form.classList.toggle("modal-largo", kind === "carcacaOrdens");
  fillSelects(form, kind, row);
  if (kind === "clientes") {
    const btnCnpj = document.getElementById("btnBuscarCnpj");
    if (btnCnpj) btnCnpj.onclick = buscarCnpj;
    const btnCep = document.getElementById("btnBuscarCep");
    if (btnCep) btnCep.onclick = () => buscarCep(false);
    const cepInput = getField(form, "cep");
    if (cepInput) {
      cepInput.addEventListener("input", () => {
        const digits = cepInput.value.replace(/\D/g, "");
        if (digits.length === 8) buscarCep(true);
      });
    }
  }
  if (row) {
    Object.entries(row).forEach(([k, v]) => {
      const el = getField(form, k);
      if (el) el.value = v ?? "";
    });
    // Garante que o select de tipo receba o valor correto
    if (kind === "clientes" && row.tipo) {
      const tipoSel = form.querySelector('select[name="tipo"]');
      if (tipoSel) tipoSel.value = row.tipo;
    }
    // Em registros vinculados, usa a descrição atual do cadastro do produto
    // quando o texto legado da tabela de estoque estiver vazio.
    if (kind === "estoque") {
      // Localiza o produto pelo código textual compartilhado com o estoque.
      const produto = db.produtos.find(p =>
        p.produtoId && row.produtoId && String(p.produtoId).trim().toLowerCase() === String(row.produtoId).trim().toLowerCase()
      );
      if (form.elements.item) form.elements.item.value = produto?.nome || row.item || "";
      if (form.elements.produtoId) form.elements.produtoId.value = row.produtoId || produto?.produtoId || "";
      if (form.elements.medida) form.elements.medida.value = row.medida || produto?.medida || "";
    }
  } else if (getField(form, "data")) getField(form, "data").value = today();
  if (kind === "produtos") {
    const categoriaSel = form.querySelector('select[name="categoria"]');
    const carcacaCampo = document.getElementById("carcacaProdutoCampo");
    const carcacaSel = document.getElementById("carcacaProduto");
    // Preserva no select categorias antigas diferentes de Revenda/Carcaça.
    const categoriaAtual = String(row?.categoria || "").trim();
    if (categoriaSel && categoriaAtual && ![...categoriaSel.options].some((option) => option.value.toLocaleLowerCase("pt-BR") === categoriaAtual.toLocaleLowerCase("pt-BR"))) {
      categoriaSel.add(new Option(categoriaAtual, categoriaAtual), 0);
    }
    if (categoriaSel && categoriaAtual) categoriaSel.value = categoriaAtual;
    // Lista as carcaças cadastradas: medida · dono · quantidade · valor unitário · status.
    if (carcacaSel) {
      const carcacas = [...db.carcacas].sort((a, b) => String(a.medida || "").localeCompare(String(b.medida || ""), "pt-BR"));
      carcacaSel.innerHTML = `<option value="">Selecione uma carcaça...</option>` + carcacas.map((carcaca) =>
        `<option value="${escapeAttr(carcaca.id)}">${escapeHtml(carcaca.medida || "Sem medida")}${carcaca.dono ? ` · ${escapeHtml(carcaca.dono)}` : ""} · ${Number(carcaca.qtd) || 0} un · ${money(Number(carcaca.valorUnitario) || 0)}${carcaca.status ? ` · ${escapeHtml(carcaca.status)}` : ""}</option>`
      ).join("");
    }
    const atualizarCampoCarcaca = () => {
      if (!carcacaCampo || !categoriaSel) return;
      const ehCarcaca = String(categoriaSel.value || "").trim().toLocaleLowerCase("pt-BR") === "carcaça";
      carcacaCampo.hidden = !ehCarcaca;
      if (!ehCarcaca && carcacaSel) carcacaSel.value = "";
    };
    categoriaSel?.addEventListener("change", atualizarCampoCarcaca);
    carcacaSel?.addEventListener("change", () => {
      const carcaca = db.carcacas.find((item) => sameId(item.id, carcacaSel.value));
      if (!carcaca) return;
      const medidaEl = getField(form, "medida");
      if (medidaEl && carcaca.medida) medidaEl.value = carcaca.medida;
      // Preenche o "Custo unitário" com o valor de entrada da carcaça.
      // Para preencher o campo "Preço de venda" em vez do custo, troque "custo" por "preco" na linha abaixo.
      const custoEl = getField(form, "custo");
      if (custoEl) custoEl.value = (Number(carcaca.valorUnitario) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });
    atualizarCampoCarcaca();
  }
  if (kind === "cargas") {
    const vendaSelect = getField(form, "pedidoId");
    const buscaPedido = document.getElementById("buscaPedidoCarga");
    const sugestoes = document.getElementById("sugestoesPedidoCarga");
    const preview = document.getElementById("cargaVendaPreview");
    const ocultarSugestoes = () => {
      if (!sugestoes) return;
      sugestoes.hidden = true;
      sugestoes.innerHTML = "";
      buscaPedido?.setAttribute("aria-expanded", "false");
    };
    const atualizarResumoVenda = () => {
      if (!preview) return;
      const venda = db.pedidos.find((pedido) => sameId(pedido.id, vendaSelect?.value));
      if (!venda) {
        preview.innerHTML = `<p class="hint">Digite 3 ou mais números e escolha uma sugestão para ver o cliente e o total de peças. O vínculo é opcional.</p>`;
        return;
      }
      const cliente = venda.cliente || db.clientes.find((item) => sameId(item.id, venda.clienteId))?.nome || "Cliente não informado";
      preview.innerHTML = `<div class="carga-venda-resumo">
        <div><span>Venda</span><strong>${escapeHtml(venda.numero || "—")}</strong></div>
        <div><span>Cliente</span><strong>${escapeHtml(cliente)}</strong></div>
        <div><span>Total de peças</span><strong>${totalPecasPedido(venda)} <small>peças</small></strong></div>
      </div>`;
    };
    const mostrarSugestoes = () => {
      if (!buscaPedido || !sugestoes) return;
      const numerosDigitados = buscaPedido.value.replace(/\D/g, "");
      if (numerosDigitados.length < 3) {
        ocultarSugestoes();
        return;
      }
      const encontradas = vendasDisponiveisCarga(row).filter((venda) => {
        const numero = String(venda.numero || "").replace(/\D/g, "");
        return numero.startsWith(numerosDigitados) || numero.includes(numerosDigitados);
      }).slice(0, 8);
      sugestoes.innerHTML = encontradas.length
        ? encontradas.map((venda) => {
          const cliente = venda.cliente || db.clientes.find((item) => sameId(item.id, venda.clienteId))?.nome || "Cliente não informado";
          return `<button type="button" class="carga-pedido-sugestao" role="option" aria-selected="false" data-pedido-carga="${escapeAttr(venda.id)}">
              <strong>${escapeHtml(venda.numero || "Venda")}</strong>
              <span>${escapeHtml(cliente)} · ${totalPecasPedido(venda)} peças</span>
            </button>`;
        }).join("")
        : `<div class="carga-pedido-sem-sugestoes">Nenhuma venda encontrada com esses números.</div>`;
      sugestoes.hidden = false;
      buscaPedido.setAttribute("aria-expanded", "true");
      sugestoes.querySelectorAll("[data-pedido-carga]").forEach((button) => {
        button.onclick = () => {
          const venda = db.pedidos.find((pedido) => sameId(pedido.id, button.dataset.pedidoCarga));
          if (!venda) return;
          vendaSelect.value = venda.id;
          buscaPedido.value = venda.numero || "";
          ocultarSugestoes();
          vendaSelect.dispatchEvent(new Event("change", { bubbles: true }));
          buscaPedido.focus();
        };
      });
    };
    const vendaSelecionada = db.pedidos.find((pedido) => sameId(pedido.id, vendaSelect?.value));
    if (vendaSelecionada && buscaPedido) buscaPedido.value = vendaSelecionada.numero || "";
    vendaSelect?.addEventListener("change", atualizarResumoVenda);
    buscaPedido?.addEventListener("input", () => {
      const selecionada = db.pedidos.find((pedido) => sameId(pedido.id, vendaSelect?.value));
      const numerosDigitados = buscaPedido.value.replace(/\D/g, "");
      const numerosSelecionados = String(selecionada?.numero || "").replace(/\D/g, "");
      if (!selecionada || numerosDigitados !== numerosSelecionados) {
        if (vendaSelect) vendaSelect.value = "";
        atualizarResumoVenda();
      }
      mostrarSugestoes();
    });
    buscaPedido?.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        const primeira = sugestoes?.querySelector("[data-pedido-carga]");
        if (primeira) {
          event.preventDefault();
          primeira.focus();
        }
      } else if (event.key === "Enter") {
        const primeira = sugestoes?.querySelector("[data-pedido-carga]");
        event.preventDefault();
        primeira?.click();
      } else if (event.key === "Escape") {
        ocultarSugestoes();
      }
    });
    atualizarResumoVenda();
  }
  form.querySelectorAll(".preco-mask").forEach((input) => {
    if (input.value !== "") {
      const number = Number(input.value);
      const amount = Number.isFinite(number) ? number : parsePrecoBR(input.value);
      input.value = amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    aplicarMascaraPreco(input);
  });
  if (kind === "carcacas") {
    const quantidade = getField(form, "qtd");
    const valorUnitario = getField(form, "valorUnitario");
    const valorTotal = document.getElementById("valorTotalCarcaca");
    const recalcularTotal = () => {
      if (!valorTotal) return;
      const qtd = Number(quantidade?.value) || 0;
      const unitario = parsePrecoBR(valorUnitario?.value);
      valorTotal.textContent = money(qtd * unitario);
    };
    quantidade?.addEventListener("input", recalcularTotal);
    valorUnitario?.addEventListener("input", recalcularTotal);
    recalcularTotal();
  }
  if (kind === "carcacaOrdens") {
    // Apontamento de entrada de carcaças: seleciona produtos da categoria
    // Carcaça, ajusta quantidade e valor unitário de cada uma e mostra o total.
    const somenteLeitura = String(row?.status || "").trim().toLocaleLowerCase("pt-BR") === "conferido";
    const buscaCarcaca = document.getElementById("buscaCarcacaApontamento");
    const resultadosEl = document.getElementById("carcacaApontamentoResultados");
    const selecionadosEl = document.getElementById("carcacaApontamentoSelecionados");
    const totalEl = document.getElementById("totalApontamentoCarcacas");
    const selecionados = new Map();
    const disponiveis = db.produtos
      .filter((produto) => ehCategoriaCarcaca(produto.categoria) && String(produto.status || "").toLocaleLowerCase("pt-BR") !== "inativo")
      .sort((a, b) => String(a.medida || "").localeCompare(String(b.medida || ""), "pt-BR") || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    const chaveDe = (id) => String(id || "").toLowerCase();
    const totalGeral = () => [...selecionados.values()].reduce((soma, item) => soma + item.qtd * item.valorUnitario, 0);

    (Array.isArray(row?.itens) ? row.itens : []).forEach((item) => {
      const produto = disponiveis.find((p) => sameId(p.id, item.produtoRef));
      selecionados.set(chaveDe(item.produtoRef || produto?.id), {
        produtoRef: produto?.id || item.produtoRef,
        produtoId: item.produtoId || produto?.produtoId || "",
        nome: produto?.nome || item.item || "Carcaça",
        medida: item.medida || produto?.medida || "",
        qtd: Math.max(1, Math.floor(Number(item.qtd) || 1)),
        valorUnitario: Number(item.valorUnitario) || 0
      });
    });

    const atualizarTotais = () => {
      let totalUnidades = 0;
      selecionadosEl.querySelectorAll("[data-apontamento-item]").forEach((linha) => {
        const item = selecionados.get(linha.dataset.apontamentoItem);
        const totalLinha = linha.querySelector(".apontamento-linha-total");
        if (item) totalUnidades += item.qtd;
        if (item && totalLinha) totalLinha.textContent = money(item.qtd * item.valorUnitario);
      });
      const resumoEl = document.getElementById("apontamentoResumoUnidades");
      if (resumoEl) resumoEl.textContent = totalUnidades ? ` · ${totalUnidades} un.` : "";
      if (totalEl) totalEl.textContent = money(totalGeral());
    };

    const renderSelecionados = () => {
      const itens = [...selecionados.values()];
      selecionadosEl.innerHTML = itens.length
        ? `<table class="apontamento-tabela">
            <thead><tr><th>Cód.</th><th>Carcaça</th><th>Medida</th><th class="apontamento-num">Qtd</th><th class="apontamento-num">Valor unit.</th><th class="apontamento-num">Total</th><th></th></tr></thead>
            <tbody>${itens.map((item) => {
              const chave = chaveDe(item.produtoRef);
              return `<tr data-apontamento-item="${escapeAttr(chave)}">
                <td class="mono">${escapeHtml(item.produtoId || "—")}</td>
                <td>${escapeHtml(item.nome)}</td>
                <td>${escapeHtml(item.medida || "—")}</td>
                <td class="apontamento-num"><input type="number" min="1" step="1" value="${item.qtd}" data-apontamento-qtd="${escapeAttr(chave)}" aria-label="Quantidade de ${escapeAttr(item.nome)}" ${somenteLeitura ? "disabled" : ""}></td>
                <td class="apontamento-num"><input type="text" inputmode="decimal" value="${(item.valorUnitario || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}" data-apontamento-valor="${escapeAttr(chave)}" aria-label="Valor unitário de ${escapeAttr(item.nome)}" ${somenteLeitura ? "disabled" : ""}></td>
                <td class="apontamento-num apontamento-linha-total">${money(item.qtd * item.valorUnitario)}</td>
                <td class="apontamento-num">${somenteLeitura ? "" : `<button type="button" class="btn danger small apontamento-remove" data-apontamento-remove="${escapeAttr(chave)}" aria-label="Remover ${escapeAttr(item.nome)}">×</button>`}</td>
              </tr>`;
            }).join("")}</tbody>
          </table>`
        : `<p class="hint">Nenhuma carcaça selecionada. Pesquise ao lado e toque em Adicionar.</p>`;
      selecionadosEl.querySelectorAll("[data-apontamento-remove]").forEach((botao) => botao.onclick = () => {
        selecionados.delete(botao.dataset.apontamentoRemove);
        renderSelecionados();
        renderResultados();
      });
      selecionadosEl.querySelectorAll("[data-apontamento-qtd]").forEach((input) => input.oninput = () => {
        const item = selecionados.get(input.dataset.apontamentoQtd);
        if (!item) return;
        item.qtd = Math.max(1, Math.floor(Number(input.value) || 1));
        atualizarTotais();
      });
      selecionadosEl.querySelectorAll("[data-apontamento-valor]").forEach((input) => {
        aplicarMascaraPreco(input);
        input.oninput = () => {
          const item = selecionados.get(input.dataset.apontamentoValor);
          if (!item) return;
          item.valorUnitario = parsePrecoBR(input.value);
          atualizarTotais();
        };
      });
      atualizarTotais();
    };

    const renderResultados = () => {
      if (!resultadosEl) return;
      const busca = normalizarBuscaEntidade((buscaCarcaca?.value || "").trim());
      if (busca.length < 2) {
        resultadosEl.innerHTML = `<p class="hint">${disponiveis.length
          ? `Digite ao menos 2 letras para pesquisar entre as ${disponiveis.length} carcaças cadastradas nos Produtos.`
          : "Nenhum produto da categoria Carcaça cadastrado. Cadastre primeiro na aba Produtos."}</p>`;
        return;
      }
      const encontrados = disponiveis
        .filter((produto) => normalizarBuscaEntidade([produto.produtoId, produto.nome, produto.medida, produto.categoria].join(" ")).includes(busca))
        .slice(0, 12);
      resultadosEl.innerHTML = encontrados.length
        ? `<div class="apontamento-lista">${encontrados.map((produto) => {
          const chave = chaveDe(produto.id);
          const jaAdicionada = selecionados.has(chave);
          return `<div class="apontamento-resultado">
            <div class="apontamento-resultado-info">
              <span class="mono">${escapeHtml(produto.produtoId || "Sem código")}</span>
              <strong>${escapeHtml(produto.nome)}</strong>
              <small>${escapeHtml(produto.medida || "—")}</small>
            </div>
            <span class="apontamento-resultado-custo">Custo cadastrado: <strong>${money(produto.custo)}</strong></span>
            <button type="button" class="btn small" data-apontamento-add="${escapeAttr(chave)}" ${jaAdicionada || somenteLeitura ? "disabled" : ""}>${jaAdicionada ? "Adicionada" : "Adicionar"}</button>
          </div>`;
          }).join("")}</div>`
        : `<p class="hint">Nenhuma carcaça corresponde à pesquisa.</p>`;
      resultadosEl.querySelectorAll("[data-apontamento-add]").forEach((botao) => botao.onclick = () => {
        const produto = disponiveis.find((p) => chaveDe(p.id) === botao.dataset.apontamentoAdd);
        if (!produto) return;
        selecionados.set(chaveDe(produto.id), {
          produtoRef: produto.id,
          produtoId: produto.produtoId || "",
          nome: produto.nome,
          medida: produto.medida || "",
          qtd: 1,
          valorUnitario: Number(produto.custo) || 0
        });
        botao.disabled = true;
        botao.textContent = "Adicionada";
        renderSelecionados();
      });
    };

    buscaCarcaca?.addEventListener("input", renderResultados);
    if (somenteLeitura) {
      document.getElementById("modalTitle").textContent = `Apontamento ${row?.numero || ""} conferido (somente leitura)`;
      form.querySelectorAll("input, select, textarea").forEach((el) => { el.disabled = true; });
      const salvar = form.querySelector('button[type="submit"]');
      if (salvar) salvar.disabled = true;
    }
    renderResultados();
    renderSelecionados();

    // O apontamento segue fluxo próprio (como o das vendas): envia cabeçalho e
    // itens para /api/carcaca-ordens em vez do CRUD genérico.
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (somenteLeitura) return;
      const itens = [...selecionados.values()].map((item) => ({
        produtoRef: item.produtoRef,
        qtd: Math.max(0, Math.floor(Number(item.qtd) || 0)),
        valorUnitario: Number(item.valorUnitario) || 0
      }));
      if (!itens.length) { toast("Selecione ao menos uma carcaça antes de salvar.", "warn"); return; }
      if (itens.some((item) => item.qtd < 1)) { toast("Cada carcaça deve ter quantidade igual ou maior que 1.", "warn"); return; }
      const body = {
        data: getField(form, "data")?.value || today(),
        dono: getField(form, "dono")?.value || "",
        origem: getField(form, "origem")?.value || "",
        status: getField(form, "status")?.value || "registrado",
        obs: getField(form, "obs")?.value || "",
        itens
      };
      try {
        const resultado = await api(editing.id ? `/api/carcaca-ordens/${editing.id}` : "/api/carcaca-ordens", {
          method: editing.id ? "PUT" : "POST",
          body: JSON.stringify(body)
        });
        document.getElementById("modal").classList.remove("show");
        toast(`Apontamento ${resultado.numero || ""} salvo. Total ${money(resultado.total)}.`, "ok");
        await load();
        render();
      } catch (error) {
        toast(`Não foi possível salvar: ${error.message}`, "bad");
      }
    };
  }
  document.getElementById("modal").classList.add("show");
}

async function removeRow(kind, id) {
  if (!confirm("Deseja excluir este registro?")) return;
  try {
    await api(`/api/${kind}/${id}`, { method: "DELETE" });
    await load();
    render();
  } catch (error) { toast(`Não foi possível excluir: ${error.message}`, "bad"); }
}

function table(kind, heads, map) {
  const q = query.toLowerCase();
  const rows = db[kind].filter((row) => !q || JSON.stringify(row).toLowerCase().includes(q));
  return `<div class="toolbar"><input id="q" placeholder="Filtrar" value="${escapeAttr(query)}" /></div>
    <div class="table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}<th></th></tr></thead><tbody>
    ${rows.map((row) => `<tr>${map(row).map((c) => `<td>${c}</td>`).join("")}
      <td><button class="btn ghost small" data-edit="${kind}:${row.id}">Editar</button>
      <button class="btn danger small" data-del="${kind}:${row.id}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="${heads.length + 1}">Nenhum registro.</td></tr>`}
    </tbody></table></div>`;
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, "&#96;"); }

