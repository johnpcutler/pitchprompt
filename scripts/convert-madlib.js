#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MADLIB_SOURCE = path.join(ROOT, "data", "madlib.md");
const PROMPTS_SOURCE = path.join(ROOT, "data", "prompts.json");
const OUTPUT_FILE = path.join(ROOT, "data", "madlib.compiled.json");
const SLOT_REGEX = /\[([a-zA-Z0-9_-]+)\]/g;

async function readPrompts() {
  try {
    const raw = await fs.readFile(PROMPTS_SOURCE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("prompts.json must be a JSON object keyed by slot ID.");
    }
    return parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function compileMadlib(sourceText) {
  const segments = [];
  const slotOrder = [];
  const seen = new Set();
  const occurrences = new Map();

  let lastIndex = 0;
  let match;

  while ((match = SLOT_REGEX.exec(sourceText)) !== null) {
    const id = match[1];
    const start = match.index;

    if (start > lastIndex) {
      segments.push({ type: "text", value: sourceText.slice(lastIndex, start) });
    }

    segments.push({ type: "slot", id });

    if (!seen.has(id)) {
      seen.add(id);
      slotOrder.push(id);
    }

    occurrences.set(id, (occurrences.get(id) || 0) + 1);
    lastIndex = SLOT_REGEX.lastIndex;
  }

  if (lastIndex < sourceText.length || sourceText.length === 0) {
    segments.push({ type: "text", value: sourceText.slice(lastIndex) });
  }

  return { segments, slotOrder, occurrences };
}

function validate(compiled, prompts) {
  const warnings = [];
  const promptKeys = new Set(Object.keys(prompts));

  compiled.slotOrder.forEach((id) => {
    if (!promptKeys.has(id)) {
      warnings.push(`Missing prompt metadata for slot ID "${id}".`);
    }
  });

  promptKeys.forEach((id) => {
    if (!compiled.slotOrder.includes(id)) {
      warnings.push(`Prompt metadata ID "${id}" is not used in madlib text.`);
    }
  });

  for (const [id, count] of compiled.occurrences.entries()) {
    if (count > 1) {
      warnings.push(`Slot ID "${id}" appears ${count} times in the text (reused).`);
    }
  }

  return warnings;
}

async function run() {
  const [sourceText, prompts] = await Promise.all([
    fs.readFile(MADLIB_SOURCE, "utf8"),
    readPrompts(),
  ]);

  const compiled = compileMadlib(sourceText);
  const warnings = validate(compiled, prompts);
  const outputPayload = {
    sourceFile: "data/madlib.md",
    generatedAt: new Date().toISOString(),
    slotOrder: compiled.slotOrder,
    segments: compiled.segments,
  };

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(outputPayload, null, 2)}\n`, "utf8");

  if (warnings.length) {
    console.warn("Madlib conversion completed with warnings:");
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  } else {
    console.log("Madlib conversion completed with no warnings.");
  }
  console.log(`Wrote: ${path.relative(ROOT, OUTPUT_FILE)}`);
}

run().catch((error) => {
  console.error("Madlib conversion failed.");
  console.error(error.message);
  process.exit(1);
});
