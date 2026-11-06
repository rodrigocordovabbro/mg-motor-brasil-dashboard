-- Sparse manual forecast overrides for the approved media-plan source.
-- This schema never changes imported budgets, commissions, actual investment or source rows.
CREATE TABLE IF NOT EXISTS v2_media_plan_projection_versions (
  monthId VARCHAR(7) NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  updatedBy INT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updatedBy) REFERENCES v2_accounts(id)
);

CREATE TABLE IF NOT EXISTS v2_media_plan_projection_overrides (
  monthId VARCHAR(7) NOT NULL,
  targetType VARCHAR(16) NOT NULL,
  targetKey VARCHAR(191) NOT NULL,
  value INT UNSIGNED NOT NULL,
  updatedBy INT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (monthId, targetType, targetKey),
  INDEX media_projection_month (monthId),
  FOREIGN KEY (updatedBy) REFERENCES v2_accounts(id)
);

CREATE TABLE IF NOT EXISTS v2_media_plan_projection_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  monthId VARCHAR(7) NOT NULL,
  version INT UNSIGNED NOT NULL,
  username VARCHAR(64) NOT NULL,
  accountId INT NOT NULL,
  oldValues JSON NOT NULL,
  newValues JSON NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX media_projection_history (monthId, id),
  FOREIGN KEY (accountId) REFERENCES v2_accounts(id)
);
