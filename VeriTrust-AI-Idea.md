# VeriTrust AI

**Alternative credit scoring for informal SMEs, built as a plug-in to Wema Bank’s lending workflow.**

**Hackathon:** Hackaholics 7.0 — Lagos (Yaba Tech)  
**Dates:** Tuesday 18 – Thursday 20 August 2026  
**One-line pitch:** Informal businesses look unscoreable to the bank. VeriTrust turns their public digital footprint into an explainable Digital Trust Score so Wema can pre-qualify them instead of silently declining them.

---

## 1. The idea in plain language

Millions of Nigerian micro and small businesses sell on Instagram, WhatsApp, Jumia-style catalogues, and independent websites. They make real money. They do not have:

- collateral
- audited financials
- a thick credit-bureau file

Traditional underwriting therefore labels them **thin-file / high-risk**. The bank loses loan volume. The seller never becomes a deposit customer either.

**VeriTrust AI** is not a new bank and not a replacement for CRC, CreditRegistry, or FirstCentral. It is a **pre-qualification sidecar**:

1. The applicant (or a Wema relationship manager) submits the business name, a public storefront URL, declared monthly turnover, and the amount they want.
2. VeriTrust reads the public page, extracts operational evidence with an LLM, and runs a fixed scoring formula.
3. It returns a **Digital Trust Score (0–100)**, a decision band (**Pre-approve / Manual review / Decline**), a recommended limit, and a short written rationale a credit officer can defend.

Wema still does KYC, bureau checks, and final credit approval. VeriTrust answers a narrower question: *does this business look operationally real, and is the ask in a sensible range?*

---

## 2. Why this problem is real

### Who is hurt

| Actor | What happens today |
|---|---|
| **Social-commerce sellers** | Active shops, no formal books. Loan applications die at “no credit history.” |
| **Independent service providers** | Tailors, phone-repair, logistics riders, beauty, tutoring — cash and transfer income that never becomes a credit file. |
| **Wema Bank** | MSME and ALAT Business growth needs more underwritable small customers. Thin-file decline is lost NII and lost deposits. |
| **Relationship managers** | Time is spent on files that were never going to clear, or never opened because the seller looked informal. |

### Why Wema should care

Hackaholics 7.0 is a blank canvas. The brief asks for three things. VeriTrust maps to all three:

1. **Real problem — thin-file MSMEs are a known Nigerian credit gap, not a toy problem.**

   **What SMEs are:** **SME** means **Small and Medium-sized Enterprise** — the everyday businesses that drive Nigeria’s informal and semi-formal economy. In practice this includes:

   - **Micro enterprises** — one-person or very small shops (e.g. a WhatsApp fashion vendor, a phone-accessories stall).
   - **Small enterprises** — a few staff, steady sales, maybe a simple storefront or online catalogue (e.g. Lagos Kicks & Apparel, a local tailor with Instagram orders).
   - **Medium enterprises** — larger but still not corporate-scale (small manufacturers, distributors, service firms with regular payroll).

   Together these are often written **MSMEs** — **Micro, Small, and Medium Enterprises**. Wema’s SME / ALAT Business lending is aimed at this segment: businesses that need working capital to buy stock, pay rent, or grow — but are not large corporates with audited accounts and board packs.

   **What “thin-file” means:** A **credit file** is the record credit bureaus (CRC, CreditRegistry, FirstCentral) hold about past borrowing and repayment. A business is **thin-file** when that record is empty, very short, or too weak for traditional scoring — usually because:

   - they have never taken a formal bank loan;
   - they trade mostly in cash and transfers, so income never shows up as structured financials;
   - they have no collateral (land, equipment, guarantors with bureau history);
   - they operate informally (social commerce, home-based services) even though revenue is real.

   Banks’ legacy models treat thin-file as **high-risk by default** — not always because the business is bad, but because there is **not enough paper trail** to score them. The result: millions of active MSMEs are **unbankable for credit** even when they could repay a modest working-capital loan.

   **Why this is a real problem in Nigeria:** Social-commerce sellers, market traders, and independent service providers are a huge part of daily economic activity. They create jobs and turnover, but the financial system cannot “see” them the way it sees salary earners or large companies. That is the **credit gap** VeriTrust targets — not a hypothetical edge case, but a structural mismatch between how MSMEs actually operate and how banks traditionally underwrite.
