-- Organization entity type for tax invoicing: LEGAL_ENTITY vs INDIVIDUAL.
-- Individual customers store civil-ID style fields (same shape as staff identity).

ALTER TABLE "platform"."organizations"
    ADD COLUMN "entity_type" TEXT NOT NULL DEFAULT 'LEGAL_ENTITY',
    ADD COLUMN "title_code" TEXT,
    ADD COLUMN "first_name_th" TEXT,
    ADD COLUMN "last_name_th" TEXT,
    ADD COLUMN "national_id" TEXT,
    ADD COLUMN "date_of_birth" DATE;

CREATE INDEX "organizations_entity_type_idx"
    ON "platform"."organizations" ("entity_type");

CREATE INDEX "organizations_national_id_idx"
    ON "platform"."organizations" ("national_id");
