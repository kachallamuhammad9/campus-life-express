# CLX Pilot Incident Log

Preparation template only. Do not record unnecessary personal data. Keep sensitive evidence in restricted storage and reference it here without copying secrets, payment credentials, or tracking tokens.

## Severity

- `LOW` - minor friction or clarification with no safety, payment, privacy, or order-integrity impact.
- `MEDIUM` - repeat friction, delay, complaint, duplicate suspicion, or vendor issue requiring ownership.
- `HIGH` - payment mismatch, paid item unavailable, wrong fulfillment, tracking failure affecting a real order, or serious customer/privacy risk.
- `CRITICAL` - suspected account compromise, unauthorized admin action, payment diversion/fraud, or privileged credential exposure.

## Incident Template

### Incident ID
`CLX-PILOT-YYYYMMDD-###`

### Date/time
- Reported at: ____ (timezone: ____)
- Detected by: ____

### Order number
`____`

Use the CLX order number only. Do not copy internal UUIDs or tracking tokens.

### Customer reference
Use a minimal reference such as initials or a restricted internal reference: `____`

### Vendor
`____`

### Category
`PAYMENT` / `ORDER` / `VENDOR` / `CUSTOMER` / `TRACKING` / `PRIVACY` / `SECURITY` / `PICKUP` / `OTHER`

### Severity
`LOW` / `MEDIUM` / `HIGH` / `CRITICAL`

### Description
`____`

### Evidence
Reference the restricted evidence location only. Do not paste credentials, payment details, tracking tokens, or unnecessary customer data.

`____`

### Immediate action
`____`

### Resolution
`____`

### Owner
`____`

### Closed date/time
`____` (timezone: ____)

### Lessons learned
`____`

## Handling Rules

1. Pause affected processing for HIGH or CRITICAL incidents.
2. Preserve evidence; do not delete or rewrite order history.
3. Do not improvise database fixes during a customer transaction.
4. Escalate payment, privacy, security, fraud, or order-integrity incidents to the CEO/admin owner.
5. Record whether the incident affected one order or requires pausing new pilot orders.
