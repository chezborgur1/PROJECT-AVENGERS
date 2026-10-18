# Legal and compliance rules for the AMB seller lead engine (researched 2026-10-18)

## How this was researched, and its limits
- **WebFetch did not work in this session.** Every domain failed DNS (ftc.gov, ecfr.gov, law.cornell.edu, federalregister.gov, leginfo.legislature.ca.gov, and even a vendor blog). Curl through the proxy was refused with a 403. So I could not open primary sources and read their full text.
- **What I relied on instead:** WebSearch, mostly restricted to primary domains (ftc.gov, ecfr.gov, govinfo.gov, federalregister.gov, cppa.ca.gov, privacy.ca.gov, crtc.gc.ca, ilga.gov, state legislature sites). It returns snippets and summaries of those pages.
- **How to read the citations:** Where a point rests on secondary commentary or on my own background knowledge, I say so. Statutory wording quoted below comes from search snippets of the primary page, not from a full read.
- **Before launch:** a lawyer should check the items marked "verify". This is research, not legal advice.

---

## 1. CAN-SPAM (15 U.S.C. 7701-7713; 16 CFR Part 316)

**Scope: B2B is covered.** The FTC says "The law makes no exception for business-to-business email." What matters is the message's "primary purpose." A cold email offering a free exit-readiness check from an M&A advisor is a commercial message. ([FTC Compliance Guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business); [16 CFR 316.3 via 2008 FR notice](https://www.ftc.gov/sites/default/files/documents/federal_register_notices/definitions-and-implementation-under-can-spam-act-16-cfr-part-316/080521canspamact.pdf))

**Cold email is lawful in the US.** CAN-SPAM is an opt-out regime. It does not require prior consent for commercial email to ordinary addresses. The one exception is mobile-carrier addresses, covered at the end of this section. (FTC guide above)

### Requirements the code must enforce

