// Regenerates the two example chains. All sources are fictional demo text.
import { writeFileSync } from "node:fs";
import { sealCard } from "./ledger.js";

const DAY = "2026-10-11";
const s1 = "Example Climate Briefing (fictional). Midday cooling demand in the region has grown steadily over the past decade. Analysts found that air conditioning accounts for a majority of peak summer electricity use. Shading and better insulation can reduce cooling demand, but adoption has been slow.";
const s2 = "Demo Policy Note (fictional). A pilot programme retrofitted twelve school buildings with reflective roofing. Measured cooling energy fell by 18 percent in the first summer. The report cautions that results may vary between buildings.";

const a = await sealCard({ claim: "Cooling drives peak summer power demand.", quote: "air conditioning accounts for a majority of peak summer electricity use", author: "Example Author", title: "Example Climate Briefing (fictional)", url: "https://example.org/briefing", published: "2026-01-15", sourceText: s1 }, null, DAY);
const b = await sealCard({ claim: "Reflective roofing cut cooling energy in a pilot.", quote: "Measured cooling energy fell by 18 percent in the first summer.", author: "Example Author", title: "Demo Policy Note (fictional)", url: "https://example.org/pilot", published: "2026-03-02", sourceText: s2 }, a, DAY);
const c = await sealCard({ claim: "The pilot result may not generalise.", quote: "results may vary between buildings", author: "Example Author", title: "Demo Policy Note (fictional)", url: "https://example.org/pilot", published: "2026-03-02", sourceText: s2 }, b, DAY);

const write = (file, cards) => writeFileSync(file, JSON.stringify({ format: "evidence-chain/1", cards }, null, 2) + "\n");
write("examples/example-chain.json", [a, b, c]);
// Tampered copy: one number is quietly changed after sealing.
write("examples/tampered-chain.json", [a, { ...b, quote: b.quote.replace("18 percent", "48 percent") }, c]);
console.log("Wrote examples/example-chain.json and examples/tampered-chain.json");
