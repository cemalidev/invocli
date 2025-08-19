#!/usr/bin/env node

import { Command } from 'commander';
import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { createInvoice } from './invoice.js';
import { getPopularCurrencies, isCurrencySupported, formatCurrency } from './currencies.js';
import { getCustomers, addCustomer, updateCustomer, removeCustomer } from './customers.js';
import { getCompanies, addCompany, updateCompany, removeCompany } from './company.js';
import { ensureSetup } from './config.js';
import inquirer from 'inquirer';
import dayjs from 'dayjs';

const program = new Command();

// ASCII Logo
const logo = `
██╗███╗   ██╗██╗   ██╗ ██████╗    ██████╗██╗     ██╗
██║████╗  ██║██║   ██║██╔═══██╗  ██╔════╝██║     ██║
██║██╔██╗ ██║██║   ██║██║   ██║  ██║     ██║     ██║
██║██║╚██╗██║╚██╗ ██╔╝██║   ██║  ██║     ██║     ██║
██║██║ ╚████║ ╚████╔╝ ╚██████╔╝  ╚██████╗███████╗██║
╚═╝╚═╝  ╚═══╝  ╚═══╝   ╚═════╝    ╚═════╝╚══════╝╚═╝
                                                   
    A Node.js CLI for generating PDF invoices
`;

console.log(logo);

program
  .name('invocli')
  .description('A Node.js CLI for generating PDF invoices.')
  .version('1.0.0');

program.command('generate')
  .description('Generate a new PDF invoice.')
  .option('--from <value>', 'Sender name or company')
  .option('--to <value>', 'Recipient name or company')
  .option('--logo <path>', 'Path or URL to a logo image file')
  .option('--from-address <value>', 'Sender\'s address')
  .option('--from-email <value>', 'Sender\'s email')
  .option('--from-phone <value>', 'Sender\'s phone number')
  .option('--to-address <value>', 'Recipient\'s address')
  .option('--to-email <value>', 'Recipient\'s email')
  .option('--to-phone <value>', 'Recipient\'s phone number')
  .option('--from-tax-id <value>', 'Sender\'s Tax ID or TC Kimlik No')
  .option('--to-tax-id <value>', 'Recipient\'s Tax ID or TC Kimlik No')
  .option('--item <value>', 'Invoice item description')
    .option('--quantity <number>', 'Item quantity', parseFloat)
    .option('--rate <number>', 'Item rate/price', parseFloat)
  .option('--tax <number>', 'Tax rate (e.g., 20 or 0.20 for 20%)', parseFloat, 0)
  .option('--discount <number>', 'Discount rate (e.g., 10 or 0.10 for 10%)', parseFloat, 0)
  .option('--currency <iso_code>', 'Currency ISO code (e.g., TRY, USD, EUR)', 'USD')
  .option('--invoice-number <value>', 'Custom invoice number (optional)')
  .option('--note <value>', 'A note for the invoice', '')
  .addHelpText('after', `

Example call:
  $ node index.js generate \
    --from "Your Company, Inc." \
    --to "Your Customer, Inc." \
    --logo "/path/to/your/logo.png" \
    --from-address "123 Your Street, Your City, ST 12345" \
    --to-address "456 Customer Ave, Their City, ST 54321" \
    --from-email "contact@yourcompany.com" \
    --to-email "billing@yourcustomer.com" \
    --from-phone "+1 (555) 123-4567" \
    --to-phone "+1 (555) 987-6543" \
    --from-tax-id "YOUR-TAX-ID" \
    --to-tax-id "CUSTOMER-TAX-ID" \
    --item "Example Product or Service" \
    --quantity 2 \
    --rate 150 \
    --tax 8 \
    --discount 5 \
    --currency "USD" \
    --invoice-number "INV-001" \
    --note "Thank you for your business." \

Notes on Options:
  --tax: For a tax rate of 20%, you can enter either '20' or '0.20'.
  --discount: For a discount of 10%, you can enter '10' or '0.10'.
  --logo: Can be a local file path or a direct URL to an image.
  --currency: Use 3-letter ISO currency codes (e.g., TRY, USD, EUR).
`)
  .action(async (options) => {
    try {
      console.log('Generating invoice...');
      if (options.tax >= 1) {
        options.tax = options.tax / 100;
      }
      if (options.discount >= 1) {
        options.discount = options.discount / 100;
      }

      const { item, quantity, rate, ...restOptions } = options;
      const items = (item && quantity && rate) ? [{ item, quantity, rate }] : [];

      if (items.length === 0 && !options.items) {
          throw new Error('Please provide item details via command line or use the generate-from-file command.');
      }

      const invoiceData = { ...restOptions, items: options.items || items };

      const outputPath = await createInvoice(invoiceData);
      const fileUrl = `file://${path.resolve(outputPath)}`;
            console.log(`Invoice generated successfully at \u001b]8;;${fileUrl}\u0007${outputPath}\u001b]8;;\u0007 (Cmd+Click or Ctrl+Click to open)`);
    } catch (error) {
      console.error('Error generating invoice:', error.message);
      process.exit(1);
    }
  });

program.command('generate-from-file')
  .description('Generate a PDF invoice from a JSON data file.')
  .argument('<path>', 'Path to the JSON data file')
  .action(async (filePath) => {
    try {
      ensureSetup();
      const absolutePath = path.resolve(process.cwd(), filePath);
      const fileContent = await fs.readFile(absolutePath, 'utf8');
      const rawData = JSON.parse(fileContent);

      // Map kebab-case from file to camelCase for the invoice creator
      const options = {
        from: rawData.from,
        to: rawData.to,
        logo: rawData.logo,
        currency: rawData.currency,
        items: rawData.items,
        tax: rawData.tax,
        discount: rawData.discount,
        note: rawData.note,
        fromAddress: rawData['from-address'],
        fromEmail: rawData['from-email'],
        fromPhone: rawData['from-phone'],
        fromTaxId: rawData['from-tax-id'],
        toAddress: rawData['to-address'],
        toEmail: rawData['to-email'],
        toPhone: rawData['to-phone'],
        toTaxId: rawData['to-tax-id'],
        invoiceNumber: rawData['invoice-number'],
      };

      if (options.tax >= 1) {
        options.tax = options.tax / 100;
      }
      if (options.discount >= 1) {
        options.discount = options.discount / 100;
      }

      const outputPath = await createInvoice(options);
      const fileUrl = `file://${path.resolve(outputPath)}`;
            console.log(`Invoice generated successfully at \u001b]8;;${fileUrl}\u0007${outputPath}\u001b]8;;\u0007 (Cmd+Click or Ctrl+Click to open)`);
    } catch (error) {
      console.error('Error generating invoice from file:', error.message);
      process.exit(1);
    }
  });

