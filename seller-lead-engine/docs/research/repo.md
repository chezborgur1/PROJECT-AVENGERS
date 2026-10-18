# Conventions map for a new `seller-lead-engine/` section in PROJECT-AVENGERS

All paths are under `/home/user/PROJECT-AVENGERS/`. Everything here comes from files in the repo. No web sources were needed. Where the repo says nothing, I say so.

## 0. State of the repo (important context)

- A scaffold already exists in commit `a602abc` ("Scaffold seller-lead-engine section (package, tsconfig, vitest)"). It holds `seller-lead-engine/{.gitignore,package.json,package-lock.json,tsconfig.json,vitest.config.ts}` and an installed `node_modules`. There is **no `src/`, `tests/`, `README.md`, `CLAUDE.md` or `.env.example` yet**.
- Scaffold `package.json`: name `seller-lead-engine`, `"type": "module"`, `bin: { "lead-engine": "./src/cli.ts" }`. Scripts are `engine: tsx src/cli.ts`, `demo: tsx src/cli.ts demo`, `typecheck: tsc --noEmit` and `test: vitest run`. It sets `engines.node >=20`. Dependencies are the same as the bot's, minus the Office libraries.
- Installed versions in `seller-lead-engine/node_modules`: @anthropic-ai/sdk 0.128.0, zod 4.6.7, csv-parse 7.0.3, csv-stringify 6.9.0, dotenv 18.0.8, tsx 4.23.15, typescript 7.0.2, vitest 5.0.5. The runtime is Node v22.22.0.
- `amb-material-bot/node_modules` is **not** installed.
- Scaffold `.gitignore` ignores `node_modules/`, `.env`, `data/`, `output/`, `.gmail-tokens.json` and `*.log`. Its comment reads: "Real prospect data never goes in git: imported lists, the pipeline store, the suppression list, outboxes, replies and handoffs. Only the fictional sample is tracked."
- `tsconfig.json` and `vitest.config.ts` in the scaffold are byte-identical to the bot's.

## (a) Code conventions in `amb-material-bot/`

### Module system and runtime
- ESM throughout: `"type": "module"` (`amb-material-bot/package.json`).
- Code runs straight from TypeScript with **tsx**. There is no build step (`"noEmit": true`).
- Imports carry the **`.ts` extension**, which `allowImportingTsExtensions` permits. Node built-ins use the **`node:` prefix**. Type-only imports are inline. Example from `src/cli.ts:13-19`:
  ```ts
  import "dotenv/config";
  import path from "node:path";
  import { CsvRequestStore, buildQueue } from "./requests/csvStore.ts";
  import { NeedsInfoError, processRequest } from "./pipeline.ts";
  ```
  `src/requests/csvStore.ts:4` mixes value and type imports: `import { PRIORITIES, REQUEST_COLUMNS, RequestRowSchema, type RequestRow } from "./schema.ts";`
- `tsconfig.json` settings: `target ES2022`, `module/moduleResolution NodeNext`, `strict`, `noUncheckedIndexedAccess`, `types: ["node"]`, `include: ["src","tests"]`. Because of `noUncheckedIndexedAccess`, the code uses `!` after indexed access often (`rows[0]!`, `named[0]!.issue`).
- File-relative paths use `import.meta.dirname`: `const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");` (`src/cim/narrative.ts`) and `export const REPO = path.resolve(import.meta.dirname, "..");` (`tests/helpers.ts:7`).
- Code style:
  - Numeric separators (`95_000`, `30_000`).
  - `??=` for lazy initialisation (`client ??= new Anthropic(...)`).
  - Constant tuples as `as const` arrays.
  - Long lines are tolerated, roughly 160 to 200 characters. There is no prettier or eslint config in the repo.
  - Double quotes and trailing commas.

### zod v4 idioms (`src/requests/schema.ts`, `src/ingest/intake.ts`, `src/ingest/aiExtract.ts`, `src/cim/copy.ts`)
- `import { z } from "zod";`
- Enum values live in `as const` arrays, which feed `z.enum`:
  ```ts
  export const PRIORITIES = ["P1", "P2", "P3"] as const;
  export const STATUSES = ["new", "in_progress", "done", "needs_info", "error", "rerun"] as const;
  ...  priority: z.enum(PRIORITIES), status: z.enum(STATUSES),
  ```
- CSV cell coercion uses `z.string().transform((raw, ctx) => ...)`, with `ctx.addIssue({ code: "custom", message })` and `return z.NEVER` (`schema.ts:11-22`):
  ```ts
  /** Blank -> undefined; "$85,000" -> 85000; anything else is a validation error. */
  function optionalNumeric(opts: { int?: boolean } = {}) {
    return z.string().transform((raw, ctx) => {
      const s = raw.replace(/[$,\s]/g, "");
      if (s === "") return undefined;
      const n = Number(s);
      if (!Number.isFinite(n) || (opts.int && !Number.isInteger(n))) {
        ctx.addIssue({ code: "custom", message: `expected a number, got "${raw}"` });
        return z.NEVER;
      }
      return n;
    });
  }
  ```
