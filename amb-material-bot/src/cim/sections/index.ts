// The master section library in default order (guide 3.4):
// S0 → S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10 → S11.

import { S7 } from "./ebitda.ts";
import { S8 } from "./balance.ts";
import { S2 } from "./company.ts";
import { S4 } from "./customers.ts";
import { S1 } from "./executive.ts";
import { S6 } from "./financial.ts";
import { S0 } from "./front.ts";
import { S9 } from "./growth.ts";
import { S3 } from "./market.ts";
import { S5 } from "./operations.ts";
import { S10 } from "./transaction.ts";
import { S11 } from "./appendix.ts";
import type { SectionModule } from "./types.ts";

export const LIBRARY: SectionModule[] = [S0, S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11];