2. **Meaningful technology** — public-web evidence + LLM extraction + a deterministic, explainable score.
3. **Pathway into Wema** — a REST endpoint sitting in front of SME / ALAT origination. Bureau and policy stay where they are.

**Pitch line:**  
*Informal SMEs are unscoreable. VeriTrust produces a Digital Trust Score from public operations. Wema cares because this plugs into existing origination — it is not a new bank.*

---

## 3. Who it is for

### Primary user (hackathon demo)

**Wema underwriter / relationship manager**  
They open a console, load an applicant, see signals, score, rationale, and a recommended next step.

### Secondary user (product story)

**The SME applicant**  
They share a public storefront and basic figures, and get a same-day pre-qualification outcome instead of a silent decline.

### Buyer inside the bank

Credit / MSME / ALAT Business product. VeriTrust is decision **support**, not an automated grant of credit.

---

## 4. What we will (and will not) claim

### We will claim

- Public digital operations are unused evidence in thin-file files.
- A hybrid model (LLM extracts, formula decides) is more bankable than “the model approved the loan.”
- A recommended limit of **35% of declared monthly turnover** is a conservative working-capital starting point for a prototype.
- The output is a webhook/API payload origination systems already know how to consume.

### We will not claim

- That declared turnover is verified cashflow. It is self-reported and can be gamed. Say this out loud.
- That scraping Instagram or Google Reviews is production-ready. It is legally and technically fragile.
- That VeriTrust replaces bureau data, BVN/NIN KYC, or a credit committee.
- That the 40/30/20/10 weights are trained on defaults. They are **policy weights** for a prototype.

That honesty is part of the idea. Judges and bankers trust a bounded tool more than a magic credit engine.

---

## 5. Product shape (what judges will see)

A **live underwriter dashboard** plus a **scoring API**.

### Applicant intake

Minimum fields (no BVN, no NIN):

- applicant name
- business name
- public business URL
- declared monthly turnover (NGN)
- requested loan amount (NGN)
- contact email (optional)

### Underwriter view

- Digital Trust Score and risk tier
- Decision: **Pre-approved / Manual underwriting / Declined**
- Recommended credit limit
- Extracted operational signals (storefront live, pricing visible, contact found, category)
- Sentiment rating and confidence
- Risk flags (or empty)
- 2-sentence underwriting rationale
- Raw evidence the model used (truncated public text), so the officer can challenge the machine

### Three demo cases (must all work offline-ish)

| Case | Intended outcome | Purpose |
|---|---|---|
| **Lagos Kicks & Apparel** | Pre-approve | Active catalogue, positive public signal, modest ask vs turnover |
| **Borderline services business** | Manual review | Thin public page, mixed or weak evidence |
| **Template / spam storefront** | Decline + fraud flag | Fake shop patterns, mismatched name, no real operations |

If live fetch of a public page is flaky on the day, these three **fixtures** still run the full pipeline so the demo cannot die.

---

## 6. Scoring model

### Formula

```
Score = 0.40 × S_legitimacy
      + 0.30 × S_sentiment
      + 0.20 × S_financial_ratio
      + 0.10 × S_contact
```

All components are on a 0–100 scale.

| Component | Weight | How it is produced |
|---|---|---|
| **S_legitimacy** | 40% | LLM `business_legitimacy_score` — identifiable products/services, real operations, not a blank template |
| **S_sentiment** | 30% | Mapped from LLM rating: POSITIVE = 100, NEUTRAL = 60, NEGATIVE = 20, FRAUD_FLAG = 0 |
| **S_financial_ratio** | 20% | `R = requested_loan / monthly_turnover` (see bands below) |
| **S_contact** | 10% | 100 if email + phone (and address if present), 50 if partial, 0 if none |

### Financial-ratio bands

Let `R = loan_amount_requested / monthly_turnover`.

| R | S_financial_ratio |
|---|---|
| R ≤ 0.33 | 100 |
| 0.33 < R ≤ 0.66 | 70 |
| 0.66 < R ≤ 1.00 | 40 |
| R > 1.00 | 10 |

Meaning: asking for more than one month of declared turnover is treated as aggressive for this prototype.