- Regex with a human message: `fiscal_year_end: z.string().regex(/^(0[1-9]|1[0-2])-\d{2}$/, "use MM-DD, e.g. 12-31")`.
- Types are inferred from schemas: `export type RequestRow = z.infer<typeof RequestRowSchema>;`. The CSV header order comes from the schema: `export const REQUEST_COLUMNS = Object.keys(RequestRowSchema.shape) as (keyof RequestRow)[];` with the doc comment "Keep in sync with RequestRowSchema."
- Validation uses `safeParse`, and errors are flattened to `path: message` (`csvStore.ts:39-45`): `result.error.issues.map((iss) => \`${iss.path.join(".")}: ${iss.message}\`).join("; ")`.
- **Schemas Claude fills (the "wire" form)** follow these rules:
  - Every key is required. An unknown is `.nullable()`, never `.optional()`.
  - Each field carries a `.describe("...")` that acts as the instruction to the model.
  - Small factories keep this short (`intake.ts:20-23`): `const str = () => z.string().nullable(); const num = () => z.number().nullable(); const int = () => z.number().int().nullable();`
  - The comment at `intake.ts:25` states the rule: `/** The wire form Claude returns: every key present, unknowns null. */`
  - A separate function converts wire to domain (`toIntakeFacts`, `extractionToSource`).
  - `.extend()` is used for variants: `LineSchema.extend({ category: z.enum(IS_CATEGORIES) })`.
- zod v4 internals are used to walk a schema: `(schema as { def: { type: string } }).def.type === "nullable"`, `.unwrap()`, `.element` and `.shape` (`intake.ts` `fillMissing`).

### csv-parse and csv-stringify (synchronous API only)
- `import { parse } from "csv-parse/sync"; import { stringify } from "csv-stringify/sync";` (`csvStore.ts:2-3`).
- Reading keyed records: `parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true })` (`csvStore.ts:29`).
- Reading a raw grid: `parse(text, { relax_column_count: true, skip_empty_lines: false, bom: true }) as string[][]` (`src/util/tables.ts:101`).
- Writing: `fs.writeFileSync(this.file, stringify(raw, { header: true, columns }))`, where `columns = [...new Set([...REQUEST_COLUMNS, ...Object.keys(raw[0] ?? {})])]`. Unknown columns therefore survive the round trip.
- Store pattern (`csvStore.ts`):
  - A `RequestStore` interface (`load()`, `update(id, patch)`) with a `CsvRequestStore` implementation.
  - The header comment notes that "A Google Sheets store with the same interface is on the roadmap".
  - `load()` fills missing optional columns with `""`.
  - Invalid rows are collected as `{ line: i + 2, requestId, error }` and never thrown. The doc comment reads "so one bad row never blocks the rest".
  - `update()` re-reads the raw strings and patches only the given keys: "so columns we don't own (or rows that failed validation) are written back untouched".
- Missing-file error with a remedy: `throw new Error(\`Request list not found: ${this.file}. Start one by copying requests/high-priority-requests.csv.\`)`.
- Queue ordering is a pure function (`buildQueue(rows, opts)`) kept separate from I/O, so it is unit-testable.

### How Claude is called (`src/util/claude.ts`, `src/ingest/aiExtract.ts`, `src/cim/narrative.ts`)
- There is one wrapper module. `amb-material-bot/CLAUDE.md` makes it a rule: "Claude calls go through `src/util/claude.ts` (structured outputs + server-side refusal fallback)."
  ```ts
  export const CLAUDE_MODEL = process.env.AMB_CLAUDE_MODEL || "claude-opus-5";
  let client: Anthropic | undefined;
  export function claudeAvailable(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }
  export function claude(): Anthropic {
    client ??= new Anthropic({ timeout: 15 * 60 * 1000 });
    return client;
  }
  /** Spread into every `client.beta.messages.*` call. A function so each call gets its own arrays. */
  export function fallbackOptions(): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } {
    return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  }
  /** Throw a readable error unless the model finished normally. */
  export function assertFinished(stopReason: string | null, what: string): void {
    if (stopReason === "refusal") throw new Error(`Claude declined to process ${what}`);
    if (stopReason === "max_tokens") throw new Error(`Claude's output for ${what} was cut off (max_tokens)`);
  }
  ```
  - The installed SDK 0.128.0 confirms these APIs: `server-side-fallback-2026-07-01` appears in `resources/beta/beta.d.ts`, `fallbacks?: BetaFallbacksParam` is on beta messages, and `betaZodOutputFormat` is in `helpers/beta/zod.d.ts`.
  - The SDK's `Model` union includes `claude-opus-5` and `claude-opus-5-5`.
- **Standard structured call** (`aiExtract.ts:95-117`):
  ```ts
  import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
  const response = await claude().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    ...fallbackOptions(),
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: [docBlock, { type: "text", text: `Business: ... Extract this document.` }] }],
  });
  assertFinished(response.stop_reason, path.basename(file));
  if (!response.parsed_output) throw new Error(`Could not parse Claude's extraction of ${path.basename(file)}`);
  return response.parsed_output;
  ```
- **Long outputs** are streamed (`narrative.ts` `draftWithClaude`). The pattern is `claude().beta.messages.stream({... max_tokens: 64000, ...fallbackOptions(), thinking: { type: "adaptive" }, output_config: { effort: "high", format: betaZodOutputFormat(CimCopySchema) } })`, then `await stream.finalMessage()`, `assertFinished`, joining the text blocks, `JSON.parse` inside a try, and `Schema.safeParse`.
  - A comment notes: "Structured outputs (output_config.format) need no beta header; only the server-side fallback does."
  - A test asserts `params.betas` equals `fallbackOptions().betas` exactly (`tests/cim-fallback.test.ts`).
- Prompt style:
  - The system prompt is a module-level template constant (`const SYSTEM = \`...\``). It gives a role sentence, then `Rules:` bullets or numbered "Hard rules", and always "Never invent / never estimate".
  - User content wraps inputs in XML-like tags (`<intake_notes>`, `<figure_table>`, `<previous_draft>`, `<lint_findings>`).
