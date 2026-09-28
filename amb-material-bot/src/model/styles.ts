// AMB's workbook style system (guide 5.8-5.10, brand/amb-model-style.json):
// one font name, one palette, the exact number-format strings, and the
// font-colour code the writer enforces. ExcelJS cannot register named cell
// styles, so each named style is one shared object applied by name.

export const FONT = "Arial";
export const BODY_SIZE = 9;

export const COLOR = {
  maroon: "7B0000",
  coverBar: "9E0A20",
  section: "FFE1E1",
  keyTotal: "FFFFCC",
  banded: "F2F2F2",
  na: "D9D9D9",
  white: "FFFFFF",
  black: "000000",
  input: "0000FF",
  link: "008000",
  inSheet: "800080",
  pending: "FF0000",
  helper: "808080",
  rawTab: "A6A6A6",
  dividerTab: "7B0000",
  // Sensitivity heat map: the CIM's ordinal ramp mapped onto the model, light to dark.
  ramp: ["F3ECEA", "E6D5D1", "D9BBB5", "C99C93", "B57B70", "9E5A4E", "7B0000"],
} as const;

/** Exact strings of guide 5.10. */
export const FMT = {
  body: '#,##0;\\(#,##0\\);"–";@',
  currency: '[$$]#,##0;\\([$$]#,##0\\);"–";@',
  oneDp: '#,##0.0;\\(#,##0.0\\);"–";@',
  currencyOneDp: '[$$]#,##0.0;\\([$$]#,##0.0\\);"–";@',
  pct: '#,##0%;\\(#,##0%\\);"–";@',
  pct1: '#,##0.0%;\\(#,##0.0%\\);"–";@',
  multiple: '0.0\\x;\\(0.0\\x\\);"–"',
  multiple2: '0.00\\x;\\(0.00\\x\\);"–"',
  monthHeader: "[$-409]mmm-yy;@",
  date: "mm/dd/yy",
  cents: '[$$]#,##0.00;\\([$$]#,##0.00\\);"–"',
  check: '#,##0.000;\\(#,##0.000\\);"–"',
  raw: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"??_);_(@_)',
  rawCents: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)',
  pts: '#,##0.0" pts";\\(#,##0.0" pts"\\);"–"',
  rate: '0.00%;\\(0.00%\\);"–"',
  term: "0",
  perSqFt: '[$$]#,##0.00;\\([$$]#,##0.00\\);"–";@',
  debtConstant: '#,##0.00%;\\(#,##0.00%\\);"–";@',
  toggle: "0",
  days: '#,##0;\\(#,##0\\);"–";@',
} as const;

export type StyleName =
  | "title"
  | "subtitle"
  | "headerGroup"
  | "header"
  | "section"
  | "line"
  | "lineFirst"
  | "subtotal"
  | "keyTotal"
  | "margin"
  | "ratio"
  | "check"
  | "helper"
  | "note"
  | "na"
  | "printToggle"
  | "chartTitle"
  | "keyRate"
  | "subsection"
  | "lineBanded"
  | "monthHeader"
  | "text";

export interface FontSpec {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
  color?: string;
}

export interface AlignSpec {
  horizontal?: "left" | "right" | "center" | "centerContinuous";
  vertical?: "top" | "middle" | "bottom";
  indent?: number;
  wrap?: boolean;
}

export interface StyleSpec {
  font?: FontSpec;
  fill?: string;
  fmt?: string;
  align?: AlignSpec;
}

/** The 5.8 table. Borders are applied per row by the sheet builder because they depend on the column groups. */
export const STYLES: Record<StyleName, StyleSpec> = {
  title: { font: { bold: true, size: 13 }, align: { horizontal: "left" } },
  subtitle: { font: { italic: true }, align: { horizontal: "left" } },
  headerGroup: { font: { bold: true, color: COLOR.white }, fill: COLOR.maroon, align: { horizontal: "centerContinuous" } },
  header: { font: { bold: true, color: COLOR.white }, fill: COLOR.maroon, align: { horizontal: "center" } },
  section: { font: { bold: true }, fill: COLOR.section, align: { horizontal: "left" } },
  line: { fmt: FMT.body, align: { indent: 1 } },
  lineFirst: { fmt: FMT.currency, align: { indent: 1 } },
  subtotal: { font: { bold: true }, fmt: FMT.currency },
  keyTotal: { font: { bold: true }, fill: COLOR.keyTotal, fmt: FMT.currency },
  margin: { font: { bold: true, italic: true }, fill: COLOR.keyTotal, fmt: FMT.pct1, align: { horizontal: "right" } },
  ratio: { font: { italic: true }, fmt: FMT.pct, align: { horizontal: "right" } },
  check: { font: { italic: true, color: COLOR.pending }, fmt: FMT.check },
  helper: { font: { size: 8, color: COLOR.helper } },
  note: { font: { italic: true }, align: { horizontal: "left", wrap: true, vertical: "top" } },
  na: { fill: COLOR.na },
  printToggle: { font: { color: COLOR.input }, fmt: FMT.toggle, align: { horizontal: "center" } },
  chartTitle: { font: { bold: true }, align: { horizontal: "left" } },
  keyRate: { font: { bold: true, italic: true }, fill: COLOR.keyTotal, fmt: FMT.pct1, align: { horizontal: "right" } },
  subsection: { font: { underline: true }, align: { horizontal: "left", indent: 0 } },
  lineBanded: { fill: COLOR.banded, fmt: FMT.body, align: { indent: 0 } },
  monthHeader: { font: { bold: true, color: COLOR.white }, fill: COLOR.maroon, fmt: FMT.monthHeader, align: { horizontal: "center" } },
  text: {},
};

/** Font colour by cell role (guide 5.9). */
export const ROLE_COLOR = {
  input: COLOR.input,
  calc: COLOR.black,
  link: COLOR.link,
  inSheet: COLOR.inSheet,
  pending: COLOR.pending,
  check: COLOR.pending,
  helper: COLOR.helper,
  text: COLOR.black,
} as const;
export type Role = keyof typeof ROLE_COLOR;

/** Page margins in inches (guide 5.11). */
export const MARGINS = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 } as const;

export const WIDTH = {
  gutter: 1.7,
  label: 34,
  labelWide: 48,
  labelAdjustments: 36,
  value: 9.1,
  spacer: 0.9,
  notes: 60,
  strip: 6.7,
  stripRetention: 9.1,
} as const;

export const ROW_HEIGHT = { spacer: 3.95, title: 16.5, body: 12, thin: 2.1 } as const;

export function argb(hex: string): string {
  return `FF${hex.toUpperCase()}`;
}
