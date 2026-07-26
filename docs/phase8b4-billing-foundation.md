# Phase 8B.4 Billing foundation

Billing uses append-only credit transactions and a reconciled balance snapshot. Invoice amounts are captured at creation; subscription summaries expose the stored `Subscription.priceAmount`, never the current plan price.

Manual payments begin as `PENDING`, require staff confirmation, then can be allocated to issued invoices. PromptPay and card gateway methods are deliberately rejected until a live gateway integration is implemented.

Customer APIs derive organization context from the signed session cookie. They do not accept an organization identifier from the browser.
