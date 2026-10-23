const fs = require('node:fs');
const path = require('node:path');
const PDFDocument = require('pdfkit');
const { getOrderForPdf } = require('./operations');

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
    if (order.pagamento) { doc.text(`Pagamento: ${safe(order.pagamento)}${order.vendedor ? `   ·   Vendedor: ${safe(order.vendedor)}` : ''}`, left, y, { width: contentWidth }); y += 15; }
    const appointment = [dateBr(order.agendamento), safe(order.horario), order.box && `Box ${safe(order.box)}`].filter(Boolean).join(' · ');
    if (appointment) { doc.text(`Agendamento: ${appointment}`, left, y, { width: contentWidth }); y += 15; }
    if (order.obs) { doc.text(`Observações: ${safe(order.obs)}`, left, y, { width: contentWidth}); y += 20; }

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

    y += 16;
    const summaryX = right - 230;
    doc.font('Helvetica').fontSize(9).fillColor(soft).text('Subtotal', summaryX, y, { width: 115 });
    doc.font('Helvetica').fillColor('#202923').text(money(subtotal), summaryX + 115, y, { width: 115, align: 'right' });
    y += 17;
    doc.font('Helvetica').fontSize(9).fillColor(soft).text(`Desconto (${Number(order.descontoPercentual || 0).toLocaleString('pt-BR')}%)`, summaryX, y, { width: 115 });
    doc.font('Helvetica').fillColor('#202923').text(`− ${money(discount)}`, summaryX + 115, y, { width: 115, align: 'right' });
    y += 20;
    doc.rect(summaryX, y, 230, 34).fill('#F2F8F4');
    doc.rect(summaryX, y, 92, 34).fill('#111111');
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text('TOTAL R$', summaryX + 8, y + 11, { width: 76, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(money(total), summaryX + 102, y + 10, { width: 120, align: 'right' });

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageRange.start + pageIndex);
      const footerY = doc.page.height - 42;
      doc.rect(0, footerY, pageWidth, 42).fill('#111111');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
        .text('MS PNEUS · REVENDEDOR DE PNEUS · Francisco Beltrão - PR', left, footerY + 16, { width: contentWidth, align: 'center' });
    }
    doc.end();
  });

  const filename = String(order.numero || 'pedido').replace(/[^A-Za-z0-9_-]/g, '_');
  return { buffer, filename: `Pedido-${filename}.pdf` };
}

module.exports = { createOrderPdf };
