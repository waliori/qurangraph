#!/usr/bin/env node
/* Mint an API key line for API_KEYS.  npm run api:key -- research-partner */
import { generateKey } from "./auth.js";

const label = (process.argv[2] || "client").replace(/[^\w.-]/g, "-");
const entry = generateKey(label);
console.log(entry);
console.log("");
console.log("Add it to the API's environment (comma-separate several):");
console.log(`  API_KEYS=${entry}`);
console.log("");
console.log("The caller then sends the part AFTER the label:");
console.log(`  curl -H "X-API-Key: ${entry.split(":").slice(1).join(":")}" https://ayat.network/api/v1/`);