program.command('init')
  .description('Create an invoice data file interactively.')
  .option('-o, --output <path>', 'Output file path for the JSON data', 'invoice-data.json')
  .action(async (cmdOptions) => {
    ensureSetup(); // Ensure data directory and files are ready
    let restart = true;
    while(restart) {
      restart = false; // Default to not restarting unless the user chooses to
      try {
      let senderData = {};
      let recipientData = {};
      
      // Handle company/sender selection
      const companies = await getCompanies();
      if (companies.length > 0) {
        const { companyChoice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'companyChoice',
            message: 'Select your company:',
            choices: [
              ...companies.map(c => ({ name: c.from, value: c })),
              new inquirer.Separator(),
              { name: 'Create a new company', value: 'new' },
            ],
          },
        ]);

        if (companyChoice !== 'new') {
          senderData = companyChoice;
        }
      }

      // If no companies exist or user chose to create a new one
      if (Object.keys(senderData).length === 0) {
        const companyPrompts = [
          { type: 'input', name: 'from', message: 'Company name:' },
          { type: 'input', name: 'from-address', message: 'Company address:' },
          { type: 'input', name: 'from-email', message: 'Company email:' },
          { type: 'input', name: 'from-phone', message: 'Company phone number:' },
          { type: 'input', name: 'from-tax-id', message: 'Company Tax ID:' },
          { type: 'input', name: 'logo', message: 'Path or URL to a logo image (optional):' },
          {
            type: 'list',
            name: 'invoice-type',
            message: 'Invoice numbering type:',
            choices: [
              { name: '1 - Random unique (auto-generated)', value: 'random' },
              { name: '2 - Prefix (e.g., AIBSTCH-XX)', value: 'prefix' }
            ]
          }
        ];

        const newCompanyData = await inquirer.prompt(companyPrompts);

        if (newCompanyData['invoice-type'] === 'prefix') {
          const prefixData = await inquirer.prompt([
            {
              type: 'input',
              name: 'invoice-prefix',
              message: 'Invoice prefix (e.g., COMP, PROJ):',
              validate: (input) => {
                if (!input || input.trim().length === 0) {
                  return 'Please enter a valid prefix.';
                }
                return true;
              },
              filter: (input) => {
                const trimmed = input.trim();
                return trimmed.endsWith('-') ? trimmed : trimmed + '-';
              }
            }
          ]);
          Object.assign(newCompanyData, prefixData);
        }

        const { saveCompany } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'saveCompany',
            message: 'Save this new company for future use?',
            default: true,
          },
        ]);

        if (saveCompany) {
          await addCompany(newCompanyData);
          console.log(`Company "${newCompanyData.from}" saved.`);
        }
        senderData = newCompanyData;
      }

      // Handle customer/recipient selection
      const customers = await getCustomers();
      if (customers.length > 0) {
        const { customerChoice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'customerChoice',
            message: 'Select a recipient:',
            choices: [
              ...customers.map(c => ({ name: c.to, value: c })),
              new inquirer.Separator(),
              { name: 'Create a new customer', value: 'new' },
            ],
          },
        ]);

        if (customerChoice !== 'new') {
          recipientData = customerChoice;
        }
      }

      // If no customers exist or user chose to create a new one
      if (Object.keys(recipientData).length === 0) {
        const newCustomerData = await inquirer.prompt([
          { type: 'input', name: 'to', message: 'Recipient name or company:' },
          { type: 'input', name: 'to-address', message: 'Recipient\'s address:' },
          { type: 'input', name: 'to-email', message: 'Recipient\'s email:' },
          { type: 'input', name: 'to-phone', message: 'Recipient\'s phone number:' },
          { type: 'input', name: 'to-tax-id', message: 'Recipient\'s Tax ID:' },
        ]);

        const { saveCustomer } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'saveCustomer',
            message: 'Save this new customer for future use?',
            default: true,
          },
        ]);

        if (saveCustomer) {
          await addCustomer(newCustomerData);
          console.log(`Customer \"${newCustomerData.to}\" saved.`);
        }
        recipientData = newCustomerData;
      }

      // Invoice details - handle invoice number generation based on company type
      let invoiceNumber = '';
      if (senderData['invoice-type'] === 'prefix' && senderData['invoice-prefix']) {
        const { invoiceNumberInput } = await inquirer.prompt([
          { 
            type: 'input', 
            name: 'invoiceNumberInput', 
            message: `Invoice number (prefix: ${senderData['invoice-prefix']}):`,
            validate: (input) => {
              return true; // Allow empty input for auto-generation
            }
          },
        ]);
        
        if (invoiceNumberInput.trim()) {
          invoiceNumber = `${senderData['invoice-prefix']}${invoiceNumberInput}`;
        } else {
          // Generate unique number with timestamp
          const timestamp = Date.now().toString().slice(-6);
          invoiceNumber = `${senderData['invoice-prefix']}${timestamp}`;
        }
      } else if (senderData['invoice-type'] === 'random') {
        // Generate random unique invoice number
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        invoiceNumber = `INV-${timestamp.slice(-6)}${random}`;
      }

      const invoiceDetails = await inquirer.prompt([
        {
          type: 'list',
          name: 'dateChoice',
          message: 'Select invoice date:',
          choices: [
            { name: `Today (${dayjs().format('DD.MM.YYYY')})`, value: 'today' },
            { name: `Yesterday (${dayjs().subtract(1, 'day').format('DD.MM.YYYY')})`, value: 'yesterday' },
            { name: 'Enter manually', value: 'manual' },
          ],
        },
        {
          type: 'input',
          name: 'date',
          message: 'Enter date (DD.MM.YYYY):',
          when: (answers) => answers.dateChoice === 'manual',
          validate: (input) => {
            if (!/^\d{2}\.\d{2}\.\d{4}$/.test(input)) {
              return 'Please enter a valid date in DD.MM.YYYY format.';
            }
            return dayjs(input, 'DD.MM.YYYY', true).isValid() ? true : 'The date is not valid (e.g., invalid month or day).';
          },
        },
        { 
          type: 'input', 
          name: 'invoice-number', 
          message: 'Custom invoice number (optional):', 
          default: invoiceNumber,
          when: senderData['invoice-type'] !== 'prefix' && senderData['invoice-type'] !== 'random'
        },
        {
          type: 'list',
          name: 'currency',
          message: 'Currency:',
          choices: [
            { name: 'USD ($) - US Dollar', value: 'USD' },
            { name: 'EUR (€) - Euro', value: 'EUR' },
            { name: 'TRY (₺) - Turkish Lira', value: 'TRY' },
            { name: 'Other (enter custom currency code)', value: 'custom' },
          ],
          default: 'USD',
        },
      ]);

      // Set invoice number if it was generated from prefix
      if (invoiceNumber && !invoiceDetails['invoice-number']) {
        invoiceDetails['invoice-number'] = invoiceNumber;
      }

      // Set logo from company data
      if (senderData.logo && !invoiceDetails.logo) {
        invoiceDetails.logo = senderData.logo;
      }

      if (invoiceDetails.dateChoice === 'today') {
        invoiceDetails.date = dayjs().format('YYYY-MM-DD');
      } else if (invoiceDetails.dateChoice === 'yesterday') {
        invoiceDetails.date = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      } else if (invoiceDetails.dateChoice === 'manual') {
        invoiceDetails.date = dayjs(invoiceDetails.date, 'DD.MM.YYYY').format('YYYY-MM-DD');
      }

      if (invoiceDetails.currency === 'custom') {
        const customCurrencyAnswer = await inquirer.prompt([
          { type: 'input', name: 'customCurrency', message: 'Enter custom currency code:' },
        ]);
        invoiceDetails.currency = customCurrencyAnswer.customCurrency;
      }

      const answers = { ...senderData, ...recipientData, ...invoiceDetails };

      answers.items = [];
      let addMoreItems = true;

      while (addMoreItems) {
        const itemAnswers = await inquirer.prompt([
          { type: 'input', name: 'item', message: 'Item description:' },
          { 
            type: 'input', 
            name: 'quantity', 
            message: 'Item quantity:',
            validate: (input) => {
              // Check if input contains only numbers, decimal point, and optional whitespace
              if (!/^\s*\d+(\.\d+)?\s*$/.test(input)) {
                return 'Please enter a valid number (digits only, no letters or special characters).';
              }
              const num = parseFloat(input);
              if (isNaN(num) || num <= 0) {
                return 'Please enter a valid positive number for quantity.';
              }
              return true;
            },
            filter: (input) => {
              // Only apply filter if validation passed
              if (/^\s*\d+(\.\d+)?\s*$/.test(input)) {
                return parseFloat(input);
              }
              return input; // Return original if invalid
            }
          },
          { 
            type: 'input', 
            name: 'rate', 
            message: 'Item rate/price:',
            validate: (input) => {
              // Check if input contains only numbers, decimal point, and optional whitespace
              if (!/^\s*\d+(\.\d+)?\s*$/.test(input)) {
                return 'Please enter a valid number (digits only, no letters or special characters).';
              }
              const num = parseFloat(input);
              if (isNaN(num) || num <= 0) {
                return 'Please enter a valid positive number for rate/price.';
              }
              return true;
            },
            filter: (input) => {
              // Only apply filter if validation passed
              if (/^\s*\d+(\.\d+)?\s*$/.test(input)) {
                return parseFloat(input);
              }
              return input; // Return original if invalid
            }
          },
          { type: 'confirm', name: 'addMore', message: 'Add another item?', default: false },
        ]);

        const { addMore, ...itemDetails } = itemAnswers;
        if (itemDetails.item && itemDetails.quantity > 0 && itemDetails.rate > 0) {
          answers.items.push(itemDetails);
        }
        addMoreItems = addMore;
      }

      const finalAnswers = await inquirer.prompt([
        {
          type: 'list',
          name: 'tax-type',
          message: 'Tax calculation method:',
          choices: [
            { name: 'Exclusive (Tax is added to the subtotal)', value: 'exclusive' },
            { name: 'Inclusive (Subtotal already includes tax)', value: 'inclusive' },
          ],
          default: 'exclusive',
        },
        { 
          type: 'input', 
          name: 'tax', 
          message: 'Tax rate (%):', 
          default: '0',
          validate: (input) => {
            // Check if input contains only numbers, decimal point, and optional whitespace
            if (!/^\s*\d+(\.\d+)?\s*$/.test(input)) {
              return 'Please enter a valid number (digits only, no letters or special characters).';
            }
            const num = parseFloat(input);
            if (isNaN(num) || num < 0 || num > 100) {
              return 'Please enter a valid tax rate between 0 and 100.';
            }
            return true;
          },
          filter: (input) => {
            // Only apply filter if validation passed
            if (/^\s*\d+(\.\d+)?\s*$/.test(input)) {
              return parseFloat(input);
            }
            return input; // Return original if invalid
          }
        },
        { 
          type: 'input', 
          name: 'discount', 
          message: 'Discount rate (%):', 
          default: '0',
          validate: (input) => {
            // Check if input contains only numbers, decimal point, and optional whitespace
            if (!/^\s*\d+(\.\d+)?\s*$/.test(input)) {
              return 'Please enter a valid number (digits only, no letters or special characters).';
            }
            const num = parseFloat(input);
            if (isNaN(num) || num < 0 || num > 100) {
              return 'Please enter a valid discount rate between 0 and 100.';
            }
            return true;
          },
          filter: (input) => {
            // Only apply filter if validation passed
            if (/^\s*\d+(\.\d+)?\s*$/.test(input)) {
              return parseFloat(input);
            }
            return input; // Return original if invalid
          }
        },
        { type: 'input', name: 'note', message: 'Notes (optional):' },
      ]);

      const finalData = { ...answers, ...finalAnswers };

      // --- Final Confirmation Step ---
      let subtotal, taxAmount, discountAmount, total;
      const grossSubtotal = finalData.items.reduce((acc, item) => acc + item.quantity * item.rate, 0);
      const taxRate = finalData.tax / 100;
      const discountRate = finalData.discount / 100;

      if (finalData['tax-type'] === 'inclusive') {
        // Prices include tax. We need to extract the tax amount.
        discountAmount = grossSubtotal * discountRate;
        const discountedTotal = grossSubtotal - discountAmount;
        subtotal = discountedTotal / (1 + taxRate);
        taxAmount = discountedTotal - subtotal;
        total = discountedTotal;
      } else { // 'exclusive'
        // Prices do not include tax. We add tax on top.
        subtotal = grossSubtotal;
        discountAmount = subtotal * discountRate;
        const netSubtotal = subtotal - discountAmount;
        taxAmount = netSubtotal * taxRate;
        total = netSubtotal + taxAmount;
      }

      console.log('\n\n--- INVOICE SUMMARY ---');
      const summaryData = {
        'Sender': `${finalData.from}`,
        'Recipient': `${finalData.to}`,
        'Invoice Number': finalData['invoice-number'],
        'Date': finalData.date,
        'Subtotal': formatCurrency(subtotal, finalData.currency),
        'Discount': `${finalData.discount}% (${formatCurrency(discountAmount, finalData.currency)})`,
        'Tax': `${finalData.tax}% (${formatCurrency(taxAmount, finalData.currency)})`,
        'Tax Method': finalData['tax-type'] === 'inclusive' ? 'Inclusive' : 'Exclusive',
        'GRAND TOTAL': formatCurrency(total, finalData.currency),
      };
      console.table(summaryData);

      console.log('Items:');
      console.table(finalData.items.map(item => ({
        Description: item.item,
        Quantity: item.quantity,
        Rate: formatCurrency(item.rate, finalData.currency),
        Total: formatCurrency(item.quantity * item.rate, finalData.currency),
      })));

      const { confirmDetails } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmDetails',
          message: 'Are the details above correct?',
          default: true,
        },
      ]);

      if (confirmDetails) {
        const outputPath = path.join(process.cwd(), cmdOptions.output);
        await fs.writeFile(outputPath, JSON.stringify(finalData, null, 2));
        const jsonFileUrl = `file://${path.resolve(outputPath)}`;
                console.log(`\nInvoice data successfully saved to \u001b]8;;${jsonFileUrl}\u0007${outputPath}\u001b]8;;\u0007 (Cmd+Click or Ctrl+Click to open)`);

        const { generateNow } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'generateNow',
            message: 'Would you like to generate the PDF invoice now?',
            default: true,
          },
        ]);

        if (generateNow) {
          console.log('Generating invoice...');
          const options = {
            from: finalData.from,
            to: finalData.to,
            logo: finalData.logo,
            currency: finalData.currency,
            items: finalData.items,
            tax: finalData.tax,
            'tax-type': finalData['tax-type'],
            discount: finalData.discount,
            note: finalData.note,
            fromAddress: finalData['from-address'],
            fromEmail: finalData['from-email'],
            fromPhone: finalData['from-phone'],
            fromTaxId: finalData['from-tax-id'],
            toAddress: finalData['to-address'],
            toEmail: finalData['to-email'],
            toPhone: finalData['to-phone'],
            toTaxId: finalData['to-tax-id'],
            invoiceNumber: finalData['invoice-number'],
            date: finalData.date,
          };

          if (options.tax >= 1) options.tax /= 100;
          if (options.discount >= 1) options.discount /= 100;

          const outputPath = await createInvoice(options);
          const pdfFileUrl = `file://${path.resolve(outputPath)}`;
                    console.log(`Invoice generated successfully at \u001b]8;;${pdfFileUrl}\u0007${outputPath}\u001b]8;;\u0007 (Cmd+Click or Ctrl+Click to open)`);
        } else {
          console.log(`You can generate the PDF later using: invocli generate-from-file ${cmdOptions.output}`);
        }
      } else {
        const { startOver } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'startOver',
            message: 'Would you like to start over?',
            default: false,
          },
        ]);
        if (startOver) {
          restart = true;
          console.log('\nRestarting invoice creation...\n');
        } else {
          console.log('Invoice creation cancelled.');
        }
      }
    } catch (error) {
      if (error.isTtyError) {
        console.error('Interactive prompts could not be rendered in the current environment.');
        restart = false;
      } else {
        console.error('An error occurred:', error.message);
        restart = false; // Exit loop on other errors
      }
      if (!restart) process.exit(1);
    }
   }
  });

