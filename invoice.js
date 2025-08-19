import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import dayjs from 'dayjs';
import { formatCurrency } from './currencies.js';

const currencySymbols = {
  USD: '$',
  EUR: '€',
  TRY: '₺',
};

function getHTML(data) {
  const { 
    from, to, fromAddress, toAddress, fromEmail, fromPhone, fromTaxId, 
    toEmail, toPhone, toTaxId, 
    items, tax, discount, note, 
    invoiceNumber, date, currency, logoBase64
  } = data;
  const taxType = data['tax-type'] || 'exclusive'; // Default to exclusive for backward compatibility

  let subtotal, taxAmount, discountAmount, total, netSubtotal;
  const grossSubtotal = items.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  
  if (taxType === 'inclusive') {
    // Prices include tax. We need to extract the tax amount.
    discountAmount = grossSubtotal * discount;
    const discountedTotal = grossSubtotal - discountAmount;
    subtotal = discountedTotal / (1 + tax);
    taxAmount = discountedTotal - subtotal;
    total = discountedTotal;
    netSubtotal = subtotal; // For display, net subtotal is the pre-tax amount
  } else { // 'exclusive'
    // Prices do not include tax. We add tax on top.
    subtotal = grossSubtotal;
    discountAmount = subtotal * discount;
    netSubtotal = subtotal - discountAmount;
    taxAmount = netSubtotal * tax;
    total = netSubtotal + taxAmount;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        body { font-family: 'Inter', sans-serif; }
        .details-grid { display: grid; grid-template-columns: max-content 1fr; gap: 0 1rem; }
      </style>
    </head>
    <body class="bg-white">
      <div class="p-12 font-sans text-gray-800">
        <div class="flex justify-between items-start mb-12">
          <div>
            <h1 class="text-4xl font-bold text-gray-900 mb-2">INVOICE</h1>
            <div class="text-gray-600">
              <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
              <p><strong>Date:</strong> ${date}</p>
            </div>
          </div>
          <div class="text-right">
            ${logoBase64 ? `<img src="${logoBase64}" alt="logo" class="ml-auto mb-4" style="max-width: 160px; max-height: 80px; object-fit: contain;">` : ''}
            <p class="font-bold text-lg">${from}</p>
            ${fromAddress ? `<p class="text-gray-600">${fromAddress}</p>` : ''}
            ${fromEmail ? `<p class="text-gray-600">${fromEmail}</p>` : ''}
            ${fromPhone ? `<p class="text-gray-600">${fromPhone}</p>` : ''}
            ${fromTaxId ? `<p class="text-gray-600 text-sm mt-1">Tax ID: ${fromTaxId}</p>` : ''}
          </div>
        </div>

        <div class="mb-12">
          <h2 class="text-sm font-bold text-gray-500 mb-2">Bill To</h2>
          <p class="text-lg font-bold">${to}</p>
          ${toAddress ? `<p class="text-gray-700">${toAddress}</p>` : ''}
          ${toEmail ? `<p class="text-gray-700">${toEmail}</p>` : ''}
          ${toPhone ? `<p class="text-gray-700">${toPhone}</p>` : ''}
          ${toTaxId ? `<p class="text-gray-700 text-sm mt-1">Tax ID: ${toTaxId}</p>` : ''}
        </div>

        <table class="w-full mb-12">
          <thead class="border-b-2 border-gray-300">
            <tr>
              <th class="text-left py-2">Item</th>
              <th class="text-center py-2">Qty</th>
              <th class="text-right py-2">Rate</th>
              <th class="text-right py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(item => `
            <tr>
              <td class="py-4">${item.item}</td>
              <td class="text-center py-4">${item.quantity}</td>
              <td class="text-right py-4">${formatCurrency(item.rate, currency)}</td>
              <td class="text-right py-4">${formatCurrency(item.quantity * item.rate, currency)}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="flex justify-between">
          <div class="w-1/2">
            <h3 class="text-sm font-bold text-gray-500 mb-2">Notes</h3>
            <p class="text-gray-700">${note || 'N/A'}</p>
          </div>
          <div class="w-1/2 text-right">
            <div class="flex justify-between mb-2">
              <span class="text-gray-500">Subtotal</span>
              <span>${formatCurrency(subtotal, currency)}</span>
            </div>
            ${discount > 0 ? `
            <div class="flex justify-between mb-2">
              <span class="text-gray-500">Discount (${(discount * 100).toFixed(0)}%)</span>
              <span>-${formatCurrency(discountAmount, currency)}</span>
            </div>
            ` : ''}
            <div class="flex justify-between mb-2 pt-2 border-t">
              <span class="text-gray-500">Net Subtotal</span>
              <span>${formatCurrency(netSubtotal, currency)}</span>
            </div>
            <div class="flex justify-between mb-2">
              <span class="text-gray-500">Tax (${(tax * 100).toFixed(0)}%)</span>
              <span>${formatCurrency(taxAmount, currency)}</span>
            </div>
            <div class="flex justify-between font-bold text-xl mt-4 pt-4 border-t-2 border-gray-300">
              <span>Total</span>
              <span>${formatCurrency(total, currency)}</span>
            </div>
          </div>
        </div>

        <div class="text-center text-gray-400 text-xs mt-16">
          <p>Thank you for your business!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function createInvoice(data) {
  let logoBase64 = null;
  if (data.logo) {
    try {
      let imageFile;
      let imageType;

      if (data.logo.startsWith('http')) {
        const response = await fetch(data.logo);
        if (!response.ok) throw new Error(`status code ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        imageFile = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type');
        imageType = contentType.split('/')[1];
      } else {
        const logoPath = path.resolve(data.logo);
        imageFile = fs.readFileSync(logoPath);
        imageType = path.extname(data.logo).slice(1);
      }
      logoBase64 = `data:image/${imageType};base64,${imageFile.toString('base64')}`;
    } catch (error) {
      console.warn(`Warning: Could not load logo from ${data.logo}. Error: ${error.message}`);
    }
  }

  const invoiceNumber = data.invoiceNumber || Date.now();
  const invoiceDate = data.date ? dayjs(data.date) : dayjs();
  const displayDate = invoiceDate.format('DD.MM.YYYY');
  const fileDate = invoiceDate.format('YYYY-MM-DD');

  // Sanitize company name for folder and file name
  const companyName = data.from
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/[^a-zA-Z0-9]/g, '') // Remove non-alphanumeric characters
    .toUpperCase();
  const outputDir = path.join(process.cwd(), 'invoices', companyName);

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFilename = `${invoiceNumber}-${companyName}-${fileDate}.pdf`;
  const outputPath = path.join(outputDir, outputFilename);

  const htmlContent = getHTML({ ...data, invoiceNumber, date: displayDate, logoBase64 });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  await page.pdf({ path: outputPath, format: 'A4', printBackground: true });

  await browser.close();
  return outputPath;
}
