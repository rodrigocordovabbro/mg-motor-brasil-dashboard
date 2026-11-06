-- Persisted dealer units discovered in confirmed commercial uploads.
-- The official 41-unit catalogue and aliases remain in shared/dealerRegistry.ts.
CREATE TABLE IF NOT EXISTS v2_dealer_registry (
  id INT AUTO_INCREMENT PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  normalizedKey VARCHAR(255) NOT NULL,
  state CHAR(2) NULL,
  origin VARCHAR(32) NOT NULL DEFAULT 'commercial-upload',
  sourceImportId INT NULL,
  createdBy INT NOT NULL,
  createdByUsername VARCHAR(64) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY dealer_registry_normalized_key (normalizedKey),
  INDEX dealer_registry_source_import (sourceImportId),
  INDEX dealer_registry_created_by (createdBy),
  CONSTRAINT dealer_registry_created_by_fk
    FOREIGN KEY (createdBy) REFERENCES v2_accounts(id)
);
