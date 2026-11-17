const MANUAL_HEADER = `ACME INDUSTRIAL PRODUCT MANUAL
Document ID: ACME-MAN-2026-11-17-STABLE
Revision: R1 (frozen text; do not insert timestamps or request-specific fields here)
Audience: field technicians and support agents
Language: English
`;

const SKU_TEMPLATE = `
SKU {sku}: {name}
- Rated power: {power} W continuous, {peak} W peak (10 s)
- Operating voltage: {volt} V DC ±5%
- Ingress protection: IP{ip}
- Warranty: {warranty} months from invoice date
- Spare kit: {spare}
- Safety: disconnect mains, wait 60 seconds, then open the service panel.
- Maintenance: inspect filters every 250 hours; replace if Delta-P exceeds 120 Pa.
- Installation: leave 80 mm clearance on all ventilated faces; torque terminals to 1.2 N·m.
- Troubleshooting: if the status LED blinks amber twice, check the intake sensor harness.
`;

const NAMES = [
  "Inline blower",
  "Heat exchanger",
  "Control module",
  "Pressure sensor",
  "Filter cartridge",
  "Drive inverter",
  "Coolant pump",
  "Relay board",
];

/** Conservative English estimate used only to size the stable prefix before a live call. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function skuBlock(index: number): string {
  const sku = `SKU-${String(1000 + index).padStart(4, "0")}`;
  const name = NAMES[index % NAMES.length];
  return SKU_TEMPLATE.replace("{sku}", sku)
    .replace("{name}", `${name} ${sku}`)
    .replace("{power}", String(80 + (index % 17) * 15))
    .replace("{peak}", String(120 + (index % 17) * 20))
    .replace("{volt}", String(12 + (index % 4) * 12))
    .replace("{ip}", index % 2 === 0 ? "54" : "65")
    .replace("{warranty}", String(12 + (index % 3) * 12))
    .replace("{spare}", `${sku}-KIT`);
}

/**
 * Build a stable, timestamp-free product-manual prefix long enough to exceed
 * the target model's minimum cacheable length. The text is deterministic for
 * a given `targetTokens` so two eval runs send the same prefix.
 */
export function buildStablePrefix(targetTokens: number): string {
  const chunks: string[] = [MANUAL_HEADER];
  let index = 0;
  while (estimateTokens(chunks.join("")) < targetTokens) {
    chunks.push(skuBlock(index));
    index += 1;
    if (index > 20_000) {
      throw new Error("Failed to build a stable prefix of the requested length.");
    }
  }
  chunks.push(
    "\nEND OF STABLE PREFIX. All request-specific questions must appear after this line.\n",
  );
  return chunks.join("");
}

export const H1_QUESTION_A =
  "In the product manual, what is the rated continuous power of SKU-1000? Reply with only the number and the unit.";
export const H1_QUESTION_B =
  "In the product manual, what is the warranty period of SKU-1001? Reply with only the duration.";

export function changingQuestion(base: string, stamp: string): string {
  return `${base} (request marker: ${stamp})`;
}
