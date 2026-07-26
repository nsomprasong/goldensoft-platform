# Billing schema ERD

```text
Organization 1--1 BillingAccount
Organization 1--* CreditTransaction
BillingAccount 1--* CreditTransaction
Organization 1--* Invoice
BillingAccount 1--* Invoice
Invoice 1--* InvoiceItem
Organization 1--* Payment
BillingAccount 1--* Payment
Payment *--* Invoice (PaymentAllocation)
Organization 1--* BillingContact
```

Status, method, transaction type, and direction values are lookup tables. No Prisma enum is introduced.