### Decision thresholds

| Score | Decision | What the system does |
|---|---|---|
| **≥ 75** | Pre-approved | `Max limit = 0.35 × monthly_turnover`. Return approval payload. |
| **55 – 74** | Manual underwriting | Route to RM / credit officer with the rationale. |
| **< 55** | Declined | Log and notify. |
| **FRAUD_FLAG** regardless of score | Declined | Hard stop. |

### Worked example (from the original spec)

**Lagos Kicks & Apparel**

- Declared monthly turnover: ₦2,500,000
- Requested loan: ₦500,000
- `R = 0.20` → financial score = 100
- Recommended limit: `0.35 × 2,500,000 = ₦875,000`
- Sample published score: **84.5**, tier **LOW_RISK**, decision **PRE_APPROVED**, flags empty

Rationale style (what the officer should read):

> Business demonstrates an active storefront with distinct product listings and verified phone/email identifiers. Public customer sentiment is strongly positive. Debt-to-turnover ratio is within a conservative band at 0.20.

---

## 7. LLM extraction contract

The model must return **strict JSON**, no markdown fences, temperature as close to 0 as the API allows. Cache the prompt in the repo so the demo is repeatable.

**Role:** Credit underwriting & fraud-risk auditor for micro-SMEs in emerging markets.

**Inputs:** business name, scraped or fixture public text, declared monthly turnover, requested loan amount.

**Evaluation:**

1. Operational legitimacy — identifiable offer, terms, contact.
2. Social proof & sentiment — reviews/testimonials/order comments, overall tone.
3. Inconsistency / fraud — spam, unresolved delivery complaints, fake templates, mismatched names.

**Output schema:**

```json
{
  "business_legitimacy_score": 0,
  "sentiment_rating": "POSITIVE | NEUTRAL | NEGATIVE | FRAUD_FLAG",
  "sentiment_confidence": 0.0,
  "operational_signals": {
    "active_storefront": true,
    "identifiable_pricing": true,
    "contact_info_verified": true,
    "identified_category": "string"
  },
  "risk_flags": [],
  "underwriting_summary": "Two concise sentences."
}
```

The formula then consumes this JSON. The LLM does **not** emit the final approve/decline. That is a policy layer the bank can change without retraining anything.

---

## 8. How it plugs into Wema

Do not say “the bank.” Name the seat.

```
Applicant or RM
    → Wema SME / ALAT Business origination (existing)
        → VeriTrust POST /score   ← this product
        → Credit bureau (CRC / CreditRegistry / FirstCentral)
        → KYC (BVN/NIN stays inside the bank, never inside VeriTrust)
        → Credit policy / committee
            → Disburse or decline
```

### What each step means (bureau, KYC, credit policy)

These three are the parts of Wema’s **existing** lending stack that VeriTrust does **not** replace. Together they answer different questions about the same loan application.

| Step | Core question | Who / what answers it |
|---|---|---|
| **VeriTrust** | Does this business look operationally real from public digital evidence? | Your product (Digital Trust Score) |
| **Credit bureau** | How has this person/business behaved on credit in the past? | CRC, CreditRegistry, FirstCentral |
| **KYC** | Is this applicant really who they say they are? | Wema’s identity verification (BVN, NIN, ID) |
| **Credit policy / committee** | Given everything, does this loan fit our rules and risk appetite? | Wema credit officers, rules engine, committee |

---

#### Credit bureau file — what it is and why it matters

A **credit bureau** is a licensed institution that collects and shares **credit history** about borrowers. In Nigeria, the main ones Wema and other banks use include:

- **CRC Credit Bureau**
- **CreditRegistry**
- **FirstCentral Credit Bureau**

When someone (or a business) has taken a **formal loan** — from a bank, microfinance institution, or other reporting lender — the bureau keeps a **credit file** (also called a **credit report**). That file typically includes:

- **Identity linkage** — name, sometimes BVN or other identifiers tied to past borrowing
- **Loan accounts** — active and closed facilities (personal loans, overdrafts, SME loans, etc.)
- **Repayment behaviour** — on-time payments, late payments, defaults, write-offs
- **Enquiries** — how often lenders have checked the file (many checks can signal stress)
- **Summary scores or ratings** — bureau-specific risk indicators derived from that history

