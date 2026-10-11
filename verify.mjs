// Usage: node verify.mjs <chain.json>
// Prints OK or FAIL for every card and exits with code 1 if any card fails.
import { readFileSync } from "node:fs";
import { verifyChain } from "./ledger.js";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node verify.mjs <chain.json>");
  process.exit(2);
}
const data = JSON.parse(readFileSync(file, "utf8"));
const cards = Array.isArray(data) ? data : data.cards;
const { ok, results } = await verifyChain(cards);
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"} card ${r.index + 1}  #${r.hash.slice(0, 8)}${r.reason ? "  " + r.reason : ""}`);
}
console.log(ok ? "\nChain intact." : "\nChain BROKEN.");
process.exit(ok ? 0 : 1);
