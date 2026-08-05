-- Additive draft only. Classifies registry entries without changing role assignments.
ALTER TABLE platform.permissions
  ADD COLUMN scope_code text NOT NULL DEFAULT 'ORGANIZATION';

UPDATE platform.permissions
SET scope_code = 'BOTH'
WHERE code IN (
  'platform.organization.read', 'platform.organization.manage',
  'platform.branch.read', 'platform.branch.manage',
  'platform.user.read', 'platform.user.invite', 'platform.user.suspend',
  'platform.user.manage', 'platform.user.password_reset',
  'platform.role.read', 'platform.role.manage', 'platform.role.assign',
  'platform.audit.read', 'platform.product.read', 'platform.plan.read',
  'platform.subscription.read'
);

UPDATE platform.permissions
SET scope_code = 'PLATFORM'
WHERE code IN (
  'platform.organization.create', 'platform.product.manage',
  'platform.plan.manage', 'platform.subscription.manage',
  'platform.settings.read', 'platform.settings.manage',
  'platform.customer_portfolio.manage',
  'billing.account.read', 'billing.account.manage',
  'billing.credit.read', 'billing.credit.adjust',
  'billing.invoice.read', 'billing.invoice.manage',
  'billing.payment.read', 'billing.payment.record',
  'billing.contact.read', 'billing.contact.manage',
  'billing.subscription.read', 'billing.subscription.manage'
);

ALTER TABLE platform.permissions
  ADD CONSTRAINT permissions_scope_code_check
  CHECK (scope_code IN ('PLATFORM', 'ORGANIZATION', 'BOTH'));

CREATE INDEX permissions_scope_code_product_code_idx
  ON platform.permissions(scope_code, product_code);