**What the bureau is good at:** telling the bank *“this borrower has (or has not) repaid formal credit before.”* If someone paid three prior loans cleanly, that is strong evidence. If they defaulted, the bank should know before lending again.

**What the bureau is bad at for VeriTrust’s target customer:** many informal MSMEs have **no file at all** — or a file so thin it cannot support a score. They may:

- never have taken a bank loan;
- only borrow informally from family or suppliers;
- run a profitable Instagram shop whose turnover never appears in bureau data.

That is **thin-file**: not necessarily a bad business, but **invisible to past-repayment history**. VeriTrust adds a different signal — *present operations* — while the bureau still answers *past credit behaviour* when a file exists.

**In the flow:** after origination creates the case and VeriTrust returns a digital score, Wema still pulls the bureau report. A strong VeriTrust score does not override a bad bureau history; a thin bureau file does not automatically kill an application if VeriTrust and policy support it.

---

#### KYC — Know Your Customer (identity, not credit)

**KYC** means **Know Your Customer** — the bank’s legal and regulatory duty to verify **who** is applying, that they are real, and that the application is not fraud or money laundering.

KYC is **about identity and compliance**, not about whether the business is profitable or whether the loan will be repaid. Those are separate (bureau + underwriting + policy).

Typical KYC steps for a Nigerian retail/SME loan include:

- **BVN (Bank Verification Number)** — 11-digit ID tied to the customer’s bank accounts; used to confirm identity and reduce duplicate/fake identities
- **NIN (National Identification Number)** — national ID linkage; increasingly used across financial services
- **Valid ID document** — driver’s licence, international passport, voter’s card, etc.
- **Address verification** — utility bill, tenancy, or other proof of where the customer lives or operates
- **Biometrics / liveness** — in digital channels, proving the applicant is the person on the ID
- **Sanctions and PEP screening** — checks against watchlists (politically exposed persons, sanctions lists)
- **Business verification (for SME)** — CAC registration where applicable, business address, signatory authority

**Why BVN/NIN stay inside Wema, not in VeriTrust:**

1. **Regulation** — identity data is highly sensitive under NDPR and CBN expectations; only licensed entities with proper controls should store and process it.
2. **Purpose limitation** — VeriTrust scores **public business evidence** (storefront, reviews, contact signals). It does not need national IDs to compute a Digital Trust Score for the hackathon prototype.
3. **Separation of concerns** — Wema already has KYC in origination and ALAT onboarding. VeriTrust should not become another database of BVN/NIN.

**In the flow:** KYC usually runs in parallel with or after early intake. The applicant must pass KYC before disbursement even if VeriTrust says “pre-approve.” Example: VeriTrust might score a shop highly, but if KYC fails (fake ID, identity mismatch), the loan must not proceed.

---

#### Credit policy and committee — the bank’s rules and human judgment

**Credit policy** is the set of **written rules** Wema uses to decide whether a loan is acceptable: amounts, sectors, ratios, documentation, and escalation paths. It turns raw data (VeriTrust score, bureau report, KYC result, RM input) into an **approve, decline, or refer** decision that fits the bank’s risk appetite and regulatory obligations.

Examples of what policy might specify:

- **Maximum loan size** by segment (e.g. cap for unsecured MSME working capital)
- **Debt service coverage** — can declared income support the repayment?
- **Sector restrictions** — limits on high-risk industries
- **Minimum documentation** — bank statements, invoices, guarantors for larger tickets
- **Score cut-offs** — e.g. bureau score below X requires committee; VeriTrust below Y auto-decline
- **Combined rules** — “Pre-approve from VeriTrust only if bureau is not negative and KYC is complete”

The **credit committee** (or **credit officer** for smaller tickets) is the **human layer** when policy cannot auto-decide: borderline cases, large amounts, conflicting signals, or exceptions. They read:

- VeriTrust rationale (“active storefront, positive sentiment, ratio 0.20”)
- Bureau report (“no history” vs “two loans, one late payment”)
- KYC status (“verified” vs “pending address”)
- RM relationship notes and any uploaded documents

Then they **approve with conditions**, **decline with reasons**, or **request more information**.

**Important distinction for VeriTrust:**