**1. Header accuracy (7704(a)(1))**
- No materially false or misleading header information. This applies to commercial and transactional messages alike.
- A From line "that accurately identifies any person who initiated the message" is safe.
- Headers that are technically accurate still count as misleading if access to the sending address or domain was "obtained by means of false or fraudulent pretenses."
- "Materially" means altered or concealed in a way that would impair the ability of an ISP, a complainant or law enforcement to identify or locate the sender.
- The FTC says the From line need not carry the full legal name, but it must give recipients enough information to identify the sender.
- Sources: [15 U.S.C. 7704 (Cornell)](https://www.law.cornell.edu/uscode/text/15/7704); [GovInfo USC 2023](https://www.govinfo.gov/content/pkg/USCODE-2023-title15/html/USCODE-2023-title15-chap103-sec7704.htm); [2008 FTC rule](https://www.govinfo.gov/content/pkg/FR-2008-05-21/pdf/E8-11394.pdf)

**2. Criminal rule for sending domains (18 U.S.C. 1037(a)(4))**
- It is a crime to register 5 or more email accounts, or 2 or more domain names, using information that materially falsifies the registrant's identity, and then intentionally send multiple commercial emails from them.
- "Multiple" means more than 100 messages in 24 hours, more than 1,000 in 30 days, or more than 10,000 in a year.
- So the separate sending domains must be registered truthfully to AMB. Whether WHOIS privacy proxies are acceptable: verify.
- Source: [18 U.S.C. 1037 (Cornell)](https://www.law.cornell.edu/uscode/text/18/1037); [uscode.house.gov](https://uscode.house.gov/view.xhtml?req=%28title%3A18+section%3A1037+edition%3Aprelim%29)

**3. No deceptive subject lines (7704(a)(2))**
- The subject line must not mislead a recipient about the content or subject matter of the message. ([FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business))

**4. Identify the message as an ad**
- The message must clearly and conspicuously disclose that it is an advertisement or solicitation. "The law gives you a lot of leeway in how to do this."
- The exception for recipients who gave affirmative consent does not apply to cold outreach. (FTC guide; the 7704(a)(5)(A)(i) pinpoint is from my own knowledge, verify.)

**5. Valid physical postal address (16 CFR 316.2(p))**
- Three options qualify:
  - the sender's current street address;
  - a Post Office box the sender has *accurately registered* with USPS;
  - a private mailbox *accurately registered* with a CMRA (commercial mail receiving agency) established under USPS regulations.
- A box that is misidentified on the USPS form, or registered without the required ID, does not count.
- The FTC has also said the address must not be shown in "micro print."
- Sources: [eCFR 316.2](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-316/section-316.2); [2008 FR E8-11394](https://www.govinfo.gov/content/pkg/FR-2008-05-21/pdf/E8-11394.pdf)

**6. Opt-out mechanism (7704(a)(3))**
- Each message needs a functioning return email address or other Internet-based opt-out mechanism, "clearly and conspicuously displayed."
- It must stay able to process opt-outs for **at least 30 days after the message is sent**.
- A menu of choices is allowed, but it must include an option to stop all commercial email from the sender. (The menu point is from my own knowledge of 7704(a)(3)(B), verify.)
- Sources: [Cornell 7704](https://www.law.cornell.edu/uscode/text/15/7704); [FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

**7. Honor opt-outs within 10 business days (7704(a)(4))**
- Neither the sender nor anyone acting on its behalf may send to a recipient more than 10 business days after the request.
- The FTC considered 3 days and kept 10. ([2008 FTC rule](https://www.govinfo.gov/content/pkg/FR-2008-05-21/pdf/E8-11394.pdf))
- Gmail separately expects bulk senders to process unsubscribes within **2 days**. ([Google blog](https://blog.google/products/gmail/gmail-security-authentication-spam-protection/))

**8. No conditions on opting out (16 CFR 316.5)**
- "You can't charge a fee, require the recipient to give you any personally identifying information beyond an email address, or make the recipient take any step other than sending a reply email or visiting a single page on an Internet website." ([FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business))

**9. No sale or transfer of opted-out addresses (7704(a)(4)(A)(iv))**
- Selling, leasing, exchanging, transferring or releasing the address of anyone who opted out is prohibited.
- The exception for complying with the law is from my own knowledge; verify.
- Source: [2005 FTC FR notice](https://www.ftc.gov/sites/default/files/documents/federal_register_notices/definitions-and-implementation-under-can-spam-act-16-cfr-part-316/050119canspamact.pdf)

**10. Vendor liability**
- "Even if you hire another company to handle your email marketing, you can't contract away your legal responsibility to comply with the law."
- If a message promotes several marketers, they may designate one sender, under conditions.
- Source: [FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

**11. Aggravated violations (7704(b))**
These let courts triple damages in suits by state attorneys general or ISPs. They are:
- **Address harvesting:** automated collection from a website whose operator has a notice saying it will not transfer addresses.
- **Dictionary attacks:** generated permutations such as asmith, bsmith, csmith.
- Automated creation of multiple email accounts.
- Relaying through unauthorized access.

Implications for enrichment: do not mass-mail guessed address patterns, and do not scrape sites that have a no-transfer notice. Sources: [Cornell 7704](https://www.law.cornell.edu/uscode/text/15/7704); [2008 FR](https://www.govinfo.gov/content/pkg/FR-2008-05-21/pdf/E8-11394.pdf#page=24); [FDIC manual](https://fdic.gov/regulations/compliance/manual/8/VIII-4.1.pdf)

**12. Mobile-carrier addresses (CAN-SPAM s.14; 47 CFR 64.3100)**
- Commercial email to carrier wireless domains (the FCC's MSCM list, such as SMS gateway domains) needs **express prior authorization**.
- There is a 30-day safe harbor after a domain is listed.
- The FCC tells senders to check the list routinely.
- Sources: [47 CFR 64.3100](https://www.law.cornell.edu/cfr/text/47/64.3100); [FCC domain list page](https://www.fcc.gov/cgb/policy/domain-name-input)

**13. Penalties in 2026 dollars**
- Up to **$53,088 per violating email**. This is the FTC's 2025 inflation-adjusted figure, in effect from 17 January 2025 ([FTC press release](https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-publishes-inflation-adjusted-civil-penalty-amounts-2025); [90 FR, 2025-01361](https://www.federalregister.gov/documents/2025/01/17/2025-01361/adjustments-to-civil-penalty-amounts); [16 CFR 1.98](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-A/part-1/subpart-L/section-1.98)).
- On 15 September 2026 the FTC announced **no 2026 adjustment**: OMB Memo M-26-11 cancelled it because the BLS could not produce October 2025 CPI-U data. So $53,088 still applies today. ([91 FR 58446, 2026-18853](https://www.federalregister.gov/documents/2026/09/15/2026-18853/civil-penalty-inflation-adjustments); [GovInfo](https://www.govinfo.gov/content/pkg/FR-2026-09-15/html/2026-18853.htm))

---

## 2. State anti-spam laws that still apply

**How preemption works (15 U.S.C. 7707).** CAN-SPAM overrides state laws that expressly regulate commercial email, *except* where they prohibit "falsity or deception." The 4th Circuit (*Omega World Travel*) and the 9th Circuit (*Gordon v. Virtumundo*) read that exception narrowly, as reaching material fraud or deception. ([Cornell Wex](https://law.cornell.edu/wex/inbox/can-spam_act_preemption); [Gordon](https://www.law.cornell.edu/wex/inbox/gordon))

**California B&P 17529.5**
- Prohibits three things:
  - (a)(1) third-party domain names used without permission;
  - (a)(2) falsified or misrepresented header information;
  - (a)(3) a subject line the person knows would likely mislead a reasonable recipient about a material fact.
- Liquidated damages are **$1,000 per email**. A court can reduce this to $100 per email (capped at $100,000 per incident) if the sender implemented due-care practices.
- *Hypertouch v. ValueClick* (Cal. Ct. App. 2011) held it is not preempted and that **advertisers are strictly liable** even if they did not send the email.
- Litigation picked up in 2025-2026, for example *Pottish v. WhaleCo* (Temu), removed in May 2026.
- I could not open the official statute text (leginfo was unreachable). The sources are a secondary text and commentary: [california.public.law 17529.5](https://california.public.law/codes/ca_bus_and_prof_code_section_17529.5); [Goldman on Hypertouch](https://blog.ericgoldman.org/archives/2011/01/hypertouch_v_valueclick.htm); [BIPC](https://www.bipc.com/rising-litigation-under-californias-anti-spam-act-what-commercial-senders-need-to-know).
- **Due care matters:** the due-care reduction is a reason to keep written compliance procedures and template review logs.
- The broader California ban on unsolicited email (B&P 17529.2) has been held preempted in federal court, per *Facebook v. ConnectU*, N.D. Cal. 2007, as summarized by [Proskauer](https://privacylaw.proskauer.com/2007/07/articles/canspam/canspam-preempts-california-antispam-laws/). That case may have concerned other sections; verify.

**Washington CEMA (RCW 19.190)**
- *Brown v. Old Navy* (Wash. 17 April 2025, 5-4) held that CEMA bars *any* false or misleading information in a commercial email subject line, including false urgency. Damages were $500 per email, and more than 100 suits followed. ([WA Sup. Ct. opinion](https://www.courts.wa.gov/opinions/pdf/1025921.pdf); [K&L Gates](https://www.klgates.com/Washington-Supreme-Court-Increases-Risks-of-Lawsuits-for-False-or-Misleading-Email-Subject-Lines-8-7-2025))
- **ESHB 2274** (signed 23 March 2026, effective 11 June 2026) added a knowledge standard ("actual knowledge or knowledge fairly implied on the basis of objective circumstances") and cut damages to **$100 per violation**, for suits filed on or after 11 June 2026. ([Morgan Lewis](https://www.morganlewis.com/pubs/2026/06/washington-legislature-narrows-state-anti-spam-law-after-retail-litigation-surge); [Cooley](https://www.cooley.com/news/insight/2026/2026-06-09-washingtons-cema-amendments-take-effect-june-11-what-consumer-facing-companies-should-know))

**What this means for subject lines.** Use only literally true subject lines, chosen from a pre-approved list:
- no fake "Re:" or "Fwd:";
- no invented buyer interest or deadlines;
- no implied prior relationship.

---

## 3. Recipients outside the US: exclude them

**Canada (CASL)**
- CASL is opt-in. A commercial electronic message needs consent (express or implied) plus sender identification and an unsubscribe mechanism.
- The closest implied-consent route is "conspicuous publication," s.10(9)(b). It requires all three of:
  - the recipient published, or caused publication of, the address;
  - there was no statement declining unsolicited messages;
  - the message is relevant to the recipient's business role.
- The CRTC says this is "a higher standard than the simple public availability" of an address. Addresses republished by third parties, which covers most data vendors, do not qualify.
- The sender bears the burden of proving consent. In *Blackstone* (CRTC 2016-428), general claims that addresses were publicly available failed.
- Sources: [CRTC implied consent guidance](https://crtc.gc.ca/eng/com500/guide.htm); [ISED](https://ised-isde.canada.ca/site/canada-anti-spam-legislation/en/getting-consent-send-email); [CRTC 2016-428](https://crtc.gc.ca/eng/archive/2016/2016-428.htm)
- Penalties of up to C$10M per violation for organizations are from my own knowledge, not a retrieved source; verify against the Act at [laws-lois.justice.gc.ca](https://laws-lois.justice.gc.ca/eng/acts/e-1.6/page-2.html).

**EU and UK (GDPR, ePrivacy/PECR)**
- GDPR Article 3(2) reaches non-EU controllers that offer goods or services to people in the EU. An in-scope controller generally also needs an EU representative (Art. 27). ([Art. 3 text](https://gdpr-info.eu/art-3-gdpr/); [EDPB Guidelines 3/2018](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf))
- Emailing EU or UK owners would bring in GDPR, ePrivacy Art. 13 and PECR. None of that is needed for a US Main Street engine.

**How to exclude them in code (default deny):**
- Send only when **all** of these are true:
  - the business address country is US (from the state filing record or Places country);
  - the business state is on the list of approved target states;
  - the email domain's TLD is not a non-US ccTLD (.ca, .uk, .co.uk, EU member TLDs, and so on);
  - any phone number is +1 with a **US** area code. The NANP shares +1 with Canada and the Caribbean, so keep a list of Canadian and Caribbean area codes (for example 204, 226, 250, 289, 306, 403, 416, 438, 514, 519, 587, 604, 613, 647, 705, 778, 780, 819, 902, 905) and reject them.
- If any of these is unknown, do not send.
- Record which source supplied the jurisdiction decision.

---

## 4. Laws on disclosing that an AI is writing the emails

**California BOT Act (B&P 17940-17943)**
- It is unlawful to use a bot to communicate with a person in California online with intent to mislead them about the bot's artificial identity in order to incentivize a sale or influence a vote. A clear, conspicuous disclosure that it is a bot is a complete defense.
- Its reach is debated. The original "online platform" definition used a threshold of 10 million or more monthly US visitors. Email may not count as "online," but this is unverified.
- **AB 410** would require bots to answer truthfully when asked whether they are a bot. It stalled on the Senate suspense file on 29 August 2025, and I found no enactment.
- Sources: [17941 text](https://california.public.law/codes/ca_bus_and_prof_code_section_17941); [AB 410 status](https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB410)

**Utah AI Policy Act (SB 149 of 2024, amended by SB 226 and SB 332 in 2025, effective 7 May 2025, sunset July 2027)**
- Disclosure is required when a consumer clearly asks, or proactively in "high-risk" interactions. High-risk includes collecting financial data and giving personalized financial advice that someone could rely on for significant decisions.
- Revenue, valuation and timeline questions arguably fall in that category.
- **Safe harbor:** disclosing clearly and conspicuously at the outset that the AI is nonhuman.
- Under the 2024 Act, the fact that generative AI made a statement was **not a defense** to a consumer-protection violation (Utah Code 13-2-12). That section shows as repealed 7 May 2025, apparently moved into 13-75; verify.
- Sources: [FPF](https://fpf.org/blog/chatbots-in-check-utahs-latest-ai-legislation/); [Perkins Coie](https://perkinscoie.com/insights/update/new-utah-ai-laws-change-disclosure-requirements-and-identity-protections-target); [Utah Code 13-2-12](https://le.utah.gov/xcode/Title13/Chapter2/C13-2-S12_2024050120240501.pdf)

**Maine (10 M.R.S. §1500-DD, PL 2025 c.294)**
- A business may not use a chatbot in trade or commerce where a reasonable consumer could be misled into thinking they are dealing with a human, unless it gives clear and conspicuous notice. Violations fall under the Maine UTPA.
- Source: [Maine statute](https://legislature.maine.gov/statutes//10/title10sec1500-DD.html)

**Colorado**
- SB 24-205 was delayed to 30 June 2026 and then **repealed and replaced by SB 26-189** (signed 14 May 2026, effective 1 January 2027). The new law dropped the general disclosure for any AI interaction.
- What remains covers automated decision-making in "consequential decisions" (employment, lending, housing and similar). Lead scoring of business sellers does not appear to be covered.
- Enforcement is stayed by a federal court order of 27 April 2026, pending AG rulemaking.
- Sources: [Eckert Seamans](https://www.eckertseamans.com/legal-updates/colorado-repeals-and-replaces-its-landmark-ai-statute-what-businesses-need-to-know); [Arnold & Porter](https://www.arnoldporter.com/en/perspectives/advisories/2026/07/colorado-narrows-its-ai-law-but-the-ftc-says-thats-not-enough); [JD Supra](https://www.jdsupra.com/legalnews/colorado-rewrites-its-landmark-ai-law-9230800/)

**Other 2025-2026 state laws (secondary tracker)**
- These are mostly about companion chatbots and are not directly on point: CA SB 243, WA HB 2225, ID S 1297, OR SB 1546 (signed March 2026, $1,000 statutory damages) and NY GBL Art. 47.
- Source: [Orrick 2026 chatbot laws](https://www.orrick.com/en/Insights/2026/04/2026-State-Chatbot-Laws-Key-Provisions-and-Regulatory-Trends)

**FTC**
- The Impersonation Rule (16 CFR 461, 2024) covers impersonating government agencies and businesses.
- The proposed extension to impersonating individuals has not been finalized. The October 2026 advance notice focuses on ad platforms; comments are due 30 November 2026.
- The FTC's stance is that there is "no AI exemption from the laws on the books": Section 5 deception applies. See its action against Air AI over false "conversational AI" claims.
- Sources: [FR 2026-20143](https://www.federalregister.gov/documents/2026/10/01/2026-20143/rule-on-impersonation-of-government-and-businesses); [FTC AI page](https://www.ftc.gov/industry/technology/artificial-intelligence); [Air AI](https://www.ftc.gov/news-events/news/press-releases/2025/08/ftc-sues-stop-air-ai-using-deceptive-claims-about-business-growth-earnings-potential-refund)

**What I recommend (prudence, not a clear legal mandate)**
- The named sender should be a real AMB person.
- AI-drafted replies should carry a short line such as "I use an AI assistant to help manage replies; [Name] reviews every valuation."
- The AI must always answer truthfully if asked whether it is a person.
- A human should approve any message with valuation numbers, fee terms or legal or licensing statements.
- Never invent a human persona.

---

## 5. State privacy laws

**CCPA/CPRA**
- The B2B and employee-data exemptions expired on **1 January 2023**, so owner contact data of California residents is personal information. ([Maynard Nexsen](https://www.maynardnexsen.com/news-hr-and-b2b-exemptions-under-california-privacy-law-expiring-enforcement-heats-up))
- A company is a covered "business" only if it meets one of three tests ([CPPA thresholds](https://cppa.ca.gov/regulations/cpi_adjustment.html); [CPPA FAQ](https://cppa.ca.gov/faq.html)):
  - annual gross revenue of $26,625,000 or more (2025 figure, indexed in odd years);
  - buys, sells or shares personal information of 100,000 or more California consumers or households;
  - **derives 50% or more of annual revenue from selling or sharing personal information**.
- AMB probably meets none of these today. **But if lead sales to partner brokers become half of revenue, CCPA applies regardless of size.**
- Age is personal information (a protected-classification category). To my knowledge it is not "sensitive personal information" under 1798.140(ae); verify.
- Inferences such as an estimated age are personal information and must be disclosed on a right-to-know request. ([CA AG Op. 20-303 summary](https://www.wilmerhale.com/en/insights/blogs/WilmerHale-Privacy-and-Cybersecurity-Law/20220316-california-office-of-the-attorney-general-clarifies-what-constitutes-an-inference-under-the-ccpa))

**Other states' comprehensive privacy laws**
- Laws like Virginia's and Colorado's generally exclude people acting in a commercial or employment context from the definition of "consumer." That is my background knowledge; I could not confirm the statute text ([Va. Code 59.1-575](https://law.lis.virginia.gov/vacodeupdates/title59.1)).
- That would make California the main state privacy law reaching B2B owner data.

**Data broker registration**

| State | Who is covered | Requirements and penalties | Sources |
|---|---|---|---|
| **California (Delete Act, Civ. Code 1798.99.80)** | A CCPA "business" that knowingly collects and sells personal information of consumers it has no direct relationship with | Register by 31 January. From **1 August 2026**, check the DROP platform at least every 45 days and delete matching data, including inferences. $200 per day per unprocessed request. First enforcement: LocateSmarter, $116,490. | [privacy.ca.gov DROP](https://privacy.ca.gov/drop-for-data-brokers/); [enforcement](https://privacy.ca.gov/2026/08/calprivacy-brings-first-action-against-a-data-broker-under-both-the-ccpa-and-delete-act/) |
| **Vermont (9 V.S.A. 2430/2446)** | Current law excludes publicly available information "to the extent it is related to a consumer's business or profession" | $100 fee, $50 per day penalty. **Act 138 (H.211, signed 16 June 2026, effective 1 January 2027)** raises the fee to $900, narrows the direct-relationship carve-out and adds recipient due diligence; it may also add a $20,000 bond. | [VT SOS](https://sos.vermont.gov/node/228); [Act 138](https://ljfo.vermont.gov/assets/Publications/2025-2026-House-Bills/H.211-An-act-relating-to-data-brokers-As-enacted.pdf); [Sheppard](https://www.sheppard.com/insights/blogs/vermont-amends-data-broker-law) |
| **Texas (Bus. & Com. Code ch. 509, as amended by SB 2121 in 2025)** | Brokers of indirectly sourced data that, in 12 months, earn more than 50% of revenue from such data **or** earn revenue from such data on more than 50,000 individuals | $300 annual registration, website notice, security program, up to $100 per day | [SB 2121](https://capitol.texas.gov/tlodocs/89R/billtext/html/SB02121F.htm); [Cozen](https://cozen.com/news-resources/publications/2024/new-data-broker-laws-in-texas-and-oregon) |
| **Oregon (ORS 646A.593)** | Brokers collecting, selling or licensing brokered personal data of Oregon residents | Register with DCBS/DFR before doing so. The fee is not confirmed (the $600 figure is unverified). A $10,000 penalty was proposed in December 2025. | [ORS 646A.593](https://oregon.public.law/statutes/ors_646a.593) |

**What this means for the design**
- Keep lead sales below the thresholds, or plan to register.
- Store estimated age only as an internal band, with its source and a confidence level.
- Never put age in outbound emails or in leads sold to partners.
- Build delete and right-to-know handling now.

---

## 6. Business broker licensing

**States requiring a real estate license or registration.** Secondary lists name about 16-17 states requiring a real estate license, plus Illinois registration: AK, AZ, CA, CO, FL, GA, ID, MN, NE, NV, OR (only when real estate transfers), SD, UT, WA, WI, WY, and IL (registration). These lists conflict and none comes from a regulator. ([BizBuySell](https://www.bizbuysell.com/learning-center/article/business-broker-licenses-certifications/); [Wikipedia compilation](https://en.wikipedia.org/wiki/Business_broker))

**California**
- B&P 10131(a) defines a broker to include anyone who "solicits prospective sellers or purchasers of" a "business opportunity" for compensation. B&P 10030 defines business opportunity to include the sale of a business and its goodwill.
- DRE desist-and-refrain orders apply 10131(a) to unlicensed business brokers.
- B&P 10137 bars licensees from paying unlicensed people for licensed acts.
- The judicial "finder" exception (*Tyrone v. Kelley*) covers mere introductions only, and nothing more.
- Sources: [DRE order 2021](https://www2.dre.ca.gov/hearingfiles/H03382FR_210921_P.pdf); [CalCorpLaw](https://www.calcorporatelaw.com/2013/10/ma-brokers-what-about-george-babbitt); [CA AG Op. 94-909](https://www.oag.ca.gov/system/files/opinions/pdfs/94-909.pdf)

**Florida**
- Fla. Stat. 475.01 defines a broker to include someone who, for compensation, deals in "business enterprises" or "business opportunities" for others, including someone who "directs or assists in the procuring of prospects."
- 475.25(1)(h) bars sharing compensation with unlicensed persons, with only a $50 tenant-referral exception.
- Sources: [Fla. Stat. 475.01](https://florida.public.law/statutes/fla._stat._475.01); [Florida Realtors](https://www.floridarealtors.org/law-ethics/library/commission)

**Illinois**
- The Business Brokers Act (815 ILCS 307/10-10) requires registration with the Secretary of State for anyone engaged in business brokering. It applies when the client is domiciled in Illinois.
- Source: [ILGA 307/10-10](https://www.ilga.gov/legislation/ilcs/documents/081503070K10-10.htm)

**Do flat per-lead fees avoid licensing? Not by themselves.**
- In California and Florida, the *activity* itself (soliciting sellers or procuring prospects for compensation) is what is licensed. Fees not tied to closings help the "finder" or advertising argument, but they are not a safe harbor.
- The only regulator guidance I found on lead-generation companies is from British Columbia. It treats selling leads as licensed activity "regardless" of fee structure. ([BCFSA](https://www.bcfsa.ca/industry-resources/real-estate-professional-resources/knowledge-base/guidelines/referrals-guidelines))
- The plan's licensing claim is therefore only partly supported. AMB should get state-specific legal review before selling leads, and should either hold a license in the seller's state or have the partner broker (licensed there) do all soliciting and negotiating.

**Federal M&A broker exemption (Exchange Act 15(b)(13), 15 U.S.C. 78o(b)(13); in the Consolidated Appropriations Act 2023; effective 29 March 2023)**
- It exempts M&A brokers from SEC registration when they effect securities transfers of an "eligible privately held company": no registered securities or reporting obligations, and **EBITDA under $25M or gross revenue under $250M** in the fiscal year before engagement.
- The broker must reasonably believe the buyer will control the company and be actively involved in managing it.
- The exemption is lost if the broker:
  - receives, holds, transmits or takes custody of funds or securities;
  - has authority to bind a party;
  - engages in a public offering;
  - is barred or suspended.
- The shell-company, financing, 25%-control and group-of-buyers conditions come from my own knowledge of the statute and were not confirmed by the sources; verify.
- **It does not preempt state securities or broker law.** States vary on adopting the NASAA model rule.
- It only matters for stock or merger deals. Asset sales of Main Street businesses are generally not securities transactions.
- Sources: [Gordon Rees](https://www.grsm.com/insight/codified-ma-broker-exemption-effective-on-march-29-2023/); [Jones Day](https://jonesday.com/en/insights/2023/01/new-law-exempts-ma-brokers-from-sec-registration); [Goodwin](https://goodwinlaw.com/en/insights/publications/2023/01/01_27-new-federal-ma-broker-exemption); [Cornell 78o](https://www.law.cornell.edu/uscode/text/15/78o)

---

## 7. Phone and text (TCPA): keep the engine email-only

- **Damages:** $500 per violation under 47 U.S.C. 227(b)(3) (autodialer or prerecorded calls and texts), trebled to up to $1,500 if willful or knowing. Do-not-call violations under 227(c)(5) carry the same amounts. ([Cornell 227](https://www.law.cornell.edu/uscode/text/47/227); [FCC TCPA rules](https://www.fcc.gov/sites/default/files/tcpa-rules.pdf))
- **No B2B safe harbor for cell phones.** The DNC registry protects residential subscribers. Small-business owners often use personal cell phones, and there is no B2B exemption for autodialed or prerecorded calls or texts to wireless numbers (secondary source).
- **One-to-one consent rule:** the FCC's rule was vacated by the 11th Circuit on 24 January 2025, but existing consent duties remain. ([MoFo](https://mofo.com/resources/insights/250130-eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule))
- **State "mini-TCPAs":** Florida FTSA 501.059 (amended 2023) and Oklahoma's 2022 Act each carry $500 statutory damages. ([McGuireWoods](https://www.mcguirewoods.com/client-resources/alerts/2023/5/pro-business-amendments-to-floridas-mini-tcpa-now-in-effect); [Benesch](https://www.beneschlaw.com/insight/new-oklahoma-mini-tcpa-law-set-to-go-into-effect-in-november/))
- **Design:** no SMS, no voice and no ringless voicemail tooling. Phone numbers are shown only to a human broker, who makes manual calls after a DNC check, and only to sellers who replied.

---

## 8. Non-statutory constraints that can stop the engine

**Google Cloud/Workspace Acceptable Use Policy and Gmail program policies**
- They prohibit using the services for spam, including "unsolicited mass email." Gmail also prohibits sending in violation of CAN-SPAM, and Google may suspend accounts.
- Running cold outreach from Workspace mailboxes through the Gmail connector risks suspension. Keep volume low and messages one-to-one and personalized, or use a dedicated sending provider whose terms allow cold B2B email.
- Sources: [Google Cloud AUP](https://workspace.google.com/terms/use_policy/); [Gmail program policies](https://support.google.com/mail/answer/16734397?hl=en-GB)

**Gmail sender requirements**
- SPF, DKIM and DMARC are required, with From-domain alignment.
- Keep the user-reported spam rate below 0.1% and never at or above 0.3%.
- Bulk senders (around 5,000 or more messages a day to Gmail) must support RFC 8058 one-click unsubscribe. A mailto link in the body does not satisfy this.
- Sources: [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en); [FAQ](https://support.google.com/mail/answer/14229414?hl=en)

**Google Maps Platform terms**
- Places content may not be cached or stored, except place IDs. Persisting place names outside the session counts as "scraping."
- So keep the Places place_id, and source business name and address from state filings, or re-fetch them.
- Sources: [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies); [Maps service terms](https://cloud.google.com/maps-platform/terms/maps-service-terms)

**FTC "Free" Guide (16 CFR 251)**
- Any conditions on the free exit-readiness check must be stated clearly at the outset. Calling it a "gift" or "bonus" does not cure a deceptive offer.
- The valuation must be labeled a rough, non-binding estimate, not an appraisal.
- Source: [16 CFR 251.1](https://www.law.cornell.edu/cfr/text/16/251.1)

---

## 9. Rules the code must implement

1. **Suppression check at send time, not when queued.** Do it in the same transaction as the send, across all sending domains and mailboxes. Match on normalized email; optionally also suppress by company domain and by person ID. If the check fails or the store is unreachable, do not send.
2. **Opt-out intake**
   - The unsubscribe link goes to one page with no login and no fields beyond the email, preferences optional.
   - Add `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
   - Classify replies for opt-out: keyword match (unsubscribe, remove, stop, opt out, take me off, do not contact, not interested + stop) plus an LLM classifier that errs toward suppressing.
   - Suppress on the same day. Gmail's limit is 2 days; the legal maximum is 10 business days.
   - Log a timestamp and evidence for every opt-out.
3. **Keep opt-out channels alive.** Never retire a sending domain, mailbox or unsubscribe endpoint within 30 days of its last send; in practice, keep them forwarding indefinitely.
4. **Footer linter that blocks the send.** Every commercial template must contain:
   - the legal sender name "AMB Advisory Services";
   - a physical postal address (street address, USPS PO box, or registered CMRA mailbox, from config);
   - a clear ad/solicitation line such as "This is a commercial message from AMB Advisory Services";
   - opt-out instructions and a working link;
   - readable type, not micro print.
5. **Header rules**
   - The From name is a real AMB person plus the firm.
   - Sending domains are registered to AMB with truthful registrant data.
   - SPF, DKIM and DMARC are aligned.
   - Reply-To is monitored.
   - No spoofing and no use of third-party domains.
6. **Subject line and claims guard**
   - Subjects come from an approved, human-reviewed list. The LLM may not invent them.
   - Block "Re:" and "Fwd:" on first touch, urgency or deadline words, "buyer interested" (unless a documented buyer exists), and implied prior contact.
   - Block body claims of guaranteed value. The valuation range must carry a disclaimer.
7. **Jurisdiction filter (default deny)**
   - US address required, state on the approved target-state list, non-US ccTLDs rejected, Canadian and Caribbean NANP area codes rejected.
   - Reject FCC MSCM wireless domains; refresh that list monthly.
   - Optionally hold California recipients until legal review, because of 17529.5, the CCPA and DRE licensing.
8. **Provenance per contact.** Record the source (state filing ID, website URL, vendor), collection date and method.
   - Never mail addresses generated by permutation unless they have been verified.
   - Do not harvest from sites that have a no-transfer notice.
   - Store Places data as place_id only.
9. **Export and sale guard.** A lead export to partner brokers:
   - excludes every suppressed address;
   - requires the seller's recorded consent to be introduced;
   - leaves out the age field;
   - checks the partner's license status in the seller's state;
   - records a flat fee, never a success fee.
10. **AI conversation rules**
    - Disclose AI assistance in AI-drafted replies.
    - Always answer truthfully when asked whether it is a bot.
    - A human must approve valuation figures, fee terms and anything about legal or licensing matters.
    - The AI must not negotiate deal terms.
    - Escalate to the named broker.
11. **Channel lock.** No SMS or voice integration. Phone numbers are display-only, for human use after a DNC check.
12. **Deliverability and terms-of-service guard**
    - Daily per-mailbox caps.
    - Auto-pause a domain if the spam rate passes 0.1%, and hard-stop at 0.3%.
    - Monitor bounce rates.
    - Keep volume low and one-to-one to stay within Google's terms.
13. **Privacy operations**
    - Store age as a band with source and confidence.
    - Run delete and access-request workflows.
    - Set a retention limit, for example purging non-responders after 24 months.
    - Track the share of revenue from lead sales and alert at 40%, ahead of the CCPA 50% and Texas thresholds.
    - Flag when data broker registration would be triggered (CA, TX, OR, VT).
14. **Audit log.** Keep every send, template version, suppression check result, opt-out and AI draft against its human approval, for at least 5 years. This supports the 17529.5 due-care reduction and the burden of proof on consent.


## Key facts

| Fact | Confidence | Source | Design implication |
|---|---|---|---|
| CAN-SPAM makes no exception for B2B email; any email whose primary purpose is commercial must comply. Cold email without prior consent is lawful (opt-out regime). | high | https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business | Treat every outbound prospecting email as a commercial message; run it through the full CAN-SPAM checks (header, subject, ad identification, address, opt-out). |
| The maximum civil penalty is $53,088 per violating email (2025 inflation adjustment, effective 17 Jan 2025). The FTC announced on 15 Sep 2026 (91 FR 58446) that there is no 2026 adjustment, so 2025 levels still apply. | high | https://www.federalregister.gov/documents/2026/09/15/2026-18853/civil-penalty-inflation-adjustments ; https://www.ftc.gov/news-events/news/press-releases/2025/02/ftc-publishes-inflation-adjusted-civil-penalty-amounts-2025 | Count exposure per message: one broken unsubscribe link or one missing footer across a 500-owner batch is 500 violations. Footer and unsubscribe checks must block the send. |
| A valid physical postal address under 16 CFR 316.2(p) is the sender's current street address, a USPS PO box accurately registered, or a private mailbox accurately registered with a CMRA under USPS rules. | high | https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-316/section-316.2 | Make the postal address a required config value; the footer linter refuses templates without it, and it must be shown in legible type. |
| The opt-out mechanism must work for at least 30 days after each send. Opt-outs must be honored within 10 business days. No fee, no personal information beyond the email address, and nothing beyond a reply email or a single web page may be required. | high | https://www.law.cornell.edu/uscode/text/15/7704 ; https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business | Use a single-page unsubscribe with no login, accept reply-based opt-outs via a classifier, suppress the same day, and never decommission sending domains or mailboxes within 30 days of their last send. |
| Gmail requires SPF, DKIM and DMARC; RFC 8058 one-click List-Unsubscribe headers for bulk senders (a body mailto link does not satisfy it); unsubscribes processed within 2 days; and a spam rate below 0.3% (target below 0.1%). | high | https://support.google.com/mail/answer/81126?hl=en ; https://blog.google/products/gmail/gmail-security-authentication-spam-protection/ | Add List-Unsubscribe and List-Unsubscribe-Post headers, set a 48-hour suppression SLA, and auto-pause a domain at a 0.1% spam rate and stop it at 0.3%. |
| Selling, leasing, exchanging or transferring the email address of anyone who opted out is prohibited (7704(a)(4)(A)(iv)). A sender cannot contract away its liability by outsourcing sending. | high | https://www.ftc.gov/sites/default/files/documents/federal_register_notices/definitions-and-implementation-under-can-spam-act-16-cfr-part-316/050119canspamact.pdf ; FTC compliance guide | The lead-export and partner-sale functions must filter out every suppressed address, and AMB stays liable for any sending vendor. |
| 18 U.S.C. 1037(a)(4) makes it a crime to register 2 or more domain names or 5 or more email accounts with materially falsified registrant identity and send multiple commercial emails from them (more than 100 in 24 hours, 1,000 in 30 days, or 10,000 in a year). Under 7704(a)(1), headers are misleading if access to the domain was obtained by false pretenses. | high | https://www.law.cornell.edu/uscode/text/18/1037 ; https://www.law.cornell.edu/uscode/text/15/7704 | Register the separate sending domains truthfully to AMB, and use From names that identify a real AMB person and the firm. |
| Address harvesting from sites with no-transfer notices and dictionary attacks (generated permutations) are aggravated violations under 7704(b) and allow trebled damages. | medium | https://www.law.cornell.edu/uscode/text/15/7704 ; https://www.govinfo.gov/content/pkg/FR-2008-05-21/pdf/E8-11394.pdf | Do not mass-send to guessed first.last@ patterns without verification; record provenance (source and method) for each address; do not scrape sites that have no-transfer notices. |
| Commercial email to the FCC-listed wireless carrier domains requires express prior authorization (CAN-SPAM s.14, 47 CFR 64.3100), with a 30-day safe harbor after a domain is listed. | high | https://www.law.cornell.edu/cfr/text/47/64.3100 | Load the FCC MSCM domain list, refresh it monthly, and hard-block any recipient on those domains. |
| California B&P 17529.5 prohibits falsified headers, unauthorized third-party domains and knowingly misleading subject lines. Liquidated damages are $1,000 per email (reducible to $100 per email with due-care practices), and Hypertouch v. ValueClick held advertisers strictly liable and the law not preempted. | medium | https://california.public.law/codes/ca_bus_and_prof_code_section_17529.5 ; https://blog.ericgoldman.org/archives/2011/01/hypertouch_v_valueclick.htm | Use only pre-approved, literally true subject lines (no fake Re:, no false urgency, no invented buyers) and keep written due-care procedures and audit logs. |
| Washington CEMA: Brown v. Old Navy (Apr 2025) held that any false or misleading subject-line information violates CEMA. ESHB 2274 (effective 11 June 2026) added a knowledge standard and cut damages from $500 to $100 per violation. | high | https://www.courts.wa.gov/opinions/pdf/1025921.pdf ; https://www.morganlewis.com/pubs/2026/06/washington-legislature-narrows-state-anti-spam-law-after-retail-litigation-surge | Apply the same subject-line guard; treat Washington recipients as higher risk. |
| CASL implied consent by conspicuous publication requires the recipient to have published the address themselves, with no opt-out statement, and the message to be relevant to their business role. Mere public availability or third-party republication is not enough, and the sender bears the burden of proof. | high | https://crtc.gc.ca/eng/com500/guide.htm ; https://crtc.gc.ca/eng/archive/2016/2016-428.htm | Exclude Canadian recipients by default: require a US address, reject the .ca TLD, and reject Canadian NANP area codes (+1 is shared). If jurisdiction is unknown, do not send. |
| GDPR Art. 3(2) applies to non-EU controllers that offer services to people in the EU. | high | https://gdpr-info.eu/art-3-gdpr/ ; https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf | Block EU and UK ccTLDs and non-US addresses; the engine targets US metros only. |
| The California BOT Act (B&P 17941) bars using a bot online to mislead a person in California about its artificial identity to incentivize a sale, unless clearly disclosed. AB 410 (truthful answer when asked) stalled in August 2025 and was not enacted. Whether the Act reaches email is unclear. | medium | https://california.public.law/codes/ca_bus_and_prof_code_section_17941 ; https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB410 | AI-drafted replies carry an AI-assistance disclosure, and the AI always answers truthfully when asked whether it is human. |
| Utah's AI Policy Act (amended by SB 226/332, effective 7 May 2025, sunset July 2027) requires disclosure when clearly asked, or proactively in high-risk interactions (collecting financial data, personalized financial advice). Clear disclosure at the outset is a safe harbor. | medium | https://fpf.org/blog/chatbots-in-check-utahs-latest-ai-legislation/ ; https://perkinscoie.com/insights/update/new-utah-ai-laws-change-disclosure-requirements-and-identity-protections-target | Revenue and valuation qualification by AI is plausibly high-risk; disclose AI at the start of the AI-handled conversation. |
| Maine 10 M.R.S. 1500-DD (2025) bars using a chatbot in trade where a reasonable consumer could think it is human, without clear and conspicuous notice; violations fall under the Maine UTPA. | high | https://legislature.maine.gov/statutes//10/title10sec1500-DD.html | Supports a universal AI-disclosure line rather than state-by-state logic. |
| Colorado SB 24-205 was repealed and replaced by SB 26-189 (signed 14 May 2026, effective 1 Jan 2027). It dropped the general AI-interaction disclosure and focuses on consequential decisions; enforcement is stayed by a federal court. | medium | https://www.eckertseamans.com/legal-updates/colorado-repeals-and-replaces-its-landmark-ai-statute-what-businesses-need-to-know ; https://www.jdsupra.com/legalnews/colorado-rewrites-its-landmark-ai-law-9230800/ | Lead scoring of business sellers likely falls outside it; no Colorado-specific code is needed now. Recheck before 2027. |
| The FTC Impersonation Rule (16 CFR 461) covers government and business impersonation. The extension to individuals is not finalized (October 2026 advance notice on platforms). The FTC holds there is no AI exemption from Section 5. | high | https://www.federalregister.gov/documents/2026/10/01/2026-20143/rule-on-impersonation-of-government-and-businesses ; https://www.ftc.gov/industry/technology/artificial-intelligence | Never use a fictitious human persona; the named sender must be a real AMB person, and AI misstatements are AMB's liability. |
| The CCPA B2B exemption expired 1 Jan 2023. CCPA applies only to businesses with $26.625M or more in revenue, or 100,000+ California consumers, or 50%+ of revenue from selling or sharing personal information. Inferences (such as estimated age) are personal information. | high | https://cppa.ca.gov/regulations/cpi_adjustment.html ; https://cppa.ca.gov/faq.html | Track the share of revenue from lead sales (alert before 50%); store age as an internal band with source; build right-to-know and delete workflows. |
| The California Delete Act requires data brokers (CCPA businesses selling personal information of consumers they have no direct relationship with) to register by 31 Jan and, from 1 Aug 2026, process DROP deletion requests at least every 45 days, at $200 per day per unprocessed request. | high | https://privacy.ca.gov/drop-for-data-brokers/ ; https://privacy.ca.gov/2026/08/calprivacy-brings-first-action-against-a-data-broker-under-both-the-ccpa-and-delete-act/ | If lead sales make AMB a CCPA business, the engine needs DROP ingestion and deletion, including derived fields. |
| Texas ch. 509 (amended by SB 2121, 2025) covers brokers of indirectly sourced data with more than 50% of revenue from it or more than 50,000 individuals ($300 a year). Vermont's current law excludes public business or professional information, but Act 138 (effective 1 Jan 2027) raises the fee to $900 and narrows carve-outs. Oregon requires DCBS registration. | medium | https://capitol.texas.gov/tlodocs/89R/billtext/html/SB02121F.htm ; https://ljfo.vermont.gov/assets/Publications/2025-2026-House-Bills/H.211-An-act-relating-to-data-brokers-As-enacted.pdf ; https://oregon.public.law/statutes/ors_646a.593 | Add a flag for when data broker registration is triggered, by state, for the lead-resale business line. |
| California B&P 10131(a) defines a broker to include anyone who for compensation 'solicits prospective sellers or purchasers of' a business opportunity, and B&P 10137 bars paying unlicensed persons. Florida 475.01 covers anyone who 'directs or assists in the procuring of prospects' for business enterprises. Illinois requires business-broker registration (815 ILCS 307/10-10). | medium | https://www2.dre.ca.gov/hearingfiles/H03382FR_210921_P.pdf ; https://florida.public.law/statutes/fla._stat._475.01 ; https://www.ilga.gov/legislation/ilcs/documents/081503070K10-10.htm | Flat per-lead fees are not a safe harbor where the solicitation itself is licensed. Gate outreach and lead sales by seller state against a license-status table, and get legal review before selling leads. |
| The federal M&A broker exemption (Exchange Act 15(b)(13), effective 29 Mar 2023) covers privately held companies with EBITDA under $25M or revenue under $250M, where the buyer takes control and is active in management. It is lost if the broker takes custody of funds, can bind a party, or does a public offering. It does not preempt state law. | medium | https://www.grsm.com/insight/codified-ma-broker-exemption-effective-on-march-29-2023/ ; https://jonesday.com/en/insights/2023/01/new-law-exempts-ma-brokers-from-sec-registration | Relevant only to stock or merger deals; the engine must never handle deal funds; state licensing still governs. |
| TCPA: $500 per violation, trebled to $1,500 if willful, for autodialed or prerecorded calls and texts and DNC violations. There is no B2B exemption for wireless numbers. Florida and Oklahoma have mini-TCPAs. | high | https://www.law.cornell.edu/uscode/text/47/227 ; https://www.mcguirewoods.com/client-resources/alerts/2023/5/pro-business-amendments-to-floridas-mini-tcpa-now-in-effect | Engine is email-only: no SMS or voice integration; phone numbers are display-only for manual human calls after a DNC check. |
| Google Cloud/Workspace AUP and Gmail program policies prohibit spam, including unsolicited mass email, and Google may suspend accounts. | medium | https://workspace.google.com/terms/use_policy/ ; https://support.google.com/mail/answer/16734397?hl=en-GB | Cold sends through Workspace and Gmail connector mailboxes risk suspension: keep low per-mailbox caps and one-to-one personalization, or use a sending provider whose terms allow cold B2B email. |
| Google Maps Platform terms bar caching or storing Places content except place IDs; persisting place names outside the session counts as scraping. | medium | https://developers.google.com/maps/documentation/places/web-service/policies | Store only the place_id from Places; take name and address from state filings or re-fetch them. |
| The FTC 'Free' Guide (16 CFR 251.1(c)) requires all conditions of a free offer to be disclosed clearly at the outset; renaming it 'gift' or 'bonus' does not cure deception. | high | https://www.law.cornell.edu/cfr/text/16/251.1 | The exit-readiness check must be unconditionally free, or its conditions stated up front; label the valuation range as a rough non-binding estimate, not an appraisal. |
| Research limitation: WebFetch failed DNS for every domain and curl was refused by the proxy, so primary sources were read only through WebSearch summaries, not as full text. | high | Session tool errors (getaddrinfo ENOTFOUND; proxy 403) | A lawyer should verify the items marked 'verify' (exact statute text, CASL penalty, VA consumer definition, 78o(b)(13) sub-conditions, Oregon fee) before launch. |

---

# Adversarial verification

# Compliance report verification for the AMB seller lead engine (2026-10-18)

## Limits of this check

I could not re-open any sources. The web search limit had already been used up by other agents in this run. Every fetch I tried failed: federalregister.gov, law.cornell.edu and support.google.com all failed DNS lookup. A direct request to ecfr.gov was refused by the proxy with a 403.

So each verdict below rests on my own knowledge, which runs to June 2026, and was not re-read from the source:
- **"Confirmed"** means it matches what I know of the statute, rule or guidance.
- **"Unsupported"** covers anything dated after June 2026 and anything I could not confirm.
- One item is a direct check: I read the Gmail connector's tool definitions in this session.

A lawyer should still check every item before launch.

## Verification table

| # | Fact | Verdict | Correction and source |
|---|---|---|---|
| 1 | CAN-SPAM has no B2B exception, and the "primary purpose" test applies. Cold email without prior consent is lawful (opt-out regime). | Confirmed | Correct as stated. Two things missing. First, an opt-out never expires: AMB may not email that person again unless they later give affirmative consent, so the suppression list must be permanent. Second, AI follow-ups after an owner replies may still be commercial messages, so the footer and opt-out belong on every automated message. Source: FTC CAN-SPAM Compliance Guide; 15 U.S.C. 7702(2), 7704(a)(4). |
| 2a | The penalty is $53,088 per violating email (2025 adjustment, effective 17 Jan 2025). | Confirmed | This is the 15 U.S.C. 45(m)(1)(A) figure from the 2025 adjustment (16 CFR 1.98). Each separate email is a separate violation (FTC guide). |
| 2b | No 2026 adjustment: OMB M-26-11 and 91 FR 58446 (15 Sep 2026). | Unsupported | This is after my knowledge cutoff and I could not re-fetch it. It is plausible, because BLS did not publish October 2025 CPI after the 2025 shutdown. The design is the same either way: plan for about $53K per message. |
| 3 | 16 CFR 316.2(p) defines a valid postal address: a street address, an accurately registered USPS PO box, or an accurately registered CMRA mailbox. | Confirmed | Matches the 2008 FTC rule (73 FR 29654). |
| 4 | The opt-out must work for at least 30 days after sending. Opt-outs must be honored within 10 business days. No fee, no personal information beyond the email address, and nothing beyond a reply or a single web page. | Confirmed | 7704(a)(3)(A)(ii), 7704(a)(4)(A) and 16 CFR 316.5. The 7704(a)(3)(B) menu of choices must include an option to stop all commercial email; that point is also correct. |
| 5 | Gmail requires SPF, DKIM and DMARC, one-click unsubscribe, unsubscribes processed within 2 days, and a spam rate below 0.3%. | Corrected | The rules come in two tiers. **All senders** need SPF *or* DKIM, valid forward and reverse DNS, TLS, and a spam rate below 0.3%. **Bulk senders** (about 5,000 or more messages a day to *personal* Gmail accounts) also need SPF *and* DKIM, a DMARC policy (p=none is enough), From-domain alignment, RFC 8058 one-click unsubscribe for marketing mail, and processing within 2 days. At 500 owners AMB will not be a bulk sender, so these are best practice, not a requirement. Google said it would step up enforcement, including rejecting mail, from November 2025. **Big design problem (checked in this session):** the Gmail connector's `send_message`, `reply` and `create_draft` tools have no field for custom headers, From alias or Reply-To. So `List-Unsubscribe` and `List-Unsubscribe-Post` cannot be set through the connector, and mail always goes out as the connected account. Either drop those header rules or send through a provider's API (or SMTP) that allows custom headers. Source: Gmail sender guidelines (support.google.com/mail/answer/81126); connector tool definitions. |
| 6 | Selling or transferring opted-out addresses is prohibited. Outsourcing does not move the liability. | Confirmed | 7704(a)(4)(A)(iv) does carry the exception "other than compliance with this Act or other provision of law." Missing: under 7702(9), anyone who "procures" (pays or induces) another to send is also an initiator. If AMB pays partners or vendors to send, AMB can be liable for their emails. |
| 7 | 18 U.S.C. 1037(a)(4) thresholds: 5 or more accounts or 2 or more domains, plus "multiple" commercial emails (more than 100 in 24 hours, 1,000 in 30 days, or 10,000 in a year). The false-pretenses clause in 7704(a)(1)(A). | Confirmed | 1037(d)(3) holds the "multiple" thresholds. See missed item 1 on WHOIS privacy: a California case sharpens the open "verify" question. |
| 8 | Address harvesting and dictionary attacks are aggravated violations with trebled damages. | Corrected | 7704(b)(1) is an aggravator, not a standalone ban. It applies only when the message *also* violates 7704(a). Treble damages are available only in suits by state attorneys general and ISPs (7706(f)(3)(C) and 7706(g)(3)(C)). The design rule (provenance records, no unverified permutations) is still sound. |
| 9 | Email to the FCC's wireless carrier domains needs express prior authorization, with a 30-day safe harbor after a domain is listed (47 CFR 64.3100). | Confirmed | The authorization must also meet the rule's own form requirements, which cold outreach cannot. A hard block is correct. |
| 10 | California B&P 17529.5: $1,000 per email, reducible to $100 per email (max $100,000 per incident) with due-care practices. *Hypertouch* held advertisers strictly liable and the statute not preempted. | Confirmed, with an addition | The full $1,000 rate is capped at $1,000,000 per incident (17529.5(b)(1)(B)(ii)), which the report left out. *Hypertouch v. ValueClick*, 192 Cal.App.4th 805 (2011), is correct. *Pottish v. WhaleCo* (May 2026) is unsupported, but it does not affect any decision. Key missing case: *Balsam v. Trancos* (see missed item 1). |
| 11a | *Brown v. Old Navy* (Wash., 17 Apr 2025, 5-4): any false or misleading subject-line content violates CEMA; $500 per email. | Confirmed | The case answered a question certified by the federal court, under RCW 19.190.020(1)(b) and 19.190.040. |
| 11b | ESHB 2274 (signed 23 Mar 2026, effective 11 Jun 2026) added a knowledge standard and cut damages to $100. | Unsupported | I cannot confirm that it was enacted or what it says. Until counsel confirms, plan for $500 per email. The design (subject-line guard) is unchanged. |
| 12 | CASL "conspicuous publication" (s.10(9)(b)); third-party republication is not enough; the sender bears the burden of proof (*Blackstone*, 2016-428). | Confirmed | Penalties of up to C$10M per violation for organizations and C$1M for individuals (s.20(4)) are also confirmed. CASL's private right of action was never brought into force. Default-deny for Canada is correct. |
| 13 | GDPR Art. 3(2) and the Art. 27 EU representative. | Confirmed | Art. 3(2) requires an *intent to target* people in the EU. A US-only engine is out of scope anyway, so a ccTLD block is just a backstop. |
| 14 | California BOT Act (17941). AB 410 stalled. The "10 million monthly visitors" threshold. | Corrected | The 10 million threshold (17940) defines which "online platforms" 17942 exempts from duties. It does **not** limit who the ban covers. Scope turns on "online" (a *public-facing* website, web app or digital application) and on "bot" (an account where substantially all actions are not a person's). Private one-to-one email that a human approves is probably outside the Act. AB 410 stalling in Senate suspense in 2025 is consistent with what I know; its 2026 status is unsupported. |
| 15 | Utah AI Policy Act as amended by SB 226 and SB 332 (effective 7 May 2025, sunset 1 Jul 2027). High-risk disclosure; the outset-disclosure safe harbor. | Corrected | "High-risk" needs **both** collection of sensitive data (financial, health, biometric) **and** personalized advice someone could rely on for significant decisions. The Act also only reaches "consumer transactions" under the Utah Consumer Sales Practices Act, and an owner selling a business is arguably a business-purpose deal outside that. More relevant: a provider in a state-*regulated occupation* (Utah requires a real-estate license for business brokers) must disclose at the outset in high-risk interactions. The repeal of 13-2-12 and its move to 13-75 is unsupported. |
| 16 | Maine 10 M.R.S. 1500-DD (2025): chatbot disclosure, enforced under the Maine UTPA. | Confirmed (medium) | This matches the 2025 Maine enactment as I know it. The UTPA private right of action is limited to purchases for personal, family or household use, so enforcement would mainly be by the Attorney General. |
| 17 | Colorado SB 26-189 repealed and replaced SB 24-205 (signed 14 May 2026). Enforcement stayed by a federal court on 27 Apr 2026. | Unsupported | I can confirm only that SB 25B-004 (August 2025) delayed SB 24-205 to 30 Jun 2026. If SB 24-205 still stands, its AI-interaction disclosure (C.R.S. 6-1-1704) would cover Colorado residents. The universal AI-disclosure line covers that either way. Lead scoring is not a "consequential decision" under either version. |
| 18 | FTC Impersonation Rule (16 CFR 461, effective 1 Apr 2024). The extension to individuals is not final. "No AI exemption." | Mostly confirmed | The rule, the pending 2024 proposal on individuals, and the "no AI exemption" statement (Operation AI Comply, September 2024) are confirmed. The October 2026 advance notice (FR 2026-20143) is unsupported. The Air AI case (August 2025) is medium confidence. |
| 19 | CCPA: the B2B exemption ended 1 Jan 2023. Thresholds are $26.625M revenue, 100,000 consumers or households, or 50% of revenue from selling or sharing. Inferences are personal information. Age is not sensitive personal information. | Confirmed | The revenue figure is the CPPA adjustment effective 1 Jan 2025; the next one is due in 2027. Inferences are covered by 1798.140(v)(1)(K) and AG Opinion 20-303. Age is not on the 1798.140(ae) list. Missing: the CPPA's rules on automated decision-making (ADMT), risk assessments and cybersecurity audits, effective 1 Jan 2026. ADMT duties cover "significant decisions" (lending, housing, employment, education, health care), not seller lead scoring. They apply only if AMB is a CCPA business. |
| 20 | Delete Act: register by 31 January; check DROP every 45 days from 1 Aug 2026; $200 per day per unprocessed request. | Confirmed | It applies only to a CCPA "business" (the thresholds above) that sells data of people it has no direct relationship with. The first enforcement action (LocateSmarter, $116,490, August 2026) is unsupported. |
| 21a | Texas ch. 509 as amended by SB 2121 (2025): more than 50% of revenue, or more than 50,000 individuals; $300 a year. | Confirmed (medium) | This matches SB 2121 as I know it (effective 1 Sep 2025). The 50,000-individual prong applies whatever share of revenue the data brings in. |
| 21b | Vermont: public business or professional information is excluded today; Act 138 (H.211) raises the fee to $900 from 1 Jan 2027. | Partly unsupported | The current carve-out in 9 V.S.A. 2430, the $100 fee and the $50 per day penalty are confirmed. Act 138's enactment and terms are unsupported. |
| 21c | Oregon data broker registration with DCBS (ORS 646A.593). | Confirmed; fee unsupported | Registration is confirmed. The fee is unknown. |
| 21d | Virginia, Colorado and similar laws exclude people acting in a commercial or employment context. | Confirmed | Va. Code 59.1-575 defines "consumer" as acting "only in an individual or household context." Colorado, Oregon, Texas and the 2026 laws (Indiana, Kentucky, Rhode Island) have similar exclusions. California is the outlier. |
| 22 | California B&P 10131(a), 10030 and 10137; the *Tyrone v. Kelley* finder rule; Florida 475.01 "procuring of prospects"; Illinois registration under 815 ILCS 307. Flat per-lead fees are not a safe harbor. | Confirmed, with a big implication | The report applies this mainly to *selling leads*. But AMB's **own cold email** is "soliciting prospective sellers of a business opportunity." Sending it into CA, FL or another licensing state for AMB's own engagements needs AMB itself to be licensed there. The approved-state list should *equal* the states where AMB is licensed or registered, or where none is needed, not "optionally hold California." The Illinois Act's exemptions are not verified. |
| 23 | M&A broker exemption, 15(b)(13): EBITDA under $25M or revenue under $250M; control and active-management test; lost by taking custody of funds, binding authority or a public offering; does not preempt state law. | Confirmed | The conditions the report marked "verify" are also correct. The broker loses the exemption if it acts for a shell company, provides financing, helps form a group of buyers, or deals with passive buyers. "Control" means 25% or more of voting power or the power to direct management. The thresholds are inflation-adjusted every 5 years. Caveat: a *stock* sale of a small corporation is a securities transaction (*Landreth Timber*, 1985), so the exemption matters more often than "asset sales only" implies. |
| 24 | TCPA: $500 per violation, trebled to $1,500 if willful, under 227(b)(3) and 227(c)(5). One-to-one consent rule vacated by the 11th Circuit on 24 Jan 2025. Florida and Oklahoma mini-TCPAs. | Confirmed | Missing: *McLaughlin Chiropractic v. McKesson* (U.S. Supreme Court, June 2025) held that district courts are not bound by FCC interpretations of the TCPA. Texas SB 140 (effective 1 Sep 2025) extended Texas telephone-solicitation rules to texts, with a private right of action. Email-only remains correct. |
| 25 | Google Workspace and Cloud AUP and Gmail program policies prohibit spam, and Google can suspend accounts. | Confirmed (medium), stronger than stated | The AUP bars generating or facilitating unsolicited *bulk* commercial email. Gmail program policies go further and bar using Gmail to distribute "unsolicited commercial mail." Running cold outreach through the Gmail connector is a direct terms-of-service risk. Combined with the connector's missing header controls (row 5), a dedicated cold-email sending provider is the safer choice. |
| 26 | Google Maps Platform: no caching except place IDs. | Corrected (minor) | Place IDs may be stored indefinitely, and latitude/longitude cached for up to 30 consecutive days. Ratings, review text and review counts may not be stored, and the terms also forbid building a database from Maps content. Scraping Maps outside the API (for example, third-party scrapers for reviews and "years open") breaks Google's terms. Places does not supply "years open," so take it from state filings. |
| 27 | FTC "Free" Guide, 16 CFR 251.1(c): conditions disclosed at the outset; "gift" and "bonus" are covered terms. | Confirmed | No correction. |
| 28 | Research limitation (WebFetch and proxy failures). | Confirmed | I hit the same failures, and the web search limit was used up as well. |

## Important facts the report missed

1. **WHOIS privacy on sending domains can itself break California law.** In *Balsam v. Trancos* (Cal. Ct. App. 2012, 203 Cal.App.4th 1083), header information counted as "misrepresented" under 17529.5(a)(2) when the email was sent from a privacy-registered domain and neither the From line nor the body identified the real sender. Each separate sending domain must therefore:
   - be registered openly to AMB (no privacy proxy); or
   - carry "AMB Advisory Services" in the From display name and the body.

   Do both. This settles the report's open "verify" on proxies.
2. **The Gmail connector cannot meet the report's own header rules.** `send_message`, `reply` and `create_draft` take only to, cc, bcc, subject, body, HTML body, attachments, threading and signature. There are no custom headers, no From alias and no Reply-To. Consequences:
   - Mail goes out only as the connected account, so each sending mailbox needs its own connector authorization.
   - Rule 9.2 (`List-Unsubscribe` headers) cannot be built this way. Use a sending provider's API or SMTP, or rely on a body link plus reply opt-out, which CAN-SPAM accepts but which falls short of Gmail best practice.
3. **Microsoft and Yahoo have their own sender rules.** Outlook.com has required SPF, DKIM and DMARC for senders of more than 5,000 messages a day since 5 May 2025, rejecting failures with "550 5.7.515". Yahoo has matched Gmail's bulk rules since February 2024. Many Main Street owners use Outlook, Hotmail or Yahoo addresses.
4. **AMB's own outreach needs a license, not just lead sales.** Licensing rules (CA DRE, FL 475, Utah real estate, Illinois registration) reach soliciting sellers at all. Choose the first 1-2 metros only in states where AMB is already licensed or registered, or where no license is needed. Make the target-state allow-list a legal-review sign-off, not an engineering default.
5. **Partners' emails can count as AMB's.** Under 7702(9), "initiate" includes "procure." If AMB pays partners or vendors to email owners for it, AMB is liable for those messages. The export guard should also bar partners from cold-emailing exported leads under AMB's name.
6. **Follow-up and qualification emails.** Once an owner asks for the free check, delivering it is arguably a "transactional or relationship" message. Messages that keep promoting AMB's services are still commercial. The simplest compliant rule is to put the footer and opt-out on every automated message, including AI replies.
7. **Opt-outs are permanent.** After 10 business days the address may never be emailed again without later affirmative consent. Never add retention purges or time limits to suppression records. Rule 9.13's 24-month purge must keep a hashed suppression entry.
8. **Federal pressure on state AI laws.** The December 2025 executive order on a national AI policy framework set up a DOJ task force to challenge state AI laws, and it named Colorado. That adds uncertainty to Colorado and Utah, but does not change the universal AI-disclosure design.
9. **Data-source terms of service.** Many data sources' terms forbid this kind of use:
   - Google Maps (outside the API);
   - LinkedIn;
   - enrichment vendors' free tiers (Apollo, Hunter and similar);
   - some state business-filing bulk-data licenses, which can bar solicitation or resale.

   Breaking these terms is a contract risk, not a statutory one, but it can cut off a data source. Each source's terms should be checked before ingestion and recorded with the provenance data.
10. **Anthropic's usage policy.** Running unsolicited commercial outreach through Claude should be checked against Anthropic's Usage Policy and the connector terms before launch. I could not re-read the current text.
11. **Smaller items that are probably not relevant:**
    - The Michigan and Utah children's protection email registries cover only adult products (alcohol, tobacco, gambling, pornography). A short note in the compliance log is enough.
    - The FTC Safeguards Rule defines "finders" as financial institutions, but it reaches only *consumer* customer information. Business sellers likely fall outside it, but counsel should confirm.

Primary sources I tried and could not reach: FTC CAN-SPAM Compliance Guide (ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), 15 U.S.C. 7704 (law.cornell.edu/uscode/text/15/7704), Gmail sender guidelines (support.google.com/mail/answer/81126), FR 2026-18853 (federalregister.gov). Nothing was written to disk.