- **Lint, then one repair round**: output is linted. If it has issues, Claude gets one repair call with the findings ("Return the previous draft with every lint finding fixed and nothing else changed."). The code keeps whichever version has fewer issues.
- **Degrades gracefully without a key**. `draftCimCopy` tries Claude, then a reviewed fixture, then a template, and records `source: "claude" | "fixture" | "template"` and a `fallback` reason string:
  ```ts
  } catch (e) {
    fallback = `Claude's draft was not used (${(e as Error).message}); the copy below is the fallback.`;
  }
  ```
  The CLI prints a note when `!claudeAvailable()` (`cli.ts:67-72`). `.env.example` documents what works without the key.

### Error handling
- Errors are plain `Error`s with actionable messages that name the file and the fix.
- Domain errors are empty subclasses: `export class NeedsInfoError extends Error {}` (`pipeline.ts:55`). The CLI maps them to a status: `status: err instanceof NeedsInfoError ? "needs_info" : "error"`.
- Per-item failures never stop the batch (`cli.ts:76-104`):
  - Each row is wrapped in try/catch, and the error is written back to the store with `last_error: message.slice(0, 500)`.
  - A `failures` count is kept, and the run ends with `process.exitCode = failures ? 1 : 0`.
- Top level (`cli.ts:138-141`):
  ```ts
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
  ```
- Hard safety gates throw instead of warning. Example: "A customer or staff member named in buyer copy is a confidentiality breach, never a warning" (`pipeline.ts:115-117`). The pipeline also refuses to deliver a workbook that fails verification.

### CLI argument parsing (`src/cli.ts`)
- No library is used. The file opens with the shebang `#!/usr/bin/env -S npx tsx` and a usage comment block (lines 2-11, e.g. `//   amb-bot run --id REQ-0001          build one request (any status)`).
- A positional command plus hand-rolled flags:
  ```ts
  function flag(args: string[], name: string): string | undefined {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  }
  const [command = "help", ...args] = process.argv.slice(2);
  switch (command) { case "list": {...} case "run": {...} default: console.log(`amb-bot: ...usage...`); }
  ```
  Boolean flags use `args.includes("--force")`. Comma lists use `flag(args, "--id")?.split(",")`.
- Config comes from env with `||` defaults, and paths resolve against `process.cwd()`:
  ```ts
  const firm = {
    name: process.env.AMB_FIRM_NAME || "AMB Advisory Services",
    contact: process.env.AMB_CONTACT_NAME || "",
    email: process.env.AMB_CONTACT_EMAIL || "",
    phone: process.env.AMB_CONTACT_PHONE || "",
  };
  ```
- Console output uses `▶` for item start, `✓`/`✗` for results, `→` for queued, and two-space indented detail lines. The pipeline takes `log?: (msg) => void` and `now?: Date` through config, which keeps it deterministic in tests.
- A dry-run flag (`--no-update`) swaps `update` for a no-op: `const update: typeof store.update = args.includes("--no-update") ? () => {} : (id, patch) => store.update(id, patch);`

### Test style (vitest, fixtures, offline)
- Config: `test: { include: ["tests/**/*.test.ts"], testTimeout: 30_000 }`. `amb-material-bot/CLAUDE.md` says "`npm test`: vitest, all offline".
- Imports: `import { describe, expect, it } from "vitest";` and `../src/...ts` with the extension.
- `tests/helpers.ts`:
  ```ts
  export const REPO = path.resolve(import.meta.dirname, "..");
  export function tmpDir(prefix = "amb-bot-"): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  }
  ```
  It also has `sampleRow()`, which loads the tracked fictional sample CSV.
- Mutating tests copy the sample into a temp dir first (`queue.test.ts:7-11`). `it` names are plain-English behaviour statements: "reports a bad row without blocking the rest", "updates status in place and keeps other rows intact".
- Assertions use `toMatchObject`, `toEqual([])` (for "no invalid rows") and regexes on generated markdown.
- Two ways to stay offline:
  1. An env wrapper (`pipeline.test.ts:28-36`):
     ```ts
     async function offline<T>(fn: () => Promise<T>): Promise<T> {
       const saved = process.env.ANTHROPIC_API_KEY;
       delete process.env.ANTHROPIC_API_KEY;
       try { return await fn(); } finally { if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved; }
     }
     ```
  2. `vi.mock` of the wrapper module (`cim-fallback.test.ts:19-37`):
     ```ts
     vi.mock("../src/util/claude.ts", async (importOriginal) => {
       const real = await importOriginal<typeof import("../src/util/claude.ts")>();
       return { ...real, claudeAvailable: () => true,
         claude: () => ({ beta: { messages: { stream: (params) => ({ finalMessage: async () => {...} }) } } }) };
     });
     ```
     A shared `reply.mode` (`"throw" | "cut" | "ok"`) drives the stub. The tests assert on the captured request `params` and on the fallback reason (`/^Claude's draft was not used \(529 overloaded_error\)/`).