const customerCommand = program.command('customer')
  .description('Manage customer data.');

customerCommand.command('add')
  .description('Add a new customer interactively.')
  .action(async () => {
    try {
      ensureSetup();
      const customerData = await inquirer.prompt([
        { type: 'input', name: 'to', message: 'Customer name or company:' },
        { type: 'input', name: 'to-address', message: 'Address:' },
        { type: 'input', name: 'to-email', message: 'Email:' },
        { type: 'input', name: 'to-phone', message: 'Phone number:' },
        { type: 'input', name: 'to-tax-id', message: 'Tax ID:' },
      ]);

      await addCustomer(customerData);
      console.log(`Customer "${customerData.to}" has been added successfully.`);
    } catch (error) {
      console.error('Error adding customer:', error.message);
      process.exit(1);
    }
  });

customerCommand.command('list')
  .description('List all saved customers.')
  .action(async () => {
    try {
      ensureSetup();
      const customers = await getCustomers();
      if (customers.length === 0) {
        console.log('No customers found. Use "invocli customer add" to add one.');
        return;
      }
      console.log('Saved Customers:');
      console.table(customers.map(c => ({ 
        ID: c.id,
        Name: c.to,
        Address: c['to-address'],
        Email: c['to-email'],
        Phone: c['to-phone'],
        'Tax ID': c['to-tax-id']
      })));
    } catch (error) {
      console.error('Error listing customers:', error.message);
      process.exit(1);
    }
  });

