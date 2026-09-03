-- Pay & Stash became the primary loop (design.md §9), with Catch-up as the
-- fallback for both skipped Pay & Stash saves and externally-detected
-- spending. Obligations need to record which of those produced them.
-- See BUILD_UPDATED.md's reconciliation note and packages/domain's
-- ObligationSource type.

alter table stash.obligations
  add column source text not null default 'external_spend'
    check (source in ('pay_and_stash', 'external_spend', 'skipped_savings'));

alter table stash.obligations
  alter column source drop default;