- Optional external tools are detected at load time and tests branch on them (the `hasSoffice` try/catch around `execFileSync`). Long setup goes in `beforeAll(..., 600_000)`.
- Fixtures: `tests/fixtures/*.ts|json` plus the tracked fictional `samples/` folder. A test fails if the sample and the fixture diverge.

### Comment density and tone
- Every source file opens with a `//` paragraph saying what the module is for and why (`csvStore.ts:6-8`, `aiExtract.ts:1-4`, `narrative.ts:1-10`, `pipeline.ts:1-7`, which draws the output folder tree).
- Exported functions and fields get one-line `/** ... */` JSDoc stating the behaviour or contract: `/** Requests the bot should work, in order: priority, then due date, then received date. */`
- Inline comments explain the reason, not the mechanics: `// Missing optional columns are treated as blank rather than errors.`
- References to the spec are cited inline ("guide 4.4", "QA round 3 F27", "guide Q6").
- Tone is plain and declarative. There are no emojis and no em dashes; the house style bans them in prose, and the code comments follow suit. Long files use dividers: `// ---------------------------------------------------------------------------` / `// Claude` (`narrative.ts`), and `// --- open-questions.md ----...` (`pipeline.ts`).

### README.md structure (`amb-material-bot/README.md`)
1. `# Title`, then a 1-paragraph purpose and a bulleted list of outputs.
2. An ASCII flow diagram in a code block.
3. `## Quick start`: "Requires Node 20 or later (developed on Node 22)", then `npm install / npm test / npm run demo` on the fictional sample.
4. A table of optional tools (`Tool | Used for | Without it`).
5. `### What needs an API key`: a numbered list, then what happens without the key.
6. `## Day-to-day use` (numbered steps) and "Other commands" (a code block of `npm run bot -- ...` lines with trailing `#` comments).
7. `## How it works`: a table `Stage | Code | What happens`, then subsections.
8. `### Confidentiality`: what is git-ignored, plus a note that data sent to Claude is processed under Anthropic's commercial API terms.
9. `## Known limits and next steps`: an honest list of what is not built or tested live.

### CLAUDE.md structure (`amb-material-bot/CLAUDE.md`)
1. `# Title` with a 3-line description naming the owner ("Owned by AMB Advisory Services (sell-side M&A for Main Street / lower middle market)").
2. `## The law`: the spec documents that govern the section.
3. `## Commands`: test, typecheck, CLI and demo invocations.
4. `## Layout`: directory by directory, one line each.
5. `## Rules`: hard invariants in "never/must" form, e.g. "Real client data ... is git-ignored. Keep it that way. Samples must stay fictional" and "Claude calls go through `src/util/claude.ts`".

### `.env.example` style (`amb-material-bot/.env.example`)
- The header is "# Copy to .env and fill in. Never commit .env."
- Each variable block has a comment saying what it does and what happens when it is blank.
- Firm fields are namespaced `AMB_*`: `AMB_FIRM_NAME=AMB Advisory Services`, `AMB_CONTACT_NAME=Frank`, `AMB_CONTACT_EMAIL=frank@ambadvisoryservices.com`, `AMB_CONTACT_PHONE=` (blank), and an optional `AMB_CLAUDE_MODEL`.

## (b) AMB writing voice rules (`amb-material-bot/docs/HOUSE_STYLE.md` §4, lines 593-725) that email copy should follow

HOUSE_STYLE is written for the CIM. §4.1 says: "The CIM is written in the **third person about the Company** ... AMB Advisory speaks in the first person only on the process and contact pages." A cold email from a named sender is first-person correspondence, so the "we/our/us outside S10" ban does not transfer. The rest of §4.2 and §4.4 applies directly.

**§4.2 Rules (verbatim):**
1. "**Lead with the point.** First sentence of every bullet and paragraph states the conclusion."
2. "**Every claim carries a number and a comparison** (a prior period, a benchmark, a share)."
3. "**Name the mechanism.** Use "because", "driven by", "as a result", "either (a)… or (b)""
4. "**Name things.** Systems (ServiceTitan, QuickBooks Online), suppliers, towns, months, counts"
5. "**Attribute what is not verified.** "Management estimates…", "per management", "the Seller reports""
6. "**State the negative with its context.**"
7. "**One claim per sentence.** No triads of adjectives; no stacked clauses."
8. "**Say what is not assumed.**"
9. "**No judgement of price or attractiveness.** No "attractive", "compelling", "undervalued" about the deal."
10. "**No em dashes, exclamation marks, rhetorical questions or italics for emphasis.**"

**§4.4 Banned words and constructions (table, verbatim cells):**
- "well-positioned, poised, strategically positioned"
- "robust, strong, solid, healthy (without a number)"
- "best-in-class, world-class, leading, one of the leading, premier"
- "well-established, proven track record, proven growth engine"
- "platform-sized, scalable platform, significant runway, ample headroom"
- "high margin organization, operational efficiencies (bare)"
- "strong leadership, deep management team, highly respected"
- "loyal / sticky customer base, diversified (bare)"
- "unlock value, leverage synergies, seamless, cutting-edge, state-of-the-art, turnkey, holistic, comprehensive suite, dynamic"
- "unique, differentiated, key differentiator, moat"
- "significant, substantial, meaningful (without a number)"
- "impressively, remarkably, notably, importantly"
- "highly achievable, clear path"
- "above average / below average (no benchmark)"
- "In today's … landscape; navigate; delve; tapestry; testament to; boasts; stands out"
- "It is worth noting; Furthermore; Moreover; Additionally (sentence openers)"
- "not only … but also; not just X, but Y"
- "attractive, compelling, undervalued (of the deal)"
- "we, our, us (outside S10)": in the CIM only, see above.
- "\"Initial\", \"preliminary\" on a figure"

