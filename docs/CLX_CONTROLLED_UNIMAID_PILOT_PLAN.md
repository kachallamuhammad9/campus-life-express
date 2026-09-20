# CLX Controlled UNIMAID Pilot Plan
Phase 4G — Steps 5 & 6 only. Preparation document; NOT approval or execution.

## 1. Objective
Prepare Muhammad/CLX operator for a very small, genuine customer pickup pilot at University of Maiduguri without changing production functionality. CEO approval is required separately. No invitation, contact, order, payment verification, vendor update, WhatsApp message, rider creation, or fulfillment test is authorized by this document.

### Evidence and current launch gate — DO NOT START
Review date: 2026-09-09 (UTC). The user-supplied previous readiness was `PASS WITH NON-BLOCKING NOTES — CLX READY FOR CONTROLLED UNIMAID PILOT`. This is historical evidence, not a fresh availability result.

- Supplied [production frontend](https://frontend-nine-liard-84.vercel.app): the approved alias was restored to the verified existing `frontend` deployment and `/`, `/orders.html`, and `/admin.html` now return HTTP `200`. No database or customer-data mutation occurred. Browser rendering remains unverified because the local Chromium executable is unavailable; do not treat HTTP success as pilot approval.
- Browser verification could not launch: its Chromium executable is missing. No fresh rendering, authenticated login, or tracking lifecycle verification is claimed.
- Local `frontend/orders.html`, `frontend/admin.html`, `frontend/js/operations.js` and the existing daily SOP support the controls and lifecycle described below. The approved URL now responds over HTTP, but browser-level deployed capability parity remains unverified because the local Chromium executable is unavailable. The older operations audit predates the supplied Pickup-default and QA-label fixes; do not treat its old counts/default as current.
- Guarded live database SELECTs used a READ ONLY transaction. First observed counts differ from the supplied baseline. Reconcile existing activity before CEO approval; do not delete, relabel, complete, or repair records as part of preparation.

| Record group | Supplied baseline | Observed at 18:05 UTC |
|---|---:|---:|
| customer_orders | 12 | 13 |
| orders | 20 | 21 |
| order_items | 26 | 27 |
| payments | 12 | 13 |
| history | 37 | 43 |
| delivery_requests | 5 | 5 |
| delivery_zones | 15 | 15 |
| riders | 0 | 0 |
| products | 45 | 45 |
| services | 24 | 24 |
| vendors | 16 | 16 |
| vendor_campuses | 21 | 21 |
| vendor_applications | 5 | 5 |
| service_requests | 6 | 6 |

Existing `CLX-2026-0013` was created at 15:13:16 UTC, before this review, and observed as PICKUP / READY_FOR_PICKUP. Its notes did not match a QA/test/smoke marker; this does not establish whether it is genuine or QA. Muhammad must reconcile its origin and operational owner before calling a later order the first genuine pilot order. No customer details were copied.

Protected orders `CLX-2026-0001`, `CLX-2026-0003`, and `CLX-2026-0011` must not be mutated. Existing QA records including `CLX-2026-0011` and `CLX-2026-0012` are excluded from pilot metrics; use the supplied `QA / TEST` identification, not speculation about other records.

## 2. Scope
- Campus: University of Maiduguri only.
- Fulfillment: **PICKUP only**; pickup-first operating model.
- Customers: invited, very small group; recommend **3–5 real customers**, beginning with one order reviewed before the next. This is a recommendation, NOT an automated system limit.
- Vendors: one or a very small number of verified, operationally confirmed vendors.
- Products: a few simple, clearly available catalogue items.
- Payment: manual transfer and actual-receipt verification by a CLX human.
- Operations: CLX admin manually coordinates vendors.
- Communication: official WhatsApp Business `+2349150736638`.
- Tracking: existing CLX customer order tracking.

## 3. Pilot limitations
No delivery, riders, dispatch, service requests, marketplace trades, broad rollout, or analytics infrastructure. Delivery may remain a selectable system option; the pilot restriction is operational, not a newly installed enforcement rule. No automated payment reconciliation, vendor acceptance/contact, WhatsApp sending, cancellation or refund is promised. No database intervention to finish an order.

## 4. Pilot participants
No participant is enrolled or contacted by this preparation.

| Role | Responsibility | Confirmation before launch |
|---|---|---|
| CEO | Explicit manual approval, pause/resume decision | [ ] Name/time/approval reference recorded privately |
| Muhammad / CLX operator | Real-time order, payment, vendor and customer coordination | [ ] Named operator and session window |
| Escalation owner | Payment exceptions, incidents and customer protection | [ ] Named owner and internal route |
| Selected vendor | Accept paid order, prepare and confirm pickup handoff | [ ] Personally confirmed |
| Invited customer | Understand pilot, order once, pay safely, collect, brief feedback | [ ] Voluntarily agrees |

## 5. Vendor criteria
Complete separately for each proposed vendor; no vendor records are to be modified.
- [ ] Vendor ACTIVE and verified in current catalogue/admin evidence.
- [ ] Vendor-campus association active; correct active University of Maiduguri campus.
- [ ] Operational phone/contact privately available and vendor reachable.
- [ ] Selected product practically available at the current price.
- [ ] Vendor understands this controlled CLX pilot and explicitly agrees to participate.
- [ ] Vendor agrees to prepare only after CLX confirms the paid order.
- [ ] Vendor understands pickup, acceptance, preparation, readiness and handoff confirmations.
- [ ] Pickup location and collection instruction are clear and safe.

### Read-only candidate review
Live name-only/vendor-product review on 2026-09-09 used ACTIVE, verified vendors with active UNIMAID associations and campus. Product selection additionally checked an active category, in-stock status and positive stock or unspecified stock. Unspecified stock is not proof of actual availability. No pickup availability field or personal agreement is inferred from these flags.

Useful candidates: **Campus Bites**, **Scholar's Café**.
Each is **TECHNICALLY ELIGIBLE — OPERATIONAL CONFIRMATION REQUIRED**.
No contact, participation, genuine operating business status, or pickup arrangement has been personally confirmed. Demo/test/service/logistics entries are not proposed for this product pickup pilot even if database flags allow them.

The existing read-only candidate helper initially failed because it assumed a nonexistent product `is_active` column. A separate schema-aligned read-only SELECT succeeded; neither helper nor catalogue records were changed.

## 6. Product criteria
Choose only a few items, preferably from one vendor for the first order.
- [ ] Low complexity and low value within CEO-approved exposure.
- [ ] Readily available; easy to prepare and identify.
- [ ] Simple pickup; safe packaging/handling and clear collection point.
- [ ] No customization risk unless explicitly agreed; clarify portion/variant first.
- [ ] No unusually volatile pricing; current unit price and total checked before checkout.
- [ ] Quantity physically available; no silent substitution or catalogue alteration.

### Suggested shortlist — not a stock reservation or customer quote
Every row is **TECHNICALLY ELIGIBLE — AVAILABILITY MUST BE CONFIRMED BEFORE PILOT**.

| Vendor | Product | Observed unit price (NGN) | Operational check |
|---|---|---:|---|
| Campus Bites | Egg Roll | 400 | Available batch, size, freshness and ingredients |
| Campus Bites | Meat Pie | 500 | Available batch, size, freshness and ingredients |
| Scholar's Café | Bottled Water | 200 | Brand/size, sealed bottle and collection point |

These are catalogue snapshots, not promises. Prefer the two Campus Bites items only if operational checks pass, or a single bottled-water item at Scholar's Café; do not require a multi-vendor cart. Account for any displayed service fee; PICKUP delivery fee must be zero.

## 7. Customer criteria
- [ ] Invited customer voluntarily understands this is a controlled pickup pilot, not delivery.
- [ ] Can use the site, official WhatsApp and tracking; can collect at the agreed location.
- [ ] Understands manual payment verification and possible pauses/delays.
- [ ] Provides accurate name/phone only in the intended checkout channel.
- [ ] Agrees to short optional feedback; no pressure to pay or participate.

## 8. Pre-launch checklist
All boxes are intentionally unchecked. Operator records initials, date/time with timezone and evidence reference in a restricted working copy. A failed mandatory item means DO NOT START; preparation is not approval.

Session date/window: ____  Operator: ____  CEO approval reference: ____
- [ ] Supplied deployment issue resolved; approved production website available.
- [ ] Pickup default verified on the current deployed checkout; no delivery fee for pickup.
- [ ] Official WhatsApp `+2349150736638` available to the operator.
- [ ] Admin login works and Operations dashboard loads without errors.
- [ ] Selected vendor personally confirmed, reachable and available now.
- [ ] Selected products practically available; quantities and current prices checked.
- [ ] Customer understands and agrees to controlled pilot terms.
- [ ] Operator available to process this order in real time through collection.
- [ ] Official payment destination confirmed internally and accessible to operator.
- [ ] Existing customer tracking available; secure customer access method understood.
- [ ] Incident log ready; named escalation owner and route available.
- [ ] No unresolved production incident or safety/payment/order-integrity blocker.
- [ ] Observed count discrepancy and existing order origin reconciled without altering evidence.
- [ ] Read-only per-order no-delivery check arranged (see runbook 6.3); no delivery test.
- [ ] CEO has explicitly authorized this session after reviewing all evidence.

## 9. Payment readiness
- [ ] Official payment destination known to CLX operator and approved internally.
- [ ] Only official CLX WhatsApp sends customer payment instructions.
- [ ] Operator can verify actual receipt, amount, transaction and correct order before marking PAID.
- [ ] CLX order number used as payment reference where practical.
- [ ] Customer receipt/screenshot alone is insufficient without actual receipt confirmation.
- [ ] Underpayment: hold verification; clarify and reconcile the balance manually.
- [ ] Overpayment: hold verification; escalate excess handling; never change the order total.
- [ ] Suspected mismatch/fraud: stop, preserve restricted evidence, escalate.
- [ ] Refunds and cancellations remain manual exception handling; no automatic refund control assumed.

Payment details placeholder only: `[OFFICIAL CLX PAYMENT DETAILS]`.
Never send the placeholder as instructions. Replace it privately with approved details only after launch authorization; do not commit bank details or receipts. Refund resolution is not evidence that pickup occurred; never complete an uncollected order.

## 10. WhatsApp readiness
Recommended operational configuration only — NOT verified, configured or sent here.
- [ ] Correct CLX business name/profile; official number active and accessible.
- [ ] Optional greeting accurately explains manual pickup coordination.
- [ ] Optional away message accurately states availability; do not promise unattended processing.
- [ ] Quick replies reviewed and configured manually if supported.
- [ ] Labels configured manually if available: New Order; Awaiting Payment; Paid; Vendor Confirmed; Preparing; Ready for Pickup; Completed; Issue / Escalation.
- [ ] Staff understand labels are not system/payment status changes.

### Suggested quick replies
Templates are drafts. Replace bracketed values only with confirmed facts. Send manually from the official number only during an approved run; never include internal identifiers or tracking secrets.

**/received** — Hello [Customer], CLX received [CLX Order Number] for PICKUP. We are checking availability. Please wait for official payment instructions here.

**/payment** — For [CLX Order Number], total [Confirmed Total], use [OFFICIAL CLX PAYMENT DETAILS]. Use the order number as reference where possible and send evidence here. CLX must confirm actual receipt before processing.

**/paid** — Payment for [CLX Order Number] is confirmed. We are now asking [Vendor] to accept your pickup order.

**/preparing** — [Vendor] has started preparing [CLX Order Number]. We will tell you when it is ready for pickup.

**/ready** — [CLX Order Number] is ready at [Confirmed Pickup Location], [Vendor]. Please [Simple Collection Instruction] and reference your CLX order number.

**/complete** — Thank you. Collection of [CLX Order Number] is confirmed and recorded as completed. We welcome your brief feedback.

**/delay** — [CLX Order Number] is delayed: [Confirmed Reason]. We will update you at [Agreed Update Time]. Please wait for a confirmed ready message before travelling.

**/unavailable** — Sorry, [Item] for [CLX Order Number] is unavailable. Please do not pay or make another payment while we review. We have not substituted anything. CLX will discuss a manual resolution with you.

**/issue** — We have paused processing [CLX Order Number] and escalated [Brief Non-sensitive Issue]. Please do not submit again or make another payment while we investigate. We will update you at [Agreed Update Time].

## 11. Operator readiness
Muhammad owns the live checklist and checks the CLX order number before every action. Use [First Real Customer Runbook](CLX_FIRST_REAL_CUSTOMER_RUNBOOK.md) only after separate approval. Keep admin access private; never share credentials or tracking secrets. Assign a backup/escalation owner before starting, not mid-incident. Review one order before inviting the next customer; no parallel workload beyond actual capacity.

Verified historical parent lifecycle:
`ORDER_RECEIVED → PAYMENT_CONFIRMED → ORDER_CONFIRMED → PREPARING → READY_FOR_PICKUP → COMPLETED`.
Vendor child lifecycle: `PENDING → CONFIRMED → PREPARING → READY`.
A child can remain READY after parent pickup completion; do not invent a child-completion action. For any multi-vendor order, every vendor must reach the required stage before expecting the aggregate parent stage. Prefer one vendor initially.

## 12. Incident handling
Use [Incident Log](CLX_PILOT_INCIDENT_LOG.md). Pause affected processing, preserve sanitized evidence, assign severity/owner, escalate to Muhammad/CEO, and record resolution and lessons. HIGH/CRITICAL safety, payment or order-integrity incidents pause the whole pilot before new real orders. Do not erase evidence, retry mutations blindly, change database rows, fake status, or promise automated refunds. Protect any existing paid customer obligation while new orders are paused.

## 13. Observation process
Use [Observation Log](CLX_PILOT_OBSERVATION_LOG.md) immediately after each approved order, including failed attempts. Capture short voluntary feedback and operator/vendor observations without unnecessary personal information. Keep raw evidence in restricted storage, not this repository. Escalate incidents rather than leaving them only as UX observations.

## 14. Metrics
Manual scorecard only; no analytics build. Use one restricted session sheet and one line per attempt/order, excluding confirmed QA/test records and unreconciled pre-pilot activity. Distinguish an unsuccessful attempt with no persisted order from an abandoned persisted order; do not double-count one order in the same metric.

| Metric | Manual recording rule | Session result |
|---|---|---|
| Invited customers | Distinct consented invitees, no names in shared scorecard | ____ |
| Checkout attempts | Distinct submission attempts; note retries separately | ____ |
| Successful orders | Correct, unique persisted CLX orders | ____ |
| Payment-confirmed orders | Orders with actual receipt verified and PAID recorded | ____ |
| Completed pickups | Genuine collection and parent COMPLETED | ____ |
| Failed/abandoned orders | Count with reason; flag whether persisted | ____ |
| Unavailable-item incidents | Distinct incident IDs | ____ |
| Payment issues | Distinct incident IDs | ____ |
| Vendor delays | Orders delayed; record confirmed cause | ____ |
| Customer complaints | Orders with complaints; brief themes | ____ |
| Tracking problems | Orders/attempts with tracking failures | ____ |
| Average manual handling time | Sum of active operator minutes / measured orders; exclude waiting; state sample size | ____ |
| Customer satisfaction feedback | Short voluntary responses; positive/mixed/negative themes and response count | ____ |

Blank means not measured, NOT zero. Record elapsed order-to-collection time separately if useful; never label elapsed waiting as active handling time.

## 15. Stop conditions
Pause immediately for payment mismatch, suspected fraud, duplicate-order behavior, wrong totals, wrong customer/vendor/item, tracking failure, vendor unable to fulfill a paid order, unauthorized admin action, customer privacy exposure, unexpected delivery creation, inconsistent status, failed admin action, or the same serious defect affecting multiple customers.

Any HIGH or CRITICAL issue affecting safety/payment/order integrity means stop new real orders and investigate. The affected order cannot proceed while a required check fails. No improvised database fix. Record owner and evidence; resume only after resolution, safe revalidation and explicit CEO approval. The unavailable supplied deployment and unreconciled count drift are current pre-launch holds, not completed checklist items.

## 16. Pilot success criteria
- All entry criteria and separate CEO approval recorded before the first order.
- First genuine order meets every runbook success criterion, without developer/database intervention.
- Correct totals, confirmed receipt, real vendor acceptance, usable tracking and genuine pickups throughout the small batch.
- No unresolved HIGH/CRITICAL safety/payment/order-integrity or privacy/security issue.
- Every failed/abandoned order and paid obligation accounted for; no fake completion.
- Scorecard and brief feedback/observations completed; issues assigned owners.
- CEO explicitly decides whether to stop, repeat the small batch or approve a later expansion. Three to five customers is a recommendation, not a pass quota or automated cap.

If developer/database intervention is needed to finish the first order, its verdict is `OPERATIONALLY FAILED — TECHNICAL INTERVENTION REQUIRED`, even if eventually completed. Do not silently choose another order and relabel it the first success.

## 17. Pilot closeout procedure
1. Stop invitations/new attempts at the agreed session end.
2. Review every pilot order, outstanding payment, pending vendor response and uncollected pickup. Assign owner and next action; do not mark unfinished orders complete.
3. Reconcile manual payment records privately against persisted order totals/statuses; escalate discrepancies and refunds manually.
4. Complete scorecard, incidents and observations; exclude confirmed QA/test activity.
5. Record first-order verdict, overall result, outstanding risks and lessons. Preserve protected orders and historical snapshots unchanged.
6. CEO reviews evidence and records a stop/repeat/expand decision. Any resume requires its own approval.
7. Retain minimum necessary operational records under CLX policy; keep sensitive evidence access-restricted and remove unnecessary copies through approved retention handling, never erase incident history to hide errors.

### Preparation boundary
Only these documents are prepared. Step 7 — CEO Manual Pilot Approval Gate and Step 8 — First Real Customer Pilot Execution are NOT executed. Current launch status is DO NOT START until deployment availability, deployed capability verification and activity reconciliation are resolved. Document completion is not a claim of production launch readiness.
