
function logout() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("usuario");
  location.reload();
}
const money = (n) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d) => d ? d.split("-").reverse().join("/") : "—";
const today = () => {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const sameId = (left, right) => String(left || "").toLowerCase() === String(right || "").toLowerCase();
const total = (itens) => (itens || []).reduce((a, i) => a + (Number(i.qtd) || 0) * (Number(i.unitario) || 0), 0);
const totalPedido = (pedido) => Math.max(0, total(pedido.itens) - (Number(pedido.descontoValor) || 0));
const totalPecasPedido = (pedido) => (pedido?.itens || []).reduce((soma, item) => {
  const tipo = String(item.tipo || "pneu").toLowerCase();
  return soma + (tipo === "pneu" ? Number(item.qtd) || 0 : 0);
}, 0);
const overdue = (date, status) => date && !["pago", "paga", "cancelado", "cancelada"].includes(status) && date < today();

let db = { clientes: [], veiculos: [], servicos: [], produtos: [], carcacas: [], carcacaOrdens: [], estoque: [], producao: [], cargas: [], pedidos: [], financeiro: [], contas: [], boletos: [] };
let page = "painel";
let pedidoId = null;
let editingPedidoId = null;
let vendaRascunho = null;
let etapaVenda = 1;
let editing = null;
let query = "";
let confirmDelete = "";

// ===== MÁSCARA DE PREÇO (digitação da direita para a esquerda) =====
function formatarPrecoDigitos(digitos) {
  digitos = String(digitos || "").replace(/\D/g, "").slice(-16);
  if (!digitos) digitos = "0";
  const valor = Number(digitos) / 100;
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function aplicarMascaraPreco(input) {
  if (!input || input.dataset.mascaraPreco) return;
  input.dataset.mascaraPreco = "1";
  input.type = "text";
  input.inputMode = "numeric";
  input.autocomplete = "off";

  const valorInicial = parsePrecoBR(input.value);
  input.value = valorInicial.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Backspace") {
      e.preventDefault();
      let digitos = input.value.replace(/\D/g, "");
      digitos = digitos.slice(0, -1);
      input.value = formatarPrecoDigitos(digitos);
    } else if (e.key.length === 1 && !/\d/.test(e.key)) {
      e.preventDefault();
    }
  });

  input.addEventListener("input", function (e) {
    const digitos = e.target.value.replace(/\D/g, "");
    e.target.value = formatarPrecoDigitos(digitos);
  });

  input.addEventListener("focus", function () {
    setTimeout(() => input.select(), 0);
  });
}


function aplicarMascaraPercentual(input) {
  if (!input || input.dataset.percentMask) return;
  input.dataset.percentMask = "1";
  input.type = "text";
  input.inputMode = "decimal";
  input.autocomplete = "off";

  const format = (digitos) => {
    digitos = String(digitos || "").replace(/\D/g, "").slice(-5);
    if (!digitos) digitos = "0";
    let valor = Number(digitos) / 100;
    if (valor > 100) valor = 100;
    return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  input.value = format(String(parsePrecoBR(input.value) * 100));

  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      let d = input.value.replace(/\D/g, "");
      input.value = format(d.slice(0, -1));
    } else if (e.key.length === 1 && !/\d/.test(e.key)) {
      e.preventDefault();
    }
  });

  input.addEventListener("input", (e) => {
    e.target.value = format(e.target.value);
  });

  input.addEventListener("focus", () => setTimeout(() => input.select(), 0));
}