The machine-readable versions live in `amb-material-bot/src/cim/copy.ts`:
- `BANNED_PHRASES` (lines 140-198, which adds "unparalleled")
- `BANNED_WITHOUT_NUMBER = ["strong", "solid", "healthy", "significant", "substantial", "meaningful", "leading", "diversified", "loyal", "sticky"]`
- `BANNED_OPENERS = ["Furthermore", "Moreover", "Additionally"]`
- `LEVERAGE_VERB = /\bleverag(e|es|ed|ing)\b(?!\s+(ratio|ratios))/i`
- `PRICE_TALK`
- the rhetorical-question check `/\?\s*$/`

The new section can copy these lists or import them. The CIM-only checks (first person, `{{token}}` checks) should be dropped.

**§4.6 numbers in prose (verbatim):**
- "Money: `$3.04M`, `$998K`, `$95,000` for salaries; K and M in capitals with no space."
- "Ranges: en dash, no spaces: `$500K–$700K`"
- "Percentages: whole numbers in prose (`12%`)"
- "Approximation: ... in sentences "about", "roughly", "approximately""

`src/util/format.ts` (`fmtMoney`, `fmtDollars`, `EN_DASH`) implements these rules.

**Other voice facts:**
- HOUSE_STYLE preamble: "**Everything the bot writes into a client deliverable is US English**".
- §4.7: placeholders are `[Confirm: …]`, "Never "[ ]", "TBD", "XX", "N/A"".

**§1.4 Name treatment (applies to email):**
- Running text, first mention: "AMB Advisory Services".
- Later mentions: "AMB Advisory".
- Legal text: "AMB Advisory Services LLC".
- "Never: "AMB" alone in client prose; "AMB Advisory Services, LLC" (with comma); "Amb"".
- Phone "written with dots".

## (c) Firm facts for the CAN-SPAM footer

| Fact | Value | Source |
|---|---|---|
| Legal name | AMB Advisory Services LLC | HOUSE_STYLE §1.4 line 164; `src/cim/sections/transaction.ts:140`; `src/cim/sections/front.ts:13` (disclaimer) |
| Trading name | AMB Advisory Services (first mention), AMB Advisory (later) | HOUSE_STYLE §1.4 |
| Website / domain | ambadvisoryservices.com | HOUSE_STYLE §1.4 line 166; `front.ts:75`; `transaction.ts:144` |
| Firm email | info@ambadvisoryservices.com | HOUSE_STYLE §1.4; `transaction.ts:143` default |
| Phone | 813.364.2178 | HOUSE_STYLE §1.4; `transaction.ts:142` |
| City | Tampa, Florida | HOUSE_STYLE §1.4; `transaction.ts:144` ("Office", "Tampa, Florida; ambadvisoryservices.com") |
| Contact name | "Frank" (`.env.example` `AMB_CONTACT_NAME=Frank`) | `amb-material-bot/.env.example` |
| Contact full name / title | "Frank Moneymaker, Principal" appears only in **test fixtures** (`tests/cim-deck.test.ts:30`, `cim-qa.test.ts:26`, `cim-office.test.ts:72`). "Frank Moneymaker" appears in research notes taken from document metadata (`docs/research/writeup-examples.md:7,98`). | **Unconfirmed**: HOUSE_STYLE §6 Q6 is still open: "Frank's full name and title as it should print ("Principal"?), direct phone and email ... Only firm-level details appear in the references" |
| Personal email | frank@ambadvisoryservices.com | `.env.example` only; not confirmed in the references (Q6) |
| **Street / postal address** | **Absent.** None anywhere in the repo. I searched for Suite, Street, Ave, Blvd, PO Box, "FL 33" and "Florida 33" across docs, src, design, brand, the root README and the references README. Only the city "Tampa, Florida" exists. | The repo search above |
| Separate sending domain, sending mailbox | **Absent.** Nothing in the repo; the plan says to buy 1-2 domains | the user's plan (lines 18, 23, 39) |

