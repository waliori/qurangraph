/* ═══ Argument validation ═══
 *
 * A tool's `inputSchema` is a promise to the model; this is the enforcement. It covers the
 * exact JSON Schema subset the tool table uses — object / string / integer / number /
 * boolean / array-of-string, plus enum, minimum, maximum, minItems, maxItems and default —
 * and refuses everything else rather than silently accepting it.
 *
 * Two deliberate strictnesses, both about accuracy rather than security:
 *
 *   · Unknown arguments are REJECTED, with the accepted names listed. A model that invents
 *     `verse` when the tool takes `verse_key` should be told so on the first call, not
 *     handed a default-shaped answer to a question it did not ask.
 *   · Enum misses list the allowed values. Same reason: the correction has to be in the
 *     error, or the model guesses again.
 *
 * Failures throw an Error whose message is written FOR THE MODEL — it is what comes back
 * inside the `isError: true` tool result.
 */

const typeOf = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

function fail(msg) {
  const e = new Error(msg);
  e.validation = true;
  throw e;
}

/* Coerce the near-misses a model actually produces, and only those: a numeric string where
 * an integer is wanted, "true"/"false" where a boolean is, a bare string where a
 * single-element array is. Anything further would be guessing. */
function coerce(value, schema) {
  // `surah: 2` for a string-typed sūrah is the single most natural thing a model writes,
  // and refusing it buys a round trip and no safety: the field accepts "2" already.
  if (schema.type === "string" && typeof value === "number" && Number.isFinite(value)) return String(value);
  if (schema.type === "integer" || schema.type === "number") {
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  if (schema.type === "boolean" && typeof value === "string") {
    if (/^(true|1|yes)$/i.test(value)) return true;
    if (/^(false|0|no)$/i.test(value)) return false;
  }
  if (schema.type === "array" && typeof value === "string") {
    // "a,b" and "a" both become lists — models pass a comma string for an array often
    // enough that refusing it costs a round trip and teaches nothing.
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return value;
}

function checkValue(name, value, schema) {
  const v = coerce(value, schema);
  const t = typeOf(v);

  switch (schema.type) {
    case "string":
      if (t !== "string") fail(`"${name}" must be a string (got ${t}).`);
      if (!v.trim()) fail(`"${name}" must not be empty.`);
      break;
    case "integer":
      if (t !== "number" || !Number.isInteger(v)) fail(`"${name}" must be an integer (got ${t === "number" ? v : t}).`);
      break;
    case "number":
      if (t !== "number" || !Number.isFinite(v)) fail(`"${name}" must be a number (got ${t}).`);
      break;
    case "boolean":
      if (t !== "boolean") fail(`"${name}" must be true or false (got ${t}).`);
      break;
    case "array": {
      if (t !== "array") fail(`"${name}" must be an array (got ${t}).`);
      if (schema.minItems != null && v.length < schema.minItems) fail(`"${name}" needs at least ${schema.minItems} item(s).`);
      if (schema.maxItems != null && v.length > schema.maxItems) {
        fail(`"${name}" takes at most ${schema.maxItems} item(s) (got ${v.length}). Split the request into several calls.`);
      }
      return v.map((item, i) => checkValue(`${name}[${i}]`, item, schema.items || { type: "string" }));
    }
    default:
      fail(`"${name}" has an unsupported schema type.`);
  }

  if (schema.enum && !schema.enum.includes(v)) {
    fail(`"${name}" must be one of: ${schema.enum.join(", ")} (got ${JSON.stringify(v)}).`);
  }
  if (schema.minimum != null && v < schema.minimum) fail(`"${name}" must be ≥ ${schema.minimum} (got ${v}).`);
  if (schema.maximum != null && v > schema.maximum) fail(`"${name}" must be ≤ ${schema.maximum} (got ${v}).`);
  return v;
}

/* Validate `args` against an object schema and return a NEW object carrying the declared
 * defaults. Handlers therefore never see an absent optional or an unchecked value. */
export function validateArgs(schema, args) {
  const input = args == null ? {} : args;
  if (typeOf(input) !== "object") fail(`Arguments must be a JSON object (got ${typeOf(input)}).`);

  const props = schema.properties || {};
  const known = Object.keys(props);

  const unknown = Object.keys(input).filter((k) => !(k in props));
  if (unknown.length && schema.additionalProperties === false) {
    fail(`Unknown argument${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. This tool accepts: ${known.join(", ")}.`);
  }

  const out = {};
  for (const [name, sub] of Object.entries(props)) {
    const given = input[name];
    if (given === undefined || given === null) {
      if (sub.default !== undefined) out[name] = Array.isArray(sub.default) ? [...sub.default] : sub.default;
      continue;
    }
    out[name] = checkValue(name, given, sub);
  }

  for (const name of schema.required || []) {
    if (out[name] === undefined) fail(`"${name}" is required. This tool accepts: ${known.join(", ")}.`);
  }
  return out;
}

/* `sections: []` means "the model asked for nothing", which can only produce an empty
 * answer and another round trip. Read it as the declared default instead. */
export const sectionsOrDefault = (given, fallback) =>
  Array.isArray(given) && given.length ? given : [...fallback];
