// ===== Relatórios de vendas =====
// Os totais desta tela vêm exclusivamente da procedure dbo.usp_RelatorioVendas.

function dataLocal(ano, mes, dia) {
  const pad = (valor) => String(valor).padStart(2, "0");
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

function periodoMesAtual() {
  const agora = new Date();
  return {
    inicio: dataLocal(agora.getFullYear(), agora.getMonth() + 1, 1),
    fim: today()
  };
}

function periodoMesAnterior() {
  const agora = new Date();
  // Dia zero do mês atual é o último dia do mês anterior; evita depender de
  // subtração de 24 horas em regiões com mudança de horário de verão.
  const ultimoDiaAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0);
  return {
    inicio: dataLocal(ultimoDiaAnterior.getFullYear(), ultimoDiaAnterior.getMonth() + 1, 1),
    fim: dataLocal(ultimoDiaAnterior.getFullYear(), ultimoDiaAnterior.getMonth() + 1, ultimoDiaAnterior.getDate())
  };
}

let relatorioFiltro = { ...periodoMesAtual(), vendedorId: "" };
let relatorioVendas = null;
let relatorioCarregando = false;
let relatorioErro = "";

function numeroRelatorio(valor) {
  return Number(valor) || 0;
}

function vendedoresRelatorio() {
  // Vendedores são entidades cujo tipoEntidadeId é 4. Não inferimos mais a
  // lista a partir dos nomes gravados nos pedidos, evitando duplicidades.
  return (db.clientes || [])
    .filter((entidade) => Number(entidade.tipoEntidadeId) === 4 && String(entidade.status || "").toLowerCase() !== "inativo")
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
}

function periodoRelatorioTexto() {
  if (relatorioFiltro.inicio === relatorioFiltro.fim) return br(relatorioFiltro.inicio);
  return `${br(relatorioFiltro.inicio)} a ${br(relatorioFiltro.fim)}`;
}

function linhasDiariasRelatorio(linhas) {
  if (!linhas.length) {
    return `<tr><td colspan="8" class="relatorio-vazio">Não houve vendas faturadas ou pagas no período selecionado.</td></tr>`;
  }
  return linhas.map((linha) => `<tr>
    <td>${br(linha.data)}</td>
    <td class="num">${numeroRelatorio(linha.quantidadeVendas)}</td>
    <td class="num">${numeroRelatorio(linha.quantidadePneus)}</td>
    <td class="num">${numeroRelatorio(linha.quantidadeServicos)}</td>
    <td class="num">${money(linha.valorBruto)}</td>
    <td class="num">${money(linha.valorDesconto)}</td>
    <td class="num relatorio-valor-liquido">${money(linha.valorLiquido)}</td>
    <td class="num">${money(linha.ticketMedio)}</td>
  </tr>`).join("");
}

