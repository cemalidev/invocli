import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { customersFilePath, ensureSetup } from './config.js';

/**
 * Loads customers from the centralized customers.json file.
 * It ensures the setup is correct before reading.
 * @returns {Promise<Array>}
 */
async function loadCustomers() {
  ensureSetup(); // Make sure directory and file exist
  const data = await fs.readFile(customersFilePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Saves customers to the centralized customers.json file.
 * It ensures the setup is correct before writing.
 * @param {Array} customers
 * @returns {Promise<void>}
 */
async function saveCustomers(customers) {
  ensureSetup(); // Make sure directory and file exist
  await fs.writeFile(customersFilePath, JSON.stringify(customers, null, 2));
}

/**
 * Get all customers
 * @returns {Promise<Array>}
 */
export async function getCustomers() {
  return await loadCustomers();
}

/**
 * Adds a new customer with unique ID.
 * @param {Object} customerData
 * @returns {Promise<string>} - Returns the generated ID
 */
export async function addCustomer(customerData) {
  const customers = await loadCustomers();
  const id = randomUUID();
  const customerWithId = { id, ...customerData };
  
  customers.push(customerWithId);
  await saveCustomers(customers);
  return id;
}

/**
 * Updates an existing customer by ID.
 * @param {string} customerId - The ID of the customer to update.
 * @param {Object} updatedData - An object with the fields to update.
 * @returns {Promise<void>}
 */
export async function updateCustomer(customerId, updatedData) {
  const customers = await loadCustomers();
  const customerIndex = customers.findIndex(c => c.id === customerId);

  if (customerIndex === -1) {
    throw new Error(`Customer with ID "${customerId}" not found.`);
  }

  customers[customerIndex] = { ...customers[customerIndex], ...updatedData };
  await saveCustomers(customers);
}

/**
 * Removes a customer by ID.
 * @param {string} customerId - The ID of the customer to remove.
 * @returns {Promise<void>}
 */
export async function removeCustomer(customerId) {
  let customers = await loadCustomers();
  const initialLength = customers.length;
  customers = customers.filter(c => c.id !== customerId);

  if (customers.length === initialLength) {
    throw new Error(`Customer with ID "${customerId}" not found.`);
  }

  await saveCustomers(customers);
}