| Layer | Type of output | Binding? |
|---|---|---|
| VeriTrust | Recommended pre-qualification + rationale | **No** — decision support |
| Bureau | Factual credit history | **Input** — facts, not a final yes/no alone |
| KYC | Pass / fail / pending on identity | **Gate** — must pass before disbursement |
| Credit policy / committee | Final credit decision | **Yes** — only this layer (plus disbursement ops) moves money |

VeriTrust’s “Pre-approved” in the prototype means: *“Worth treating as low-friction for underwriting”* — not *“Wema has granted the loan.”*

---

#### How the three work together (simple example)

**Applicant:** Adeyemi, Lagos Kicks & Apparel, wants ₦500,000, declares ₦2.5m monthly turnover.

1. **VeriTrust** — Score 84.5, pre-approve, rationale cites active catalogue and conservative loan-to-turnover ratio. *Answers: does the business look real online?*
2. **Bureau** — Thin file: no prior bank loans. *Answers: no negative history, but also no positive repayment track record.*
3. **KYC** — BVN and NIN verified, ID matches, address on file. *Answers: this is the real Adeyemi.*
4. **Policy / committee** — Rules allow unsecured MSME up to ₦875k when VeriTrust ≥ 75, KYC complete, and no bureau default. Officer approves ₦500k. *Answers: does this fit Wema’s rules and risk appetite?*
5. **Disburse** — Loan account opened, funds sent.

If step 2 had shown a **recent default**, policy would likely **decline** despite a high VeriTrust score. If step 3 **failed**, disbursement is blocked regardless of VeriTrust. That is why the diagram shows VeriTrust **beside** bureau and KYC, not **instead of** them.

**Integration contract (illustrative):**

`POST /score`

Request:

```json
{
  "applicant_id": "APP-2026-9081",
  "full_name": "Adeyemi Johnson",
  "business_name": "Lagos Kicks & Apparel",
  "business_url": "https://example-lagos-kicks-store.com",
  "declared_monthly_turnover": 2500000,
  "requested_loan_amount": 500000,
  "applicant_email": "adeyemi@lagoskicks.com"
}
```

Response:

```json
{
  "applicant_id": "APP-2026-9081",
  "business_name": "Lagos Kicks & Apparel",
  "digital_trust_score": 84.5,
  "risk_tier": "LOW_RISK",
  "decision": "PRE_APPROVED",
  "recommended_credit_limit": 875000,
  "underwriting_rationale": "Business demonstrates an active storefront…",
  "flags": [],
  "signals": {}
}
```

Later (post-hackathon) this same payload can attach to open-banking cashflow once the customer formalises. The prototype does not need that.

---

## 9. Architecture we will actually build (3 days)

The original 10-page spec used n8n, Docker Compose on a VPS, Playwright against Instagram/Google, and transactional email. That is the right *enterprise sketch* and the wrong *hackathon machine*.

### Build this

| Layer | Choice | Why |
|---|---|---|
| Repo | GitHub Classroom (mandatory) | Only required platform |
| Frontend | Next.js (or React) on **Vercel** | Live public URL for judges |
| API | FastAPI `POST /score` on **Render** or Vercel serverless | One moving part |
| AI | **Google Gemini** free tier | Matches the Technical Guide |
| Evidence | Public HTML fetch **or frozen fixtures** | Demo cannot depend on Instagram |
| Data | In-memory / JSON fixtures | Enough for three cases |
| Explainability | Show extracted JSON + formula breakdown in the UI | Bank-shaped, not black-box |

### Do not build for the hackathon

- n8n orchestration
- Docker Compose on a VPS as the demo runtime
- Instagram / Google Reviews scraping
- BVN or NIN fields
- Brevo / Mailgun
- Custom model training on Colab
- Playwright, unless a simple public website is proven in the first hour

Playwright and n8n can appear on a “phase 2” slide. They should not be on the critical path to a Loom video.

### Request flow (hackathon)

```
Underwriter UI (Vercel)
    → POST /score
        → Load public page or fixture text
        → Gemini → strict JSON
        → Deterministic formula + thresholds
        → Return score, decision, limit, rationale
```

---

## 10. Compliance and trust posture

These are product features, not afterthoughts:

