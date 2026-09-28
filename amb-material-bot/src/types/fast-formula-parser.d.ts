declare module "fast-formula-parser" {
  interface CellRef {
    sheet: string;
    row: number;
    col: number;
  }
  interface RangeRef {
    sheet: string;
    from: { row: number; col: number };
    to: { row: number; col: number };
  }
  export class FormulaError {
    error: string;
    constructor(error: string, msg?: string);
  }
  export default class FormulaParser {
    constructor(config: {
      functions?: Record<string, (...params: { value: unknown }[]) => unknown>;
      /** Resolves a defined name to the cell or range it names. */
      onVariable?: (name: string) => CellRef | RangeRef | undefined;
      onCell: (ref: CellRef) => unknown;
      onRange: (ref: RangeRef) => unknown[][];
    });
    parse(formula: string, position: CellRef, allowReturnArray?: boolean): unknown;
    static FormulaError: typeof FormulaError;
  }
}
