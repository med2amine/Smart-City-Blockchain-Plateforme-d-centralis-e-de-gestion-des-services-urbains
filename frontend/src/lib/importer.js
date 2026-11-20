// Client-side import of urban issues from an Excel (.xlsx/.xls) or CSV file.
// Pure functions (no React, no blockchain) so they are easy to test.
import * as XLSX from "xlsx";

// Accepted header names for each contract field (compared after normalisation:
// lower-case, no accents, no spaces/punctuation). Add your own aliases if needed.
const ALIASES = {
  issueId: ["issueid", "id", "reference", "ref", "identifiant"],
  issueType: ["issuetype", "type", "category", "categorie"],
  location: ["location", "lieu", "adresse", "address", "localisation"],
  description: ["description", "desc", "details", "detail"],
  reportDate: ["reportdate", "date", "datesignalement", "datereported"],
  priority: ["priority", "priorite", "urgency", "urgence"],
  reportedBy: ["reportedby", "reporter", "citizen", "citoyen", "signalepar"],
};
const REQUIRED_COLUMNS = ["issueType", "location", "description", "reportDate", "priority", "reportedBy"];

// Index = value of the Solidity enum Priority { Low, Medium, High, Critical }
const PRIORITY_ALIASES = {
  low: 0, faible: 0, basse: 0, "0": 0,
  medium: 1, moyenne: 1, normal: 1, normale: 1, "1": 1,
  high: 2, haute: 2, elevee: 2, "2": 2,
  critical: 3, critique: 3, "3": 3,
};

const norm = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v) => String(v ?? "").trim();

// 1. Read the file (client side) 
export async function parseFile(file) {
  const isCsv = /\.(csv|txt)$/i.test(file.name);
  if (!isCsv && !/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
    throw new Error("Unsupported file type. Please choose a .xlsx, .xls or .csv file.");
  }
  // CSV is read as text so accents (é, è…) are decoded as UTF-8
  const input = isCsv ? await file.text() : await file.arrayBuffer();
  return readSheet(input, isCsv);
}

export function readSheet(input, isCsv = false) {
  let wb;
  try {
    // CSV: raw=true keeps every cell as text (no guessing that 05/11/2026 is a US date)
    wb = isCsv
      ? XLSX.read(input, { type: "string", raw: true })
      : XLSX.read(input, { type: "array", cellDates: true });
  } catch {
    throw new Error("Could not read this file. Is it a valid Excel/CSV file?");
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("The file contains no sheet.");

  const raw = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
  const filled = raw.filter((r) => Object.values(r).some((v) => str(v) !== ""));
  if (filled.length === 0) throw new Error("The file is empty.");

  // Map the file's headers to the contract fields
  const headers = Object.keys(raw[0]);
  const colOf = {};
  for (const field of Object.keys(ALIASES)) {
    colOf[field] = headers.find((h) => ALIASES[field].includes(norm(h)));
  }
  const missing = REQUIRED_COLUMNS.filter((f) => !colOf[f]);
  if (missing.length) {
    throw new Error(
      `Missing column(s): ${missing.join(", ")}. Found: ${headers.join(", ") || "(none)"}.`
    );
  }

  return raw
    .map((r, i) => ({ line: i + 2, r })) // line 1 = header row
    .filter(({ r }) => Object.values(r).some((v) => str(v) !== ""))
    .map(({ line, r }) => ({
      line,
      issueId: colOf.issueId ? str(r[colOf.issueId]) : "",
      issueType: str(r[colOf.issueType]),
      location: str(r[colOf.location]),
      description: str(r[colOf.description]),
      reportDate: str(r[colOf.reportDate]),
      priority: str(r[colOf.priority]),
      reportedBy: str(r[colOf.reportedBy]),
    }));
}

// 2. Validate the fields 
function normalizeDate(s) {
  let y, m, d;
  let m1 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let m2 = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // dd/mm/yyyy
  if (m1) [, y, m, d] = m1.map(Number);
  else if (m2) [, d, m, y] = m2.map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * @param rows      output of parseFile
 * @param existingIds  Set of issue ids already on the blockchain
 * @param issueTypes   list of types known by the frontend (unknown = warning only)
 * @returns rows enriched with: issueId (final), priority (number|null), reportDate (ISO),
 *          errors[] (block the import) and warnings[] (informative)
 */
export function validateRows(rows, { existingIds = new Set(), issueTypes = [] } = {}) {
  const used = new Set([...existingIds, ...rows.map((r) => r.issueId).filter(Boolean)]);
  const seenInFile = new Set();
  let seq = existingIds.size;

  return rows.map((row) => {
    const errors = [];
    const warnings = [];
    const out = { ...row };

    // ID
    if (!out.issueId) {
      const year = (normalizeDate(out.reportDate) || "").slice(0, 4) || new Date().getFullYear();
      let id;
      do { id = `CITY-${year}-${String(++seq).padStart(3, "0")}`; } while (used.has(id));
      used.add(id);
      out.issueId = id;
      warnings.push("No ID: generated automatically");
    } else if (/\s/.test(out.issueId)) {
      errors.push("ID must not contain spaces");
    } else if (existingIds.has(out.issueId)) {
      errors.push("ID already exists on the blockchain");
    } else if (seenInFile.has(out.issueId)) {
      errors.push("Duplicate ID in the file");
    }
    seenInFile.add(out.issueId);

    // Required text fields 
    if (!out.issueType) errors.push("Type is required");
    else if (issueTypes.length && !issueTypes.includes(out.issueType)) {
      warnings.push(`Unknown type "${out.issueType}" (will be saved as is)`);
    }
    if (!out.location) errors.push("Location is required");
    if (!out.description) errors.push("Description is required");
    if (!out.reportedBy) errors.push("Reported by is required");

    // Date
    const iso = normalizeDate(out.reportDate);
    if (!iso) errors.push(`Invalid date "${out.reportDate}" (expected YYYY-MM-DD)`);
    else {
      if (iso !== out.reportDate) warnings.push(`Date converted to ${iso}`);
      out.reportDate = iso;
    }

    // Priority -> enum index
    const p = PRIORITY_ALIASES[norm(out.priority)];
    if (p === undefined) errors.push(`Invalid priority "${out.priority}" (Low, Medium, High, Critical)`);
    out.priority = p ?? null;

    return { ...out, errors, warnings };
  });
}