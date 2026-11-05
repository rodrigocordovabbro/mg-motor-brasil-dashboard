-- V2 dispatch daily/source updates are additive and intentionally do not alter checks.
-- The application migration runner performs SHOW COLUMNS before these ALTERs for
-- MySQL versions that do not support ADD COLUMN IF NOT EXISTS.
ALTER TABLE v2_dispatch_cells
  MODIFY COLUMN volume INT NULL;

ALTER TABLE v2_dispatch_cells
  ADD COLUMN IF NOT EXISTS sourcePending BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS v2_dispatch_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fileSha256 VARCHAR(64) NOT NULL UNIQUE,
  reportId INT NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  importedBy INT NOT NULL,
  metadata JSON NOT NULL,
  importedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX import_report (reportId, importedAt),
  FOREIGN KEY (reportId) REFERENCES v2_dispatch_reports(id),
  FOREIGN KEY (importedBy) REFERENCES v2_accounts(id)
);
