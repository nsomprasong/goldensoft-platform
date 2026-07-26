# Billing Reconciliation

Read-only integrity checks for Platform billing foundation (Phase 8B.4).

## Command

```bash
npm run billing:reconcile
```

Requires safe environment guard + `DATABASE_URL`. Does **not** mutate data. Exits `2` when mismatches are found, `0` when clean, `1` on infrastructure failure.

## Checks

| Code | Meaning |
|---|---|
| `LEDGER_SNAPSHOT_MISMATCH` | Sum of credit/debit ledger ≠ `billing_accounts.current_balance_snapshot` |
| `CURRENCY_MISMATCH` | Transaction currency ≠ account currency |
| `INVOICE_PAID_TOTAL_MISMATCH` | Sum of allocations ≠ `invoices.paid_total` |
| `INVOICE_OUTSTANDING_MISMATCH` | Expected outstanding ≠ stored (skips VOID/CANCELLED/DRAFT) |
| `PAYMENT_OVER_ALLOCATED` | Allocation sum > payment amount |
| `ORPHAN_ALLOCATION` | Allocation missing payment or invoice |
| `MULTIPLE_PRIMARY_CONTACTS` | >1 active primary contact per organization |

## Output policy

- Does not print connection strings or secrets
- Organization/entity IDs redacted in JSON findings
- Suitable for CI after seeds/runtime acceptance

## Non-goals (this phase)

- Auto-fix / rewrite balances
- Gateway settlement reconciliation
- Stress testing / bulk repair
