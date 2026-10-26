const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { getOrderForPdf, getCarcacaOrdemForPdf, getCargaForPdf } = require('./operations');

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const safe = (value) => String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim();
const dateBr = (value) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : safe(value);
};

async function createOrderPdf(pool, id) {
  const order = await getOrderForPdf(pool, id);
  const logoPath = path.join(__dirname, '..', 'wwwroot', 'fotos', 'logo', 'logo.PNG');
  const chunks = [];

  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Pedido ${safe(order.numero)}`, Author: 'Fábrica de Pneus' } });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const left = 48;
    const right = pageWidth - 48;
    const contentWidth = right - left;
    const green = '#16834A';
    const darkGreen = '#105E37';
    const soft = '#65736A';
    const line = '#DDE5DF';
    const subtotal = (order.itens || []).reduce((sum, item) => sum + Number(item.qtd || 0) * Number(item.unitario || 0), 0);
    const discount = Math.max(0, Number(order.descontoValor) || 0);
    const total = Math.max(0, subtotal - discount);

    // Barra superior
    doc.rect(0, 0, pageWidth * 0.23, 12).fill(green);
    doc.rect(pageWidth * 0.23, 0, pageWidth * 0.77, 12).fill('#111111');
    doc.y = 34;

    if (fs.existsSync(logoPath)) {
      try { doc.image(logoPath, left, doc.y, { fit: [180, 58], valign: 'center' }); } catch { /* PDF sem logo se a imagem for inválida */ }
    } else {
      doc.font('Helvetica-Bold').fontSize(23).fillColor(darkGreen).text('MS PNEUS', left, doc.y + 12, { width: 180 });
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(darkGreen).text('46 99110-7935 / 46 99115-2629', right - 215, 38, { width: 215, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(soft)
      .text('Rua Edgar Faust, 163 · Bairro Padre Ulrico', right - 240, 52, { width: 240, align: 'right' })
      .text('Francisco Beltrão - PR · CEP 85604-481', right - 240, 64, { width: 240, align: 'right' });

    doc.moveTo(left, 105).lineTo(right, 105).lineWidth(2).strokeColor(green).stroke();
    doc.font('Helvetica-Bold').fontSize(23).fillColor('#111111').text('ORÇAMENTO', left, 122);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(soft).text('PEDIDO', right - 145, 124, { width: 145, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(safe(order.numero), right - 145, 140, { width: 145, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(soft).text(`Data: ${dateBr(order.data) || '—'}`, left, 154);

    let y = 184;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(darkGreen).text('CLIENTE', left, y);
    y += 15;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#202923').text(safe(order.cliente) || '—', left, y, { width: contentWidth });
    y += 20;
    doc.font('Helvetica').fontSize(9).fillColor(soft);
    const clientDetails = [order.documento && `CPF/CNPJ: ${safe(order.documento)}`, order.telefone && `Telefone: ${safe(order.telefone)}`].filter(Boolean).join('   ·   ');
    if (clientDetails) { doc.text(clientDetails, left, y, { width: contentWidth }); y += 15; }
    const address = [order.endereco, order.bairro, [order.cidade, order.estado].filter(Boolean).join('/'), order.cep && `CEP ${order.cep}`]
      .map(safe).filter(Boolean).join(' · ');
    if (address) { doc.text(address, left, y, { width: contentWidth }); y += 15; }
    if (order.veiculo) { doc.text(`Veículo: ${safe(order.veiculo)}`, left, y, { width: contentWidth }); y += 15; }
    if (order.pagamento) { doc.text(`Pagamento: ${safe(order.pagamento)}${order.parcelasTexto ? ` (${safe(order.parcelasTexto)})` : ''}${order.vendedor ? `   ·   Vendedor: ${safe(order.vendedor)}` : ''}`, left, y, { width: contentWidth }); y += 15; }
    const appointment = [dateBr(order.agendamento), safe(order.horario), order.box && `Box ${safe(order.box)}`].filter(Boolean).join(' · ');
    if (appointment) { doc.text(`Agendamento: ${appointment}`, left, y, { width: contentWidth }); y += 15; }
    // Observações: só entram no PDF quando o pedido tiver alguma (mantém as quebras de linha).
    const observacoes = String(order.obs == null ? '' : order.obs).replace(/\r\n?/g, '\n').replace(/\t/g, ' ').trim();
    if (observacoes) {
      y += 6;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(darkGreen).text('OBSERVAÇÕES', left, y);
      y += 14;
      doc.font('Helvetica').fontSize(9).fillColor('#202923');
      const obsHeight = doc.heightOfString(observacoes, { width: contentWidth });
      doc.text(observacoes, left, y, { width: contentWidth });
      y += obsHeight + 8;
    }

    y += 10;
    const col = { qty: left, description: left + 52, unit: right - 170, total: right - 78 };
    const tableHeader = () => {
      doc.rect(left, y, contentWidth, 25).fill(darkGreen);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
        .text('QTD.', col.qty + 8, y + 8, { width: 40 })
        .text('DESCRIÇÃO DOS PRODUTOS / SERVIÇOS', col.description, y + 8, { width: col.unit - col.description - 8 })
        .text('UNITÁRIO', col.unit, y + 8, { width: 78, align: 'right' })
        .text('TOTAL', col.total, y + 8, { width: 70, align: 'right' });
      y += 25;
    };
    tableHeader();

    const items = order.itens || [];
    const displayCount = Math.max(8, items.length);
    for (let i = 0; i < displayCount; i += 1) {
      const item = items[i];
      const description = item ? [safe(item.descricao), safe(item.medida)].filter(Boolean).join(' · ') : '';
      const descriptionHeight = item ? Math.max(30, doc.heightOfString(description || '—', { width: col.unit - col.description - 10, font: 'Helvetica', fontSize: 8 }) + 14) : 30;
      if (y + descriptionHeight > doc.page.height - 75) {
        doc.addPage();
        y = 50;
        tableHeader();
      }
      if (i % 2 === 0) doc.rect(left, y, contentWidth, descriptionHeight).fill('#F2F8F4');
      doc.moveTo(left, y + descriptionHeight).lineTo(right, y + descriptionHeight).lineWidth(0.5).strokeColor(line).stroke();
      doc.font('Helvetica').fontSize(8).fillColor('#202923');
      if (item) {
        doc.text(String(item.qtd), col.qty + 8, y + 9, { width: 38 });
        doc.text(description || '—', col.description, y + 8, { width: col.unit - col.description - 10, height: descriptionHeight - 10 });
        doc.text(money(item.unitario), col.unit, y + 9, { width: 78, align: 'right' });
        doc.text(money(Number(item.qtd) * Number(item.unitario)), col.total, y + 9, { width: 70, align: 'right' });
      }
      y += descriptionHeight;
    }

    // Totais + selo de garantia precisam de ~120pt; se não couber, vão para a próxima página.
    if (y + 125 > doc.page.height - 55) {
      doc.addPage();
      y = 50;
    }
    y += 16;
    const summaryX = right - 230;
    doc.font('Helvetica').fontSize(9).fillColor(soft).text('Subtotal', summaryX, y, { width: 115 });
    doc.font('Helvetica').fillColor('#202923').text(money(subtotal), summaryX + 115, y, { width: 115, align: 'right' });
    y += 17;
    doc.font('Helvetica').fontSize(9).fillColor(soft).text(`Desconto (${Number(order.descontoPercentual || 0).toLocaleString('pt-BR')}%)`, summaryX, y, { width: 115 });
    doc.font('Helvetica').fillColor('#202923').text(`- ${money(discount)}`, summaryX + 115, y, { width: 115, align: 'right' });
    y += 20;
    doc.rect(summaryX, y, 230, 34).fill('#F2F8F4');
    doc.rect(summaryX, y, 92, 34).fill('#111111');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text('TOTAL R$', summaryX + 8, y + 11, { width: 76, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(money(total), summaryX + 102, y + 10, { width: 120, align: 'right' });

    // Selo de garantia: círculo verde com "6", na mesma linha do total, e o texto embaixo.
    const WARRANTY_MONTHS = 6;
    const sealRadius = 24;
    const sealCenterX = left + 50;
    const sealCenterY = y + 17; // centro vertical da caixa do total (altura 34)
    doc.circle(sealCenterX, sealCenterY, sealRadius).fill(green);
    doc.circle(sealCenterX, sealCenterY, sealRadius - 4).lineWidth(1.2).strokeColor('#FFFFFF').stroke();
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#FFFFFF')
      .text(String(WARRANTY_MONTHS), sealCenterX - sealRadius, sealCenterY - 12, { width: sealRadius * 2, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(darkGreen)
      .text('MESES DE GARANTIA', sealCenterX - 55, sealCenterY + sealRadius + 6, { width: 110, align: 'center', lineBreak: false });

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageRange.start + pageIndex);
      const footerY = doc.page.height - 42;
      doc.rect(0, footerY, pageWidth, 42).fill('#111111');
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // evita que o rodapé abra uma página extra
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
        .text('MS PNEUS · REVENDEDOR DE PNEUS · Francisco Beltrão - PR', left, footerY + 16, { width: contentWidth, align: 'center', lineBreak: false });
      doc.page.margins.bottom = bottomMargin;
    }
    doc.end();
  });

  const filename = String(order.numero || 'pedido').replace(/[^A-Za-z0-9_-]/g, '_');
  return { buffer, filename: `Pedido-${filename}.pdf` };
}

// ---------------------------------------------------------------------------
// PDF do apontamento de entrada de carcaças (mesmo visual do PDF do pedido).
// ---------------------------------------------------------------------------
const PDF_COLORS = { green: '#16834A', darkGreen: '#105E37', soft: '#65736A', line: '#DDE5DF', ink: '#202923', zebra: '#F2F8F4' };
const LOGO_PATH = path.join(__dirname, '..', 'wwwroot', 'fotos', 'logo', 'logo.PNG');
const capitalize = (value) => { const text = safe(value); return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''; };

function drawCompanyHeader(doc, { title, numberLabel, number, date }) {
  const { green, darkGreen, soft } = PDF_COLORS;
  const pageWidth = doc.page.width;
  const left = 48;
  const right = pageWidth - 48;
  doc.rect(0, 0, pageWidth * 0.23, 12).fill(green);
  doc.rect(pageWidth * 0.23, 0, pageWidth * 0.77, 12).fill('#111111');
  if (fs.existsSync(LOGO_PATH)) {
    try { doc.image(LOGO_PATH, left, 34, { fit: [180, 58], valign: 'center' }); } catch { /* PDF sem logo se a imagem for inválida */ }
  } else {
    doc.font('Helvetica-Bold').fontSize(23).fillColor(darkGreen).text('MS PNEUS', left, 46, { width: 180 });
  }
  doc.font('Helvetica-Bold').fontSize(9).fillColor(darkGreen).text('46 99110-7935 / 46 99115-2629', right - 215, 38, { width: 215, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(soft)
    .text('Rua Edgar Faust, 163 · Bairro Padre Ulrico', right - 240, 52, { width: 240, align: 'right' })
    .text('Francisco Beltrão - PR · CEP 85604-481', right - 240, 64, { width: 240, align: 'right' });
  doc.moveTo(left, 105).lineTo(right, 105).lineWidth(2).strokeColor(green).stroke();
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111').text(title, left, 122, { width: right - left - 160 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(soft).text(numberLabel, right - 145, 124, { width: 145, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(safe(number) || '—', right - 145, 140, { width: 145, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(soft).text(`Data: ${dateBr(date) || '—'}`, left, 154);
}

function drawFooters(doc, text) {
  const pageWidth = doc.page.width;
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const footerY = doc.page.height - 42;
    // Zera a margem inferior para o texto do rodapé não abrir uma página nova.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.rect(0, footerY, pageWidth, 42).fill('#111111');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
      .text(text, 48, footerY + 12, { width: pageWidth - 96, align: 'center', lineBreak: false })
      .text(`Página ${index + 1} de ${range.count}`, 48, footerY + 24, { width: pageWidth - 96, align: 'center', lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
}

function renderPdf(info, draw) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info });
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function createCarcacaOrdemPdf(pool, id) {
  const ordem = await getCarcacaOrdemForPdf(pool, id);
  const { darkGreen, soft, line, ink, zebra } = PDF_COLORS;
  const itens = ordem.itens || [];
  const lineTotal = (item) => (item.valorTotal != null ? Number(item.valorTotal) : Number(item.qtd || 0) * Number(item.valorUnitario || 0)) || 0;
  const totalUnidades = itens.reduce((sum, item) => sum + (Number(item.qtd) || 0), 0);
  const totalValor = itens.length ? itens.reduce((sum, item) => sum + lineTotal(item), 0) : Number(ordem.total) || 0;

  const buffer = await renderPdf({ Title: `Apontamento ${safe(ordem.numero)}`, Author: 'Fábrica de Pneus' }, (doc) => {
    const left = 48;
    const right = doc.page.width - 48;
    const contentWidth = right - left;
    const bottomLimit = doc.page.height - 75;
    drawCompanyHeader(doc, { title: 'APONTAMENTO DE CARCAÇAS', numberLabel: 'APONTAMENTO', number: ordem.numero, date: ordem.data });

    // Dados do apontamento
    let y = 184;
    const infoBox = (label, value, x, width) => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(darkGreen).text(label, x, y, { width });
      doc.font('Helvetica').fontSize(10).fillColor(ink).text(value || '—', x, y + 12, { width });
    };
    const colWidth = contentWidth / 3;
    infoBox('DONO / FORNECEDOR', safe(ordem.dono), left, colWidth - 10);
    infoBox('ORIGEM', capitalize(ordem.origem), left + colWidth, colWidth - 10);
    infoBox('STATUS', capitalize(ordem.status), left + colWidth * 2, colWidth - 10);
    y += 38;
    if (ordem.obs) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(darkGreen).text('OBSERVAÇÕES', left, y);
      const obs = safe(ordem.obs);
      doc.font('Helvetica').fontSize(9).fillColor(ink).text(obs, left, y + 12, { width: contentWidth });
      y += 18 + doc.heightOfString(obs, { width: contentWidth });
    }

    // Tabela de carcaças
    y += 10;
    const col = { code: left, desc: left + 62, qty: right - 230, unit: right - 168, total: right - 82 };
    const tableHeader = () => {
      doc.rect(left, y, contentWidth, 25).fill(darkGreen);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
        .text('CÓD.', col.code + 8, y + 8, { width: 50 })
        .text('CARCAÇA / MEDIDA', col.desc, y + 8, { width: col.qty - col.desc - 8 })
        .text('QTD.', col.qty, y + 8, { width: 50, align: 'right' })
        .text('UNITÁRIO', col.unit, y + 8, { width: 78, align: 'right' })
        .text('TOTAL', col.total, y + 8, { width: 74, align: 'right' });
      y += 25;
    };
    tableHeader();
    const rows = Math.max(6, itens.length);
    for (let i = 0; i < rows; i += 1) {
      const item = itens[i];
      const nome = item ? safe(item.item) : '';
      const medida = item ? safe(item.medida) : '';
      const description = item ? ((medida && !nome.includes(medida) ? [nome, medida] : [nome]).filter(Boolean).join(' · ') || medida || '—') : '';
      doc.font('Helvetica').fontSize(8);
      const height = item ? Math.max(26, doc.heightOfString(description, { width: col.qty - col.desc - 10 }) + 14) : 26;
      if (y + height > bottomLimit) { doc.addPage(); y = 50; tableHeader(); }
      if (i % 2 === 0) doc.rect(left, y, contentWidth, height).fill(zebra);
      doc.moveTo(left, y + height).lineTo(right, y + height).lineWidth(0.5).strokeColor(line).stroke();
      if (item) {
        doc.font('Helvetica').fontSize(8).fillColor(ink)
          .text(safe(item.produtoId) || '—', col.code + 8, y + 9, { width: 52 })
          .text(description, col.desc, y + 8, { width: col.qty - col.desc - 10 })
          .text(String(Number(item.qtd) || 0), col.qty, y + 9, { width: 50, align: 'right' })
          .text(money(item.valorUnitario), col.unit, y + 9, { width: 78, align: 'right' })
          .text(money(lineTotal(item)), col.total, y + 9, { width: 74, align: 'right' });
      }
      y += height;
    }

    // Totais
    if (y + 150 > bottomLimit) { doc.addPage(); y = 50; }
    y += 16;
    const summaryX = right - 230;
    doc.font('Helvetica').fontSize(9).fillColor(soft).text('Total de carcaças', summaryX, y, { width: 115 });
    doc.font('Helvetica-Bold').fillColor(ink).text(`${totalUnidades} un.`, summaryX + 115, y, { width: 115, align: 'right' });
    y += 20;
    doc.rect(summaryX, y, 230, 34).fill(zebra);
    doc.rect(summaryX, y, 92, 34).fill('#111111');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text('TOTAL R$', summaryX + 8, y + 11, { width: 76, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(money(totalValor), summaryX + 102, y + 10, { width: 120, align: 'right' });

    // Assinaturas
    y += 80;
    const signWidth = (contentWidth - 40) / 2;
    [['Entregue por', left], ['Conferido / recebido por', left + signWidth + 40]].forEach(([label, x]) => {
      doc.moveTo(x, y).lineTo(x + signWidth, y).lineWidth(0.8).strokeColor('#9AA79F').stroke();
      doc.font('Helvetica').fontSize(8).fillColor(soft).text(label, x, y + 6, { width: signWidth, align: 'center' });
    });

    drawFooters(doc, 'MS PNEUS · APONTAMENTO DE ENTRADA DE CARCAÇAS · Francisco Beltrão - PR');
  });

  const filename = String(ordem.numero || 'apontamento').replace(/[^A-Za-z0-9_-]/g, '_');
  return { buffer, filename: `Apontamento-${filename}.pdf` };
}

// Romaneio de carga / descarga: dados do transporte, venda vinculada, produtos e assinaturas.
async function createCargaPdf(pool, id) {
  const carga = await getCargaForPdf(pool, id);
  const { darkGreen, soft, line, ink, zebra } = PDF_COLORS;
  const descarga = String(carga.tipo || '').toLowerCase() === 'descarga';
  const tipoTexto = descarga ? 'DESCARGA' : 'CARGA';
  const referencia = String(carga.id || '').slice(0, 8).toUpperCase();
  const itens = carga.itens || [];
  const totalPecas = itens.reduce((sum, item) => sum + (Number(item.qtd) || 0), 0);
  // Preços digitados no movimento: as colunas só aparecem se algum produto tiver preço.
  const precoDe = (item) => (Number(item?.valorUnitario) > 0 ? Number(item.valorUnitario) : 0);
  const comPreco = itens.some((item) => precoDe(item) > 0);
  const valorTotal = itens.reduce((sum, item) => sum + (Number(item.qtd) || 0) * precoDe(item), 0);

  const buffer = await renderPdf({ Title: `${descarga ? 'Descarga' : 'Carga'} ${referencia}`, Author: 'Fábrica de Pneus' }, (doc) => {
    const left = 48;
    const right = doc.page.width - 48;
    const contentWidth = right - left;
    const bottomLimit = doc.page.height - 75;
    drawCompanyHeader(doc, { title: `ROMANEIO DE ${tipoTexto}`, numberLabel: 'REFERÊNCIA', number: referencia, date: carga.data });

    // Dados do movimento, em blocos de 3 colunas (campos vazios não aparecem)
    let y = 184;
    const colWidth = contentWidth / 3;
    const campos = [
      ['TIPO', descarga ? 'Descarga (entrada)' : 'Carga (saída)'],
      ['STATUS', capitalize(carga.status)],
      ['VENDA VINCULADA', safe(carga.pedidoNumero)],
      ['CLIENTE', safe(carga.cliente || carga.parceiro)],
      ['CPF / CNPJ', safe(carga.clienteDocumento)],
      ['NOTA FISCAL', safe(carga.nf)],
      ['MOTORISTA', safe(carga.motorista)],
      ['FUNCIONÁRIO RESPONSÁVEL', safe(carga.funcionario)]
    ].filter(([, value]) => value);
    for (let i = 0; i < campos.length; i += 3) {
      let alturaLinha = 0;
      campos.slice(i, i + 3).forEach(([label, value], indice) => {
        const x = left + colWidth * indice;
        const texto = value;
        doc.font('Helvetica-Bold').fontSize(8).fillColor(darkGreen).text(label, x, y, { width: colWidth - 10 });
        doc.font('Helvetica').fontSize(10).fillColor(ink).text(texto, x, y + 12, { width: colWidth - 10 });
        alturaLinha = Math.max(alturaLinha, 14 + doc.heightOfString(texto, { width: colWidth - 10 }));
      });
      y += alturaLinha + 10;
    }

    // Tabela de produtos
    y += 6;
    const col = comPreco
      ? { code: left, desc: left + 70, medida: right - 310, medidaW: 90, qty: right - 215, qtyW: 45, unit: right - 160, total: right - 82 }
      : { code: left, desc: left + 80, medida: right - 190, medidaW: 110, qty: right - 70, qtyW: 62 };
    const tableHeader = () => {
      doc.rect(left, y, contentWidth, 25).fill(darkGreen);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
        .text('CÓD.', col.code + 8, y + 8, { width: 70 })
        .text('PRODUTO', col.desc, y + 8, { width: col.medida - col.desc - 8 })
        .text('MEDIDA', col.medida, y + 8, { width: col.medidaW })
        .text('QTD.', col.qty, y + 8, { width: col.qtyW, align: 'right' });
      if (comPreco) {
        doc.text('UNITÁRIO', col.unit, y + 8, { width: 72, align: 'right' })
          .text('TOTAL', col.total, y + 8, { width: 74, align: 'right' });
      }
      y += 25;
    };
    tableHeader();
    const rows = Math.max(6, itens.length);
    for (let i = 0; i < rows; i += 1) {
      const item = itens[i];
      const nome = item ? safe(item.item) : '';
      doc.font('Helvetica').fontSize(8);
      const height = item ? Math.max(26, doc.heightOfString(nome, { width: col.medida - col.desc - 10 }) + 14) : 26;
      if (y + height > bottomLimit) { doc.addPage(); y = 50; tableHeader(); }
      if (i % 2 === 0) doc.rect(left, y, contentWidth, height).fill(zebra);
      doc.moveTo(left, y + height).lineTo(right, y + height).lineWidth(0.5).strokeColor(line).stroke();
      if (item) {
        doc.font('Helvetica').fontSize(8).fillColor(ink)
          .text(safe(item.produtoId), col.code + 8, y + 9, { width: 70 })
          .text(nome, col.desc, y + 8, { width: col.medida - col.desc - 10 })
          .text(safe(item.medida), col.medida, y + 9, { width: col.medidaW })
          .text(String(Number(item.qtd) || 0), col.qty, y + 9, { width: col.qtyW, align: 'right' });
        if (comPreco && precoDe(item)) {
          doc.text(money(precoDe(item)), col.unit, y + 9, { width: 72, align: 'right' })
            .font('Helvetica-Bold').text(money(precoDe(item) * (Number(item.qtd) || 0)), col.total, y + 9, { width: 74, align: 'right' });
        }
      }
      y += height;
    }
    if (carga.itensDaVenda) {
      y += 6;
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(soft).text(`Produtos conforme a venda ${safe(carga.pedidoNumero)}.`, left, y, { width: contentWidth });
      y += 10;
    }

    // Total de peças
    if (y + 170 > bottomLimit) { doc.addPage(); y = 50; }
    y += 16;
    const summaryX = right - 230;
    doc.rect(summaryX, y, 230, 34).fill(zebra);
    doc.rect(summaryX, y, 110, 34).fill('#111111');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text('TOTAL DE PEÇAS', summaryX + 8, y + 12, { width: 94, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(String(totalPecas), summaryX + 118, y + 9, { width: 104, align: 'right' });
    if (comPreco) {
      y += 40;
      doc.rect(summaryX, y, 230, 34).fill(zebra);
      doc.rect(summaryX, y, 110, 34).fill(darkGreen);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text('VALOR TOTAL', summaryX + 8, y + 12, { width: 94, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(money(valorTotal), summaryX + 118, y + 9, { width: 104, align: 'right' });
    }

    // Assinaturas
    y += 100;
    const signWidth = (contentWidth - 40) / 2;
    const assinaturas = descarga
      ? [['Motorista / entregue por', left], ['Recebido / conferido por', left + signWidth + 40]]
      : [['Conferido / expedido por', left], ['Motorista / recebido por', left + signWidth + 40]];
    assinaturas.forEach(([label, x]) => {
      doc.moveTo(x, y).lineTo(x + signWidth, y).lineWidth(0.8).strokeColor('#9AA79F').stroke();
      doc.font('Helvetica').fontSize(8).fillColor(soft).text(label, x, y + 6, { width: signWidth, align: 'center' });
    });

    drawFooters(doc, `MS PNEUS · ROMANEIO DE ${tipoTexto} · Francisco Beltrão - PR`);
  });

  const nome = [descarga ? 'Descarga' : 'Carga', carga.data || '', referencia].filter(Boolean).join('-').replace(/[^A-Za-z0-9_-]/g, '_');
  return { buffer, filename: `${nome}.pdf` };
}

module.exports = { createOrderPdf, createCarcacaOrdemPdf, createCargaPdf };