customerCommand.command('update')
  .description('Update an existing customer.')
  .action(async () => {
    try {
      ensureSetup();
      const customers = await getCustomers();
      if (customers.length === 0) {
        console.log('No customers to update.');
        return;
      }

      const { customerToUpdate } = await inquirer.prompt([
        {
          type: 'list',
          name: 'customerToUpdate',
          message: 'Which customer do you want to update?',
          choices: customers.map(c => ({ name: `${c.to} (ID: ${c.id.slice(0, 8)}...)`, value: c.id })),
        },
      ]);

      const customerData = customers.find(c => c.id === customerToUpdate);

      const newCustomerData = await inquirer.prompt([
        { type: 'input', name: 'to', message: 'Customer name or company:', default: customerData.to },
        { type: 'input', name: 'to-address', message: 'Address:', default: customerData['to-address'] },
        { type: 'input', name: 'to-email', message: 'Email:', default: customerData['to-email'] },
        { type: 'input', name: 'to-phone', message: 'Phone number:', default: customerData['to-phone'] },
        { type: 'input', name: 'to-tax-id', message: 'Tax ID:', default: customerData['to-tax-id'] },
      ]);

      await updateCustomer(customerToUpdate, newCustomerData);
      console.log(`Customer "${customerData.to}" has been updated successfully.`);
    } catch (error) {
      console.error('Error updating customer:', error.message);
      process.exit(1);
    }
  });

