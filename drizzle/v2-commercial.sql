-- V2 commercial imports are immutable snapshots. The application chooses the
-- latest id for a kind/competence; old versions remain available for audit.
CREATE TABLE IF NOT EXISTS v2_commercial_imports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  competence VARCHAR(7) NOT NULL,
  asOf DATE NULL,
  sourceWeek TINYINT NULL,
  asOfKey VARCHAR(10) NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  fileSha256 VARCHAR(64) NOT NULL,
  mappingSha256 VARCHAR(64) NOT NULL,
  total INT NULL,
  rowCount INT NOT NULL,
  rowsJson LONGTEXT NOT NULL,
  warningsJson LONGTEXT NOT NULL,
  importedBy INT NOT NULL,
  importedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY commercial_import_identity (kind, competence, fileSha256, asOfKey, mappingSha256),
  INDEX commercial_latest (competence, kind, id),
  INDEX commercial_file (fileSha256),
  FOREIGN KEY (importedBy) REFERENCES v2_accounts(id)
);
