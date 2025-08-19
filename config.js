import os from 'os';
import path from 'path';
import fs from 'fs';

// Define the application's data directory in the user's home directory
const dataDir = path.join(os.homedir(), '.invocli');

// Define paths for the data files
export const companyFilePath = path.join(dataDir, 'company.json');
export const customersFilePath = path.join(dataDir, 'customers.json');

/**
 * Ensures that the data directory and necessary JSON files exist.
 * If they don't exist, it creates them.
 */
export const ensureSetup = () => {
  // Check if the data directory exists, if not, create it
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Check if company.json exists, if not, create it with an empty array
  if (!fs.existsSync(companyFilePath)) {
    fs.writeFileSync(companyFilePath, JSON.stringify([], null, 2));
  }

  // Check if customers.json exists, if not, create it with an empty array
  if (!fs.existsSync(customersFilePath)) {
    fs.writeFileSync(customersFilePath, JSON.stringify([], null, 2));
  }
};