function parsePrecoBR(valor) {
  if (valor == null || valor === "") return 0;
  const limpo = String(valor).replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return isNaN(n) ? 0 : n;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: (() => {
    const h = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = sessionStorage.getItem("token");
    if (token) h["Authorization"] = "Bearer " + token;
    return h;
  })()
  });
  if (response.status === 401) {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("usuario");
    if (typeof showLoginOverlay === "function")
      showLoginOverlay("Sessão expirada. Faça login novamente.");
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  if (!response.ok) {
    const rota = `${options.method || "GET"} ${new URL(url, window.location.href).pathname}`;
    let message = response.status === 404
      ? `Erro HTTP 404 em ${rota}; a rota não está disponível nesta instância do servidor.`
      : `Erro HTTP ${response.status} em ${rota}`;
    try {
      const body = await response.json();
      message = body.detail || (response.status === 404 ? message : body.title || message);
    } catch {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function load() {
  db = await api("/api/dados");
  for (const key of ["clientes", "veiculos", "servicos", "produtos", "carcacas", "carcacaOrdens", "estoque", "producao", "cargas", "pedidos", "financeiro", "contas", "boletos"])
    if (!Array.isArray(db[key])) db[key] = [];
  db.pedidos = db.pedidos.map((p) => ({ ...p, itens: p.itens || [] }));
  db.carcacaOrdens = db.carcacaOrdens.map((o) => ({ ...o, itens: o.itens || [] }));
}

async function reloadAndRender() {
  try {
    await load();
    render();
  } catch (error) {
    const msg = error.message || "Erro desconhecido";
    const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch");
    document.getElementById("title").textContent = "Erro ao carregar dados";
    document.getElementById("lede").textContent = isNetwork
      ? "Não foi possível conectar ao servidor. Verifique se o sistema está rodando (dotnet run)."
      : "Não foi possível consultar o banco de dados.";
    document.getElementById("view").innerHTML = `<section class="card">
      <p>${escapeHtml(msg)}</p>
      ${isNetwork ? '<p class="hint">Abra o terminal, entre na pasta do projeto e execute <code>dotnet run</code>, depois clique em Tentar novamente.</p>' : ''}
      <button class="btn" id="retryBtn">Tentar novamente</button>
    </section>`;
    document.getElementById("retryBtn").onclick = reloadAndRender;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
}

const NAV = [
  ["painel", "Painel"], ["clientes", "Entidades"], ["veiculos", "Veículos"], ["produtos", "Produtos"], ["servicos", "Serviços"], ["carcacas", "Carcaças"], ["estoque", "Estoque"], ["producao", "Produção"],
  ["vendas", "Vendas"], ["cargas", "Carga e descarga"], ["financeiro", "Entradas e saídas"],
  ["contas", "Pagar e receber"], ["boletos", "Boletos"]
];
const TITLES = {
  painel: ["Painel", "Todos os indicadores."],
  clientes: ["Entidades", "Cadastro e contato das entidades."],
  veiculos: ["Veículos", "Veículos vinculados às entidades."],
  produtos: ["Produtos", "Catálogo de produtos."],
  servicos: ["Serviços", "Catálogo de serviços oferecidos pela oficina."],
  carcacas: ["Apontamentos de carcaças", "Ordens de entrada de carcaças: selecione as carcaças, informe os valores e confira o total."],
  estoque: ["Estoque", "Pneus, recapados e insumos."],
  producao: ["Produção", "Apontamento por turno, medida e operador."],
  cargas: ["Carga e descarga", "Entrada e saída de pátio."],
  vendas: ["Vendas", "Monte pedidos com entidades cadastradas e produtos do catálogo."],
  financeiro: ["Entradas e saídas", "Caixa do dia a dia."],
  contas: ["Pagar e receber", "Títulos em aberto, pagos e vencidos."],
  boletos: ["Boletos", "Da empresa (a pagar) e de entidades (a receber)."]
};

function tone(status) {
  const s = (status || "").toLowerCase();
  if (["aprovada", "concluída", "pago", "faturado", "conferida", "saiu", "pronta"].includes(s)) return "ok";
  if (["em produção", "em andamento", "aberto", "orçamento", "aguardando"].includes(s)) return "warn";
  if (["reprovada", "vencido", "cancelado", "divergente", "refugo"].includes(s)) return "bad";
  return "";
}
function badge(status, date) {
  const label = date && overdue(date, status) ? "vencido" : status;
  return `<span class="badge ${tone(label)}">${escapeHtml(label)}</span>`;
}
function opts(list) { return list.map((v) => `<option value="${v}">${v}</option>`).join(""); }

function toast(msg, type = "") {
  let cont = document.querySelector(".toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.className = "toast-container";
    document.body.appendChild(cont);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  cont.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
    setTimeout(() => el.remove(), 300);
  }, 3200);
}



// Máscaras para Telefone, CPF e CNPJ
function aplicarMascaraTelefone(input) {
  if (!input || input.dataset.maskApplied) return;
  input.dataset.maskApplied = "1";
  input.addEventListener("input", () => {
    let v = input.value.replace(/\D/g, "").slice(0, 11);
    if (v.length === 0) { input.value = ""; return; }
    let formatted = "(" + v.slice(0, 2);
    if (v.length > 2) formatted += ") " + v.slice(2, 7);
    if (v.length > 7) formatted += "-" + v.slice(7, 11);
    input.value = formatted;
  });
  input.maxLength = 15;
}

function aplicarMascaraCpfCnpj(input) {
  if (!input || input.dataset.maskApplied) return;
  input.dataset.maskApplied = "1";
  input.addEventListener("input", () => {
    let v = input.value.replace(/\D/g, "");
    if (v.length <= 11) {
      v = v.slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      v = v.slice(0, 14);
      v = v.replace(/(\d{2})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1/$2");
      v = v.replace(/(\d{4})(\d{1,2})$/, "$1-$2");
    }
    input.value = v;
  });
  input.maxLength = 18;
}
