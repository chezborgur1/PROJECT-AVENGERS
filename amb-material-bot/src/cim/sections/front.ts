// S0 Front matter (guide 3.3, 2.9): cover, Disclaimer & Confidentiality
// Notice, Contents. The disclaimer is ICP1's text verbatim (guide 2.9; counsel
// sign-off is open question Q5).

import { monthYear } from "../../util/format.ts";
import type { CimContext } from "../context.ts";
import type { Slide } from "../design.ts";
import { BAND, C, colX, CONTENT_W, drawContents, drawCover, drawFooter, hline, run, SANS, SERIF, spanW, text } from "../design.ts";
import type { PageModule, SectionModule } from "./types.ts";

/** ICP1's intro and six headed paragraphs (references: AMB Advisory - ICP Template v1.docx), verbatim. */
export const DISCLAIMER_INTRO =
  'This Confidential Information Memorandum ("CIM") has been prepared by AMB Advisory Services LLC ("AMB Advisory" or "Broker") on behalf of the seller identified herein ("Seller") solely for the purpose of providing preliminary information to prospective purchasers ("Recipient") regarding a potential acquisition of the business described in this document (the "Company").';

export const DISCLAIMER: { head: string; body: string }[] = [
  {
    head: "No Representation or Warranty",
    body: "This CIM has been prepared from information provided by the Seller and from other sources believed to be reliable. Neither AMB Advisory nor the Seller makes any representation or warranty, express or implied, as to the accuracy or completeness of this CIM or any of its contents. All projections, estimates, and forward-looking statements contained herein reflect assumptions and judgments that may or may not prove correct. No reliance should be placed on the information contained in this CIM for the purpose of making any investment or financial decision.",
  },
  {
    head: "Confidentiality Obligations",
    body: "By accepting this CIM, the Recipient acknowledges that (i) all information contained herein is confidential and proprietary; (ii) the Recipient will use this CIM solely to evaluate a potential transaction with the Company; (iii) the Recipient will not reproduce, copy, or distribute this CIM or any portion thereof without the prior written consent of AMB Advisory; and (iv) the Recipient will maintain the confidentiality of all information herein with at least the same degree of care used to protect its own confidential information.",
  },
  {
    head: "No Offer or Solicitation",
    body: "This CIM does not constitute an offer to sell or a solicitation of an offer to buy any security or business interest. Any offer or solicitation will be made only by means of a definitive purchase agreement and related transaction documents, which will supersede all prior representations, warranties, and agreements made in connection with this CIM.",
  },
  {
    head: "Broker Disclosure",
    body: "AMB Advisory Services LLC is acting as exclusive business broker and/or M&A advisor to the Seller in connection with this potential transaction. AMB Advisory represents the Seller's interests and does not represent the Recipient or any prospective purchaser. AMB Advisory's compensation is contingent upon the successful closing of a transaction and is paid by the Seller.",
  },
  {
    head: "Third-Party Information and Financial Data",
    body: "Financial statements and supporting data included in this CIM have been provided by the Seller and have not been independently verified or audited by AMB Advisory. Recipients are encouraged to conduct their own independent due diligence, including review of financial records by a qualified accountant, prior to making any investment decision. Past financial performance is not indicative of future results.",
  },
  {
    head: "Return of Information",
    body: "If the Recipient elects not to pursue a transaction with the Company, the Recipient agrees to promptly return or destroy all copies of this CIM and any related materials upon request by AMB Advisory. The confidentiality obligations set forth herein shall survive any such return or destruction.",
  },
];

/** Two columns of 8 pt text with maroon bold subheads (guide 2.9), title verbatim as ICP1. */
function drawDisclaimer(slide: Slide, code: string, num: number): void {
  slide.background = { color: C.white };
  text(slide, "Disclaimer & Confidentiality Notice", { x: colX(1), y: BAND.titleY, w: CONTENT_W, h: BAND.titleH, fontFace: SERIF, fontSize: 20, bold: true, color: C.maroon, valign: "bottom" });
  hline(slide, colX(1), BAND.ruleY, CONTENT_W, C.maroon, 0.75);
  const w = spanW(1, 6);
  const para = (items: { head?: string; body: string }[]) =>
    items.flatMap((p, i) => [
      ...(p.head ? [run(p.head, { bold: true, color: C.maroon, fontSize: 8, breakLine: true })] : []),
      run(p.body, { color: C.ink, fontSize: 8, breakLine: i < items.length - 1 }),
    ]);
  const left = [{ body: DISCLAIMER_INTRO }, ...DISCLAIMER.slice(0, 3)];
  const right = DISCLAIMER.slice(3);
  text(slide, para(left), { x: colX(1), y: BAND.top, w, h: 5.2, fontSize: 8, valign: "top", paraSpaceAfter: 6, lineSpacingMultiple: 1.1, fontFace: SANS });
  text(slide, para(right), { x: colX(7), y: BAND.top, w, h: 5.2, fontSize: 8, valign: "top", paraSpaceAfter: 6, lineSpacingMultiple: 1.1, fontFace: SANS });
  drawFooter(slide, code, undefined, num);
}

const cover: PageModule = {
  id: "S0.1",
  name: "Cover",
  status: "A",
  absent: () => undefined,
  budget: [1, 1],
  build: (ctx: CimContext) => [
    {
      id: "S0.1",
      kind: "furniture",
      exhibits: [],
      carries: [],
      draw: (_deck, slide) => drawCover(slide, { codename: ctx.code, date: monthYear(ctx.date), city: "Tampa, Florida", web: "ambadvisoryservices.com" }),
    },
  ],
};

const disclaimer: PageModule = {
  id: "S0.2",
  name: "Disclaimer & Confidentiality Notice",
  status: "A",
  absent: () => undefined,
  budget: [1, 1],
  build: (ctx) => [{ id: "S0.2", kind: "furniture", exhibits: [], carries: [], draw: (_d, slide, num) => drawDisclaimer(slide, ctx.code, num) }],
};

const contents: PageModule = {
  id: "S0.3",
  name: "Contents",
  status: "A",
  absent: () => undefined,
  budget: [1, 1],
  build: (ctx) => [{ id: "S0.3", kind: "furniture", exhibits: [], carries: [], draw: (_d, slide, num, toc) => drawContents(slide, ctx.code, toc.sections, num) }],
};

export const S0: SectionModule = { id: "S0", name: "Front matter", front: true, pages: [cover, disclaimer, contents] };
