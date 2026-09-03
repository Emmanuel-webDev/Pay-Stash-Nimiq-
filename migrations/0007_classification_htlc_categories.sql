-- Widens observed_transactions.classification for the two categories added
-- to packages/domain's classifyTransaction (BUILD_UPDATED.md §24): Nimiq
-- Pay's real outgoing tx history includes HTLC contract-funding
-- transactions and Stash-originated payments that aren't the plain
-- eligible_spend/self_transfer/stash_sweep/ignored set this constraint
-- originally allowed.

alter table stash.observed_transactions drop constraint if exists observed_transactions_classification_check;

alter table stash.observed_transactions add constraint observed_transactions_classification_check
  check (classification in ('eligible_spend', 'self_transfer', 'stash_sweep', 'stash_originated', 'contract_creation', 'ignored'));