customerCommand.command('remove')
  .description('Remove an existing customer.')
  .action(async () => {
    try {
      ensureSetup();
      const customers = await getCustomers();
      if (customers.length === 0) {
        console.log('No customers to remove.');
        return;
      }

      const { customerToRemove } = await inquirer.prompt([
        {
          type: 'list',
          name: 'customerToRemove',
          message: 'Which customer do you want to remove?',
          choices: customers.map(c => ({ name: `${c.to} (ID: ${c.id.slice(0, 8)}...)`, value: c.id })),
        },
      ]);

      const customerData = customers.find(c => c.id === customerToRemove);

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove "${customerData.to}"? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (confirm) {
        await removeCustomer(customerToRemove);
        console.log(`Customer "${customerData.to}" has been removed successfully.`);
      }
      else {
        console.log('Removal cancelled.');
      }

    } catch (error) {
      console.error('Error removing customer:', error.message);
      process.exit(1);
    }
  });

const companyCommand = program.command('company')
  .description('Manage company data.');

companyCommand.command('add')
  .description('Add a new company interactively.')
  .action(async () => {
    try {
      ensureSetup();
      const basicCompanyData = await inquirer.prompt([
        { type: 'input', name: 'from', message: 'Company name:' },
        { type: 'input', name: 'from-address', message: 'Company address:' },
        { type: 'input', name: 'from-email', message: 'Company email:' },
        { type: 'input', name: 'from-phone', message: 'Company phone number:' },
        { type: 'input', name: 'from-tax-id', message: 'Company Tax ID:' },
        { type: 'input', name: 'logo', message: 'Path or URL to a logo image (optional):' },
        {
          type: 'list',
          name: 'invoice-type',
          message: 'Invoice numbering type:',
          choices: [
            { name: '1 - Random unique (auto-generated)', value: 'random' },
            { name: '2 - Prefix (e.g., AIBSTCH-XX)', value: 'prefix' }
          ]
        }
      ]);

      let companyData = { ...basicCompanyData };

      if (basicCompanyData['invoice-type'] === 'prefix') {
        const prefixData = await inquirer.prompt([
          {
            type: 'input',
            name: 'invoice-prefix',
            message: 'Invoice prefix (e.g., COMP, PROJ):',
            validate: (input) => {
              if (!input || input.trim().length === 0) {
                return 'Please enter a valid prefix.';
              }
              return true;
            },
            filter: (input) => {
              // Always add dash if not present
              const trimmed = input.trim();
              return trimmed.endsWith('-') ? trimmed : trimmed + '-';
            }
          }
        ]);
        companyData = { ...companyData, ...prefixData };
      }

      await addCompany(companyData);
      console.log(`Company "${companyData.from}" has been added successfully.`);
    } catch (error) {
      console.error('Error adding company:', error.message);
      process.exit(1);
    }
  });