- **Public pages only.** Disclose in the UI that VeriTrust reads publicly visible content.
- **No national IDs in this prototype.** BVN/NIN belong in Wema’s KYC stack.
- **Decision support.** Copy in the UI: *Recommended action for the underwriter. Not an automated credit grant.*
- **NDPR-minded.** Store the minimum. Prefer fixtures and applicant-provided URLs.
- **Stable prompts.** Temperature 0, schema validation, show the officer the JSON.

Nigerian phone numbers must be first-class (`+234`, leading `0`, 10–11 local digits). A US-shaped regex is a product bug.

---

## 11. Original spec vs this idea

The workspace PDF *Project Specification: VeriTrust AI* is the source of the thesis, the formula, the thresholds, and the Lagos Kicks sample. This document **keeps the idea and cuts the runtime** so it can win a 3-day judging format.

| Original spec | This idea |
|---|---|
| Tally form + n8n + Playwright + Docker VPS | Underwriter UI + one scoring API |
| Instagram / Google audit | Public page or fixtures |
| BVN/NIN on the webhook | Explicitly excluded |
| Email/CRM dispatch | In-app decision is enough |
| Architecture-complete | Demo-complete |

Keep the spec as an appendix in the repo if useful. Do not implement it line-for-line.

---

## 12. 3-day execution plan

Hacking window is roughly **09:00–17:00** each day.

### Tuesday 18 — story + skeleton

By 17:00:

- Classroom repo exists
- Next.js shell with underwriter layout
- FastAPI health check + `POST /score` returning a **mock** score
- One fixture payload in the UI
- README already has the problem paragraph and empty URL placeholders

### Wednesday 19 — intelligence

By 17:00:

- Gemini prompt locked in the repo
- Formula and thresholds implemented in code (not only in this doc)
- Three cases: approve / review / reject
- In-app “How this plugs into Wema origination” panel

### Thursday 20 — ship

By 17:00:

- Public frontend URL and API URL
- Failure states (bad URL, model timeout, fixture fallback)
- README with all four required items (see below)
- Loom under **4 minutes**
- Two dry-runs of the live demo

### Demo / Loom script

1. Thin-file seller cannot be scored by a bureau-only engine.
2. Paste or load a public storefront (or fixture).
3. Show extracted signals, not raw HTML.
4. Score + rationale + recommended limit.
5. Route: Approve / RM review / Decline.
6. “This is the webhook Wema origination would call.”  
   Stop. Do not show Docker or n8n.

---

## 13. Hackathon submission checklist

From the official Technical Guide — eligibility, not extras:

1. Clear project description in `README.md`
2. Link to the **live deployed frontend**
3. Link to the **live backend API** (if applicable)
4. Recorded demo on **Loom** explaining how the solution works

Code must be committed to the team’s **GitHub Classroom** repository.

Recommended hosting (guide, not mandatory): Vercel or Netlify for frontend; Render or serverless for API; Gemini for AI.

---

## 14. Success criteria (how we know the idea landed)

The prototype is successful if a mentor or judge can, in under five minutes:

- State the problem in one sentence (thin-file informal SMEs).
- See three different outcomes from three businesses.
- Read a rationale that a credit officer could put in a file.
- Point to where this sits in Wema origination (sidecar, not replacement).
- Open a public URL without anyone SSHing into a VPS.

---

## 15. What “good” looks like after the hackathon (optional roadmap)

Not in scope for 20 August, useful as a closing slide:

- Replace fixtures with consented, allow-listed public sites
- Add open-banking / statement cashflow as a fifth score component
- Calibrate weights on historical SME defaults (true model, not policy weights)
- RM workstation widget inside existing Wema tools
- Audit log of every score for model risk and fair-lending review

---

## 16. Names and copy

- **Product name:** VeriTrust AI
- **Score name:** Digital Trust Score
- **Tagline:** *See the business the bureau cannot see.*
- **Do not use in the UI:** “AI approved your loan.”
- **Use in the UI:** “Recommended action for Wema underwriting.”

---

*Source materials in this workspace: Hackaholics 7.0 welcome brief (Godson, Wema Bank Innovations), The Hackathon Technical Guide (Hackaholics 7.0), and Project Specification: VeriTrust AI — Alternative Credit Scoring Engine for Informal SMEs. This file is the hackathon-ready product idea distilled from those documents.*
