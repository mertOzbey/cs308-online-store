import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { createInvoiceData, loadInvoiceData } from './invoiceData.js';

const regularFont = fileURLToPath(new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url));
const boldFont = fileURLToPath(new URL('../assets/fonts/NotoSans-Bold.ttf', import.meta.url));

const colors = Object.freeze({
  burgundy: '#6B2942',
  rose: '#F3E2E8',
  ink: '#34272B',
  muted: '#76666B',
  border: '#DDCBD0',
  white: '#FFFFFF',
});

function collectPdf(document) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.once('end', () => resolve(Buffer.concat(chunks)));
    document.once('error', reject);
  });
}

function formatPurchasedAt(value) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

function drawPageHeading(doc, invoice) {
  doc.font('NotoBold').fontSize(22).fillColor(colors.burgundy).text('SULINA', 54, 48);
  doc.font('NotoRegular').fontSize(9).fillColor(colors.muted)
    .text('Güzellik ve bakım mağazası', 54, 77);
  doc.font('NotoBold').fontSize(27).fillColor(colors.ink)
    .text('FATURA', 365, 48, { width: 176, align: 'right' });

  doc.moveTo(54, 105).lineTo(541, 105).lineWidth(1).strokeColor(colors.border).stroke();
  doc.font('NotoBold').fontSize(9).fillColor(colors.muted).text('FATURA NO', 54, 122);
  doc.font('NotoRegular').fontSize(10).fillColor(colors.ink).text(invoice.invoiceNumber, 54, 138, { width: 220 });
  doc.font('NotoBold').fontSize(9).fillColor(colors.muted).text('SİPARİŞ NO', 300, 122);
  doc.font('NotoRegular').fontSize(10).fillColor(colors.ink).text(String(invoice.orderId), 300, 138, { width: 90 });
  doc.font('NotoBold').fontSize(9).fillColor(colors.muted).text('TARİH', 405, 122);
  doc.font('NotoRegular').fontSize(9).fillColor(colors.ink)
    .text(formatPurchasedAt(invoice.purchasedAt), 405, 138, { width: 136, align: 'right' });
}

function drawCustomer(doc, customer) {
  const top = 178;
  doc.roundedRect(54, top, 487, 88, 8).fillAndStroke(colors.rose, colors.border);
  doc.font('NotoBold').fontSize(10).fillColor(colors.burgundy).text('FATURA BİLGİLERİ', 70, top + 15);
  doc.font('NotoBold').fontSize(10).fillColor(colors.ink).text(customer.name, 70, top + 35, { width: 210 });
  doc.font('NotoRegular').fontSize(9).fillColor(colors.ink).text(customer.email, 70, top + 53, { width: 210 });
  doc.font('NotoRegular').fontSize(9).fillColor(colors.ink)
    .text(customer.deliveryAddress, 300, top + 35, { width: 225, height: 40, align: 'right' });
  doc.y = top + 110;
}

function drawTableHeader(doc, top) {
  doc.roundedRect(54, top, 487, 28, 5).fill(colors.burgundy);
  doc.font('NotoBold').fontSize(8).fillColor(colors.white);
  doc.text('ÜRÜN', 66, top + 9, { width: 230 });
  doc.text('ADET', 311, top + 9, { width: 45, align: 'right' });
  doc.text('BİRİM FİYAT', 370, top + 9, { width: 75, align: 'right' });
  doc.text('TUTAR', 459, top + 9, { width: 70, align: 'right' });
  return top + 35;
}

function ensureRowSpace(doc, height, invoice) {
  if (doc.y + height <= doc.page.height - 95) return;
  doc.addPage();
  doc.font('NotoBold').fontSize(12).fillColor(colors.burgundy)
    .text(`Fatura ${invoice.invoiceNumber} - devam`, 54, 48);
  doc.y = drawTableHeader(doc, 82);
}

function drawItems(doc, invoice) {
  doc.y = drawTableHeader(doc, doc.y);
  for (const item of invoice.items) {
    doc.font('NotoRegular').fontSize(9);
    const textHeight = doc.heightOfString(item.name, { width: 230 });
    const rowHeight = Math.max(29, textHeight + 14);
    ensureRowSpace(doc, rowHeight, invoice);
    const top = doc.y;
    doc.fillColor(colors.ink).text(item.name, 66, top + 7, { width: 230 });
    doc.text(String(item.quantity), 311, top + 7, { width: 45, align: 'right' });
    doc.text(`${item.unitPrice} ${invoice.currency}`, 370, top + 7, { width: 75, align: 'right' });
    doc.font('NotoBold').text(`${item.lineTotal} ${invoice.currency}`, 459, top + 7, { width: 70, align: 'right' });
    doc.moveTo(54, top + rowHeight).lineTo(541, top + rowHeight)
      .lineWidth(0.5).strokeColor(colors.border).stroke();
    doc.y = top + rowHeight;
  }
}

function drawTotal(doc, invoice) {
  ensureRowSpace(doc, 82, invoice);
  const top = doc.y + 18;
  doc.roundedRect(335, top, 206, 50, 8).fill(colors.rose);
  doc.font('NotoBold').fontSize(10).fillColor(colors.burgundy).text('GENEL TOPLAM', 350, top + 10);
  doc.font('NotoBold').fontSize(15).fillColor(colors.ink)
    .text(`${invoice.total} ${invoice.currency}`, 350, top + 25, { width: 174, align: 'right' });
  doc.font('NotoRegular').fontSize(8).fillColor(colors.muted)
    .text('Bu fatura satın alma anındaki kayıtlı bilgilerden oluşturulmuştur.', 54, top + 20, { width: 245 });
}

function drawPageNumbers(doc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.font('NotoRegular').fontSize(8).fillColor(colors.muted)
      .text(`Sulina  |  Sayfa ${index + 1} / ${range.count}`, 54, doc.page.height - 74,
        { width: 487, align: 'center', lineBreak: false });
  }
}

// Accept only the normalized DTO so PDF and screen values cannot diverge.
export async function renderInvoicePdf(invoice) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 48, right: 54, bottom: 62, left: 54 },
    bufferPages: true,
    info: { Title: `Sulina Fatura ${invoice.invoiceNumber}`, Author: 'Sulina' },
  });
  const completed = collectPdf(doc);
  doc.registerFont('NotoRegular', regularFont);
  doc.registerFont('NotoBold', boldFont);
  drawPageHeading(doc, invoice);
  drawCustomer(doc, invoice.customer);
  drawItems(doc, invoice);
  drawTotal(doc, invoice);
  drawPageNumbers(doc);
  doc.end();
  return completed;
}

export async function createInvoiceDocuments(order) {
  const screen = createInvoiceData(order);
  return { screen, pdf: await renderInvoicePdf(screen) };
}

export async function loadInvoiceDocuments(db, identity) {
  const screen = await loadInvoiceData(db, identity);
  return { screen, pdf: await renderInvoicePdf(screen) };
}