companyCommand.command('list')
  .description('List all saved companies.')
  .action(async () => {
    try {
      ensureSetup();
      const companies = await getCompanies();
      if (companies.length === 0) {
        console.log('No companies found. Use "invocli company add" to add one.');
        return;
      }
      console.log('Saved Companies:');
      console.table(companies.map(c => ({ 
        ID: c.id,
        Name: c.from,
        Address: c['from-address'],
        Email: c['from-email'],
        Phone: c['from-phone'],
        'Tax ID': c['from-tax-id'],
        Logo: c.logo || 'N/A',
        'Invoice Type': c['invoice-type'] === 'random' ? 'Random' : 'Prefix',
        'Invoice Prefix': c['invoice-prefix'] || 'N/A'
      })));
    } catch (error) {
      console.error('Error listing companies:', error.message);
      process.exit(1);
    }
  });

companyCommand.command('update')
  .description('Update an existing company.')
  .action(async () => {
    try {
      ensureSetup();
      const companies = await getCompanies();
      if (companies.length === 0) {
        console.log('No companies to update.');
        return;
      }

      const { companyToUpdate } = await inquirer.prompt([
        {
          type: 'list',
          name: 'companyToUpdate',
          message: 'Which company do you want to update?',
          choices: companies.map(c => ({ name: `${c.from} (ID: ${c.id.slice(0, 8)}...)`, value: c.id })),
        },
      ]);

      const companyData = companies.find(c => c.id === companyToUpdate);

      const newCompanyData = await inquirer.prompt([
        { type: 'input', name: 'from', message: 'Company name:', default: companyData.from },
        { type: 'input', name: 'from-address', message: 'Company address:', default: companyData['from-address'] },
        { type: 'input', name: 'from-email', message: 'Company email:', default: companyData['from-email'] },
        { type: 'input', name: 'from-phone', message: 'Company phone number:', default: companyData['from-phone'] },
        { type: 'input', name: 'from-tax-id', message: 'Company Tax ID:', default: companyData['from-tax-id'] },
        { type: 'input', name: 'logo', message: 'Path or URL to a logo image (optional):', default: companyData.logo },
        {
          type: 'list',
          name: 'invoice-type',
          message: 'Invoice numbering type:',
          choices: [
            { name: '1 - Random unique (auto-generated)', value: 'random' },
            { name: '2 - Prefix (e.g., AIBSTCH-XX)', value: 'prefix' }
          ],
          default: companyData['invoice-type'] || 'random'
        },
        { 
          type: 'input', 
          name: 'invoice-prefix', 
          message: 'Invoice number prefix:', 
          default: companyData['invoice-prefix'],
          when: (answers) => answers['invoice-type'] === 'prefix'
        },
      ]);

      await updateCompany(companyToUpdate, newCompanyData);
      console.log(`Company "${companyData.from}" has been updated successfully.`);
    } catch (error) {
      console.error('Error updating company:', error.message);
      process.exit(1);
    }
  });

companyCommand.command('remove')
  .description('Remove an existing company.')
  .action(async () => {
    try {
      ensureSetup();
      const companies = await getCompanies();
      if (companies.length === 0) {
        console.log('No companies to remove.');
        return;
      }

      const { companyToRemove } = await inquirer.prompt([
        {
          type: 'list',
          name: 'companyToRemove',
          message: 'Which company do you want to remove?',
          choices: companies.map(c => ({ name: `${c.from} (ID: ${c.id.slice(0, 8)}...)`, value: c.id })),
        },
      ]);

      const companyData = companies.find(c => c.id === companyToRemove);

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove "${companyData.from}"? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (confirm) {
        await removeCompany(companyToRemove);
        console.log(`Company "${companyData.from}" has been removed successfully.`);
      }
      else {
        console.log('Removal cancelled.');
      }

    } catch (error) {
      console.error('Error removing company:', error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
