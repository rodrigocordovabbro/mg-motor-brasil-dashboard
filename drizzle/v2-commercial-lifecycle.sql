-- Commercial source lifecycle is additive: source snapshots and their rows are
-- never deleted. A state row exists only when a snapshot has been removed or
-- reactivated, while this append-only table preserves every lifecycle event.
CREATE TABLE IF NOT EXISTS v2_commercial_import_state (
  importId INT PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  competence VARCHAR(7) NOT NULL,
  removedAt TIMESTAMP NULL,
  removedBy INT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX commercial_state_scope (competence, kind, importId),
  INDEX commercial_state_removed (removedAt)
);

CREATE TABLE IF NOT EXISTS v2_commercial_import_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  importId INT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  competence VARCHAR(7) NOT NULL,
  event VARCHAR(24) NOT NULL,
  accountId INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX commercial_audit_import (importId, id),
  INDEX commercial_audit_scope (competence, kind, id)
);