function tabelaVendedoresRelatorio(linhas) {
  if (!linhas.length) return `<p class="hint">Sem vendedores para exibir neste período.</p>`;
  return `<div class="table-wrap"><table class="relatorio-tabela-menor">
    <thead><tr><th>Vendedor</th><th class="num">Vendas</th><th class="num">Pneus</th><th class="num">Faturamento líquido</th><th class="num">Ticket médio</th></tr></thead>
    <tbody>${linhas.map((linha) => `<tr>
      <td>${escapeHtml(linha.vendedor || "Não informado")}</td>
      <td class="num">${numeroRelatorio(linha.quantidadeVendas)}</td>
      <td class="num">${numeroRelatorio(linha.quantidadePneus)}</td>
      <td class="num relatorio-valor-liquido">${money(linha.valorLiquido)}</td>
      <td class="num">${money(linha.ticketMedio)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function tabelaFormasRelatorio(linhas) {
  if (!linhas.length) return `<p class="hint">Sem condições de pagamento para exibir neste período.</p>`;
  return `<div class="table-wrap"><table class="relatorio-tabela-menor">
    <thead><tr><th>Condição de pagamento</th><th class="num">Vendas</th><th class="num">Faturamento líquido</th></tr></thead>
    <tbody>${linhas.map((linha) => `<tr>
      <td>${escapeHtml(linha.formaPagamento || "Não informado")}</td>
      <td class="num">${numeroRelatorio(linha.quantidadeVendas)}</td>
      <td class="num relatorio-valor-liquido">${money(linha.valorLiquido)}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function conteudoRelatorioVendas() {
  if (relatorioCarregando && !relatorioVendas) {
    return `<section class="card relatorio-estado" aria-live="polite"><p>Carregando o relatório de vendas...</p></section>`;
  }
  if (relatorioErro) {
    return `<section class="card relatorio-estado"><p>${escapeHtml(relatorioErro)}</p><button type="button" class="btn" data-relatorio-tentar>Atualizar relatório</button></section>`;
  }
  if (!relatorioVendas) return "";

  const resumo = relatorioVendas.resumo || {};
  const diario = Array.isArray(relatorioVendas.diario) ? relatorioVendas.diario : [];
  const vendedores = Array.isArray(relatorioVendas.vendedores) ? relatorioVendas.vendedores : [];
  const formasPagamento = Array.isArray(relatorioVendas.formasPagamento) ? relatorioVendas.formasPagamento : [];
  const atualizando = relatorioCarregando ? `<span class="relatorio-atualizando" aria-live="polite">Atualizando...</span>` : "";

  return `${atualizando}
    <div class="relatorio-kpis">
      <article class="relatorio-kpi principal"><span>Faturamento líquido</span><strong>${money(resumo.valorLiquido)}</strong><em>vendas faturadas e pagas</em></article>
      <article class="relatorio-kpi"><span>Vendas</span><strong>${numeroRelatorio(resumo.quantidadeVendas)}</strong><em>ticket médio de ${money(resumo.ticketMedio)}</em></article>
      <article class="relatorio-kpi"><span>Pneus vendidos</span><strong>${numeroRelatorio(resumo.quantidadePneus)}</strong><em>${numeroRelatorio(resumo.quantidadeServicos)} serviço(s) no período</em></article>
      <article class="relatorio-kpi"><span>Descontos</span><strong>${money(resumo.valorDesconto)}</strong><em>bruto: ${money(resumo.valorBruto)}</em></article>
    </div>

    <section class="card relatorio-secao">
      <div class="relatorio-secao-topo"><div><h2>Resultado diário</h2><p class="hint">Faturamento líquido por data de venda.</p></div><span class="meta">${escapeHtml(periodoRelatorioTexto())}</span></div>
      <div class="table-wrap"><table class="relatorio-tabela">
        <thead><tr><th>Data</th><th class="num">Vendas</th><th class="num">Pneus</th><th class="num">Serviços</th><th class="num">Bruto</th><th class="num">Descontos</th><th class="num">Líquido</th><th class="num">Ticket médio</th></tr></thead>
        <tbody>${linhasDiariasRelatorio(diario)}</tbody>
      </table></div>
    </section>

    <div class="relatorio-divisao">
      <section class="card relatorio-secao"><div class="relatorio-secao-topo"><div><h2>Por vendedor</h2><p class="hint">Comparativo das vendas do período.</p></div></div>${tabelaVendedoresRelatorio(vendedores)}</section>
      <section class="card relatorio-secao"><div class="relatorio-secao-topo"><div><h2>Por condição de pagamento</h2><p class="hint">Faturamento, não recebimento de caixa.</p></div></div>${tabelaFormasRelatorio(formasPagamento)}</section>
    </div>
    <p class="relatorio-nota">Este relatório considera pedidos <strong>faturados</strong> ou <strong>pagos</strong>. Orçamentos e vendas canceladas não entram no total.</p>`;
}

function viewRelatorios() {
  const vendedores = vendedoresRelatorio();
  return `<section class="relatorio-filtros card">
      <form id="relatorioForm" class="relatorio-form" novalidate>
        <div class="relatorio-atalhos" role="group" aria-label="Períodos rápidos">
          <button type="button" class="btn ghost small" data-relatorio-periodo="hoje">Hoje</button>
          <button type="button" class="btn ghost small" data-relatorio-periodo="mes">Este mês</button>
          <button type="button" class="btn ghost small" data-relatorio-periodo="mes-anterior">Mês anterior</button>
        </div>
        <label>Data inicial<input id="relatorioInicio" type="date" required value="${escapeAttr(relatorioFiltro.inicio)}"></label>
        <label>Data final<input id="relatorioFim" type="date" required value="${escapeAttr(relatorioFiltro.fim)}"></label>
        <label>Vendedor<select id="relatorioVendedor"><option value="">Todos os vendedores</option>${vendedores.map((vendedor) => `<option value="${escapeAttr(vendedor.id)}"${sameId(vendedor.id, relatorioFiltro.vendedorId) ? " selected" : ""}>${escapeHtml(vendedor.nome)}</option>`).join("")}</select></label>
        <button class="btn" type="submit">Atualizar</button>
      </form>
    </section>
    ${conteudoRelatorioVendas()}`;
}

async function carregarRelatorioVendas() {
  if (relatorioCarregando) return;
  relatorioCarregando = true;
  relatorioErro = "";
  if (page === "relatorios") render();
  try {
    const parametros = new URLSearchParams({
      inicio: relatorioFiltro.inicio,
      fim: relatorioFiltro.fim
    });
    if (relatorioFiltro.vendedorId) parametros.set("vendedorId", relatorioFiltro.vendedorId);
    relatorioVendas = await api(`/api/relatorios/vendas?${parametros.toString()}`);
  } catch (error) {
    relatorioErro = `Não foi possível carregar o relatório: ${error.message}`;
  } finally {
    relatorioCarregando = false;
    if (page === "relatorios") render();
  }
}

function iniciarRelatorioVendas() {
  if (!relatorioVendas && !relatorioCarregando) carregarRelatorioVendas();
}

function invalidarRelatorioVendas() {
  relatorioVendas = null;
  relatorioErro = "";
}

function ligarRelatorios(view) {
  const form = view.querySelector("#relatorioForm");
  if (form) form.onsubmit = (evento) => {
    evento.preventDefault();
    const inicio = document.getElementById("relatorioInicio").value;
    const fim = document.getElementById("relatorioFim").value;
    const vendedorId = document.getElementById("relatorioVendedor").value;
    if (!inicio || !fim) {
      toast("Informe as duas datas do relatório.", "warn");
      return;
    }
    if (inicio > fim) {
      toast("A data inicial não pode ser posterior à data final.", "warn");
      return;
    }
    relatorioFiltro = { inicio, fim, vendedorId };
    carregarRelatorioVendas();
  };

  view.querySelectorAll("[data-relatorio-periodo]").forEach((botao) => botao.onclick = () => {
    const periodo = botao.dataset.relatorioPeriodo;
    if (periodo === "hoje") relatorioFiltro = { ...relatorioFiltro, inicio: today(), fim: today() };
    else if (periodo === "mes") relatorioFiltro = { ...relatorioFiltro, ...periodoMesAtual() };
    else if (periodo === "mes-anterior") relatorioFiltro = { ...relatorioFiltro, ...periodoMesAnterior() };
    carregarRelatorioVendas();
  });

  const tentar = view.querySelector("[data-relatorio-tentar]");
  if (tentar) tentar.onclick = carregarRelatorioVendas;
}