- The user's plan itself requires "a physical address" and "our mailing address" (plan lines 25, 37).
- CAN-SPAM requires a valid physical postal address in each commercial email. This can be a street address, a USPS-registered PO box, or a private mailbox registered with a CMRA (FTC CAN-SPAM Act compliance guide, https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
- The engine must therefore refuse to send until a postal address is configured. Frank has to supply it.

## (d) Industries AMB has worked on (from file and folder names under `references/` only; contents not opened)

- **Laundromat**: `02 Monica Kennedy - Investor Dataroom/00 Target Company Documents/Laundromat Tax Returns/`, `.../02 Diligence Reports/Estimated Laundromat Valuation.pdf`.
- **Commercial real estate / retail plaza with tenants**:
  - `Corsair Plaza Owner Statements/`, `Tenant Details.docx`, `04 Tennant Leases/`
  - `CRE Rental Pricing Analysis.pdf`, `CRE Valuation Constraints.pdf`
  - `03 AMB Advisory - Company Dataroom/In Progress Reports/Corsair_Plaza_NOI_Bridge.xlsx`, `AMB Advisory + Sunshine Commercial - Initial CRE Valuation.docx`
  - `Sunshine Commercial Investments: Purchase Agreement Contingencies.docx`
- **HOA / community association management**: `ICP Template/Examples/Pre-LOI Write up - HOA Community Solutions.docx`, `Diligence Write up - HOACS.docx`, `04 Tennant Leases/Examples/HOA CS Lease agreement 2022.pdf`.
- **Accounting firms / bookkeeping, and a software company**: `03) AMB Dataroom/accounting-firm-acquisitions.xlsx`, `03) AMB Dataroom/02) Software Specfics/Topkey Tech Stack Notes.docx`, and the Topkey/Keystone workbooks, LOIs and offers.
- **Industry not inferable from names**: CPM, Forth Group, Coral (funds flow), plus Optimum and Skelly, which `references/README.md` lists as not copied.
- **Fictional samples only, not client work**:
  - HVAC and plumbing: Project Ridgeline (`amb-material-bot/README.md`; `samples/project-ridgeline/`).
  - Dental laboratory: "Project Crown", `amb-material-bot/requests/high-priority-requests.csv:3`, a sample row.
- **Character of the work**: the names point mostly to **buy-side and investor diligence**: "Investor Dataroom", "Acquisition Opportunity Report", "Pre-LOI Deal Memo", LOI/Offer versions, "Diligence Workbook". There is no evidence in the names of a completed sell-side engagement in HVAC, landscaping or dental.
- Implication for email copy: claims like "we've sold businesses like yours" have no support in the repo. They would breach both the "never invent facts" rule and the plan's "no false claims". Client names must never appear in outreach.

## (e) Root-level setup and section registration

- **Root `README.md`**:
  - The section table (`| Section | What it does | Status |`) has one row: `` [`amb-material-bot/`](amb-material-bot/) `` | "Reads the high-priority request list and builds ..." | "v0.1: runs end to end on the sample deal. Claude drafting and QuickBooks Online have not run against the live services yet".
  - "## Adding a section" (verbatim): "Create a new top-level folder with its own `README.md` and, if it has code, its own `package.json` and tests. Keep client data out of git: every section ignores its own `output/`, `deals/`, `.env` and credential files."
  - "## Setup on your computer" steps 1-4. Step 4 is specific to amb-material-bot.
- **`setup.sh`** is hard-wired to one section:
  ```bash
  #!/usr/bin/env bash
  # PROJECT AVENGERS one-click setup (Mac/Linux): bash setup.sh
  set -e
  command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org, then rerun."; exit 1; }
  cd "$(dirname "$0")/amb-material-bot"
  npm install
  [ -f .env ] || cp .env.example .env
  [ -f requests/live-requests.csv ] || cp requests/high-priority-requests.csv requests/live-requests.csv
  npm run demo
  echo "Done. Add ANTHROPIC_API_KEY to amb-material-bot/.env; ..."
  open references 2>/dev/null || true
  ```
- **`setup.bat`** follows the same pattern: `where node`, then `cd /d "%~dp0amb-material-bot"`, `call npm install || (pause & exit /b 1)`, `if not exist .env copy .env.example .env >nul`, the live-requests copy and `call npm run demo`. It then echoes numbered next steps and opens `references` and `output` with `start "" ...`.
- **Root `.gitignore`**: "# Belt and braces: each section also has its own .gitignore." It ignores `node_modules/`, `.env`, `.DS_Store` and `Thumbs.db`.
- **Root `.claude/settings.json`**: model `claude-opus-5-5`, `effortLevel xhigh`.
- **Registering `seller-lead-engine/`**:
  1. Add a row to the root README table, with an honest status in the same style (e.g. "v0.1: runs offline on the fictional sample; Gmail sending and Claude qualification have not run against live services yet").
  2. Ship `README.md`, `CLAUDE.md`, `.env.example`, `src/`, `tests/` and a fictional `samples/` (or `data/sample`) inside the section.
  3. Extend `setup.sh` and `setup.bat` with a second block. Because both scripts `cd` into amb-material-bot, the new block must `cd "$(dirname "$0")/seller-lead-engine"` from the script root; a subshell `( cd ... && npm install ... )` works in `setup.sh`, and `cd /d "%~dp0seller-lead-engine"` in `setup.bat`. Each block runs `npm install`, copies `.env.example` to `.env` if missing, and runs `npm run demo`.
  4. Make sure the section `.gitignore` covers the root rule's list: the scaffold has `.env`, `output/` and the `.gmail-tokens.json` credential, and uses `data/` instead of `deals/`.


## Key facts

| Fact | Confidence | Source | Design implication |
|---|---|---|---|
| A seller-lead-engine scaffold already exists (commit a602abc): package.json (type module, bin lead-engine -> ./src/cli.ts, scripts engine/demo/typecheck/test), tsconfig.json and vitest.config.ts identical to amb-material-bot, .gitignore ignoring data/, output/, .gmail-tokens.json, .env; node_modules installed (sdk 0.128.0, zod 4.6.7, csv-parse 7.0.3, csv-stringify 6.9.0, tsx 4.23.15, vitest 5.0.5). No src/, tests/, README.md, CLAUDE.md or .env.example yet. | high | /home/user/PROJECT-AVENGERS/seller-lead-engine/*, git log | Build on the scaffold rather than re-creating it; src/cli.ts must implement a 'demo' command since package.json already points demo at it. |
| ESM + tsx with no build: imports use explicit .ts extensions and node: prefixes; tsconfig strict, noUncheckedIndexedAccess, NodeNext, allowImportingTsExtensions, noEmit; import.meta.dirname for file-relative paths. | high | amb-material-bot/tsconfig.json; src/cli.ts:13-19; tests/helpers.ts:7 | Write all imports as './x.ts', use node:fs/node:path, and expect '!' on indexed access. |
| All Claude calls go through one wrapper src/util/claude.ts: CLAUDE_MODEL = process.env.AMB_CLAUDE_MODEL // 'claude-opus-5'; claudeAvailable() checks ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN; claude() lazily builds Anthropic({timeout: 15 min}); fallbackOptions() returns { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }; assertFinished() throws on 'refusal' and 'max_tokens'. | high | amb-material-bot/src/util/claude.ts; amb-material-bot/CLAUDE.md Rules | Copy this wrapper into seller-lead-engine/src/util/claude.ts and route reply qualification/scoring through it. |
| Structured-output call idiom: claude().beta.messages.parse({ model: CLAUDE_MODEL, max_tokens: 16000, ...fallbackOptions(), thinking: {type:'adaptive'}, output_config: { effort: 'high', format: betaZodOutputFormat(Schema) }, system: SYSTEM, messages }), then assertFinished(response.stop_reason, what) and throw if !response.parsed_output. Long outputs use .stream() + finalMessage() + JSON.parse + safeParse. No structured-outputs beta header; a test asserts betas equal fallbackOptions().betas. | high | amb-material-bot/src/ingest/aiExtract.ts:95-117; src/cim/narrative.ts:172-204; tests/cim-fallback.test.ts | Reply qualification (revenue, timeline, motivation, score) should be a zod wire schema passed via betaZodOutputFormat to beta.messages.parse. |
| Wire schemas Claude fills keep every key required, use .nullable() (never .optional()) for unknowns, and put model instructions in .describe(); factories str()/num()/int() = z.x().nullable(); a separate function converts wire to domain types. | high | amb-material-bot/src/ingest/intake.ts:14-26; src/ingest/aiExtract.ts:17-50 | QualificationWire schema: e.g. revenue: num().describe('only if the reply states it'), timeline/motivation nullable, then convert to the domain lead record. |
| zod v4 CSV idioms: as-const arrays into z.enum; z.string().transform((raw, ctx) => ...) with ctx.addIssue({code:'custom'}) and return z.NEVER for numeric cells; z.infer types; column order = Object.keys(Schema.shape); safeParse with issues flattened to 'path: message'. | high | amb-material-bot/src/requests/schema.ts; src/requests/csvStore.ts:36-48 | Prospect/lead CSV rows should be defined the same way, with header order derived from the schema. |
| CSV I/O uses only csv-parse/sync and csv-stringify/sync: parse(text, { columns: true, skip_empty_lines: true, trim: true, bom: true }); stringify(raw, { header: true, columns }). The store re-reads raw strings and patches only owned keys, keeps unknown columns, and collects invalid rows {line, requestId, error} so one bad row never blocks the rest. A store interface allows a later Google Sheets backend. | high | amb-material-bot/src/requests/csvStore.ts | Pipeline store, suppression list and handoff log should be CSV stores behind an interface, tolerant of bad rows, under git-ignored data/. |
| Graceful degradation: without an API key the bot still runs (Claude -> reviewed fixture -> template), recording source and a fallback reason ('Claude's draft was not used (<msg>); ...'); the CLI prints a note when !claudeAvailable(). | high | amb-material-bot/src/cim/narrative.ts draftCimCopy; src/cli.ts:67-72; .env.example | The demo and tests must run offline; qualification needs a deterministic no-key path (fixture or rule-based) and must record which path produced each score. |
| Error handling: actionable Error messages naming the file and fix; domain error subclasses (class NeedsInfoError extends Error {}) mapped to status; per-item try/catch writing last_error (sliced to 500 chars) and continuing; process.exitCode = failures ? 1 : 0; main().catch prints the message and exits 1. Safety violations throw rather than warn. | high | amb-material-bot/src/cli.ts:76-141; src/pipeline.ts:55,115-117; src/requests/csvStore.ts:26 | A send to a suppressed address, or an email missing the postal address or opt-out, should throw (a hard gate), not warn. |
| CLI parsing is hand-rolled: a shebang '#!/usr/bin/env -S npx tsx', a usage comment block, 'import "dotenv/config"' first, [command='help', ...args] = process.argv.slice(2), a flag(args, name) helper, args.includes('--x') for booleans, a switch with a default help text, env config with // defaults, and a --no-update dry run. | high | amb-material-bot/src/cli.ts | lead-engine CLI commands (import, enrich, draft, send, qualify, handoff, demo) should follow the same pattern with no arg-parsing library and a --dry-run style flag. |
| Tests are vitest, all offline: helpers.ts exports REPO and tmpDir() (fs.mkdtempSync in os.tmpdir()); sample files are copied to temp before mutation; an offline() wrapper deletes ANTHROPIC_API_KEY; vi.mock('../src/util/claude.ts', importOriginal) replaces claude() with a stub beta.messages.stream/parse; tests assert on captured params and fallback reasons; it() names are plain-English behaviour sentences. | high | amb-material-bot/tests/helpers.ts; tests/queue.test.ts; tests/pipeline.test.ts:28-36; tests/cim-fallback.test.ts:19-37 | Mock the Claude wrapper and the Gmail send layer; never hit the network in npm test. |
| Comment style: every file opens with a // paragraph on purpose and why; one-line /** */ JSDoc on exports; inline comments give reasons; spec references cited inline; '// ----' section dividers; no emojis or em dashes. | high | amb-material-bot/src/requests/csvStore.ts:6-8; src/ingest/aiExtract.ts:1-4; src/pipeline.ts:1-7 | Match the density: a header paragraph per module, JSDoc per export, and comments citing CAN-SPAM rules and plan items where relevant. |
| CLAUDE.md structure: title plus owner line; '## The law' (governing specs); '## Commands'; '## Layout'; '## Rules' (hard never/must invariants, e.g. client data git-ignored, samples fictional, Claude calls through util/claude.ts). README structure: purpose and outputs, ASCII flow, Quick start (Node 20+, developed on 22), optional tools table, What needs an API key, Day-to-day use, Other commands, How it works table (Stage/Code/What happens), Confidentiality, Known limits and next steps. | high | amb-material-bot/CLAUDE.md; amb-material-bot/README.md | seller-lead-engine/CLAUDE.md should list CAN-SPAM and suppression rules under Rules, and the README should state honestly what has not run live. |
| HOUSE_STYLE §4.2 voice rules: lead with the point; every claim a number and a comparison; name the mechanism; name things; attribute what is not verified; one claim per sentence; no judgement of price or attractiveness; no em dashes, exclamation marks, rhetorical questions or italics. §4.4 bans phrases such as well-positioned, robust, best-in-class, proven track record, unlock value, seamless, turnkey, unique, impressively, delve, testament to, 'not only... but also', Furthermore/Moreover/Additionally openers, and attractive/compelling/undervalued. Machine lists: BANNED_PHRASES, BANNED_WITHOUT_NUMBER, BANNED_OPENERS, LEVERAGE_VERB in src/cim/copy.ts. | high | amb-material-bot/docs/HOUSE_STYLE.md lines 599-669; amb-material-bot/src/cim/copy.ts:140-210 | Lint every outbound email and AI reply with the same banned lists (drop the CIM-only first-person rule, since cold email is first-person per §4.1); fail drafts with em dashes, exclamation marks or rhetorical questions. |
| Name treatment: 'AMB Advisory Services' on first mention, 'AMB Advisory' later, 'AMB Advisory Services LLC' in legal text; never 'AMB' alone, 'AMB Advisory Services, LLC' or 'Amb'; phone written with dots; client deliverables in US English. | high | amb-material-bot/docs/HOUSE_STYLE.md §1.4 lines 158-170 and preamble | Email body uses 'AMB Advisory Services' then 'AMB Advisory'; the CAN-SPAM footer uses 'AMB Advisory Services LLC'. |
| Firm facts in the repo: AMB Advisory Services LLC; ambadvisoryservices.com; info@ambadvisoryservices.com; 813.364.2178; Tampa, Florida. Contact 'Frank' (.env.example), with frank@ambadvisoryservices.com in .env.example only. 'Frank Moneymaker, Principal' appears only in test fixtures, and the title is an open question (HOUSE_STYLE Q6). No street address, PO box or postal address exists anywhere in the repo. | high | amb-material-bot/docs/HOUSE_STYLE.md §1.4 and §6 Q6; src/cim/sections/transaction.ts:140-144; .env.example; tests/cim-deck.test.ts:30; repo-wide grep | Add required env vars (e.g. AMB_POSTAL_ADDRESS, sender name and address on the sending domain) and make send refuse to run while the postal address is blank (CAN-SPAM requires a valid physical postal address; FTC guide https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business). |
| Industries in references/ by file and folder name: laundromat; commercial real estate / retail plaza with tenant leases; HOA / community association management; accounting firms / bookkeeping and an accounting-software company. Others (CPM, Forth Group, Coral, Optimum, Skelly) are not inferable. Names suggest mostly buy-side or investor diligence work (Investor Dataroom, Acquisition Opportunity Report, Pre-LOI, LOI/Offer). HVAC/plumbing (Project Ridgeline) and dental lab (Project Crown) are fictional samples. | medium | /home/user/PROJECT-AVENGERS/references/ directory listing; references/README.md; amb-material-bot/README.md; requests/high-priority-requests.csv:3 | Email copy must not claim past sell-side deals in HVAC, landscaping or dental, or name any client; credibility lines need Frank's approval to avoid false claims. |
| Root setup.sh and setup.bat are hard-wired to amb-material-bot (cd into it, npm install, copy .env.example to .env, copy the sample request list, npm run demo, open folders). The root README has a section table (Section / What it does / Status) with one row and an 'Adding a section' rule: own README, package.json and tests, and ignore output/, deals/, .env and credential files. | high | /home/user/PROJECT-AVENGERS/setup.sh; setup.bat; README.md | Register the section by adding a README table row with an honest status, and add a second block to both setup scripts (subshell cd on sh; cd /d "%~dp0seller-lead-engine" on bat) running npm install, copying .env.example and running npm run demo. |
| .env.example style: header 'Copy to .env and fill in. Never commit .env.'; each variable block explains what it does and what happens when blank; firm settings namespaced AMB_* (AMB_FIRM_NAME, AMB_CONTACT_NAME, AMB_CONTACT_EMAIL, AMB_CONTACT_PHONE, optional AMB_CLAUDE_MODEL). | high | amb-material-bot/.env.example | seller-lead-engine/.env.example should reuse the AMB_* firm variables and add sending-domain, sender, postal-address and daily-volume-cap variables in the same commented style. |
