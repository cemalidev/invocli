import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { companyFilePath, ensureSetup } from './config.js';

/**
 * Loads companies from the centralized company.json file.
 * It ensures the setup is correct before reading.
 * @returns {Promise<Array>}
 */
async function loadCompanies() {
  ensureSetup(); // Make sure directory and file exist
  const data = await fs.readFile(companyFilePath, 'utf-8');
  return JSON.parse(data);
}

/**
 * Saves companies to the centralized company.json file.
 * It ensures the setup is correct before writing.
 * @param {Array} companies
 * @returns {Promise<void>}
 */
async function saveCompanies(companies) {
  ensureSetup(); // Make sure directory and file exist
  await fs.writeFile(companyFilePath, JSON.stringify(companies, null, 2));
}

/**
 * Get all companies
 * @returns {Promise<Array>}
 */
export async function getCompanies() {
  return await loadCompanies();
}

/**
 * Adds a new company with unique ID.
 * @param {Object} companyData
 * @returns {Promise<string>} - Returns the generated ID
 */
export async function addCompany(companyData) {
  const companies = await loadCompanies();
  const id = randomUUID();
  const companyWithId = { id, ...companyData };
  
  companies.push(companyWithId);
  await saveCompanies(companies);
  return id;
}

/**
 * Updates an existing company by ID.
 * @param {string} companyId - The ID of the company to update.
 * @param {Object} updatedData - An object with the fields to update.
 * @returns {Promise<void>}
 */
export async function updateCompany(companyId, updatedData) {
  const companies = await loadCompanies();
  const companyIndex = companies.findIndex(c => c.id === companyId);

  if (companyIndex === -1) {
    throw new Error(`Company with ID "${companyId}" not found.`);
  }

  companies[companyIndex] = { ...companies[companyIndex], ...updatedData };
  await saveCompanies(companies);
}

/**
 * Removes a company by ID.
 * @param {string} companyId - The ID of the company to remove.
 * @returns {Promise<void>}
 */
export async function removeCompany(companyId) {
  let companies = await loadCompanies();
  const initialLength = companies.length;
  companies = companies.filter(c => c.id !== companyId);

  if (companies.length === initialLength) {
    throw new Error(`Company with ID "${companyId}" not found.`);
  }

  await saveCompanies(companies);
}
