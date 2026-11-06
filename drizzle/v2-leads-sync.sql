-- V2 Leads sync is additive. Existing v2_sources/v2_leads rows are never
-- deleted or altered by this migration; the import service only upserts rows
-- through their existing (sourceSheet, sourceRow) key.
CREATE TABLE IF NOT EXISTS v2_lead_imports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sourceId INT NOT NULL,
  spreadsheetId VARCHAR(100) NOT NULL,
  origin VARCHAR(16) NOT NULL,
  actorId INT NOT NULL,
  actorUsername VARCHAR(128) NOT NULL,
  inputSha256 CHAR(64) NOT NULL,
  totalRows INT NOT NULL,
  invalidDateRows INT NOT NULL,
  metadataJson LONGTEXT NOT NULL,
  importedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX leads_import_source_hash (sourceId, inputSha256),
  INDEX leads_import_source_time (sourceId, importedAt),
  FOREIGN KEY (sourceId) REFERENCES v2_sources(id),
  FOREIGN KEY (actorId) REFERENCES v2_accounts(id)
);

-- One private current snapshot per physical row. valuesJson/payloadJson may
-- contain source contact fields and are never selected by public dashboard APIs.
CREATE TABLE IF NOT EXISTS v2_lead_sync_rows (
  sourceId INT NOT NULL,
  sourceSheet VARCHAR(100) NOT NULL,
  sourceRow INT NOT NULL,
  leadId INT NOT NULL,
  sourceIdRaw VARCHAR(500) NOT NULL,
  sourceTimestampRaw VARCHAR(500) NOT NULL,
  rawModel TEXT NOT NULL,
  rawDealer TEXT NOT NULL,
  rowHash CHAR(64) NOT NULL,
  headersJson LONGTEXT NOT NULL,
  valuesJson LONGTEXT NOT NULL,
  payloadJson LONGTEXT NOT NULL,
  lastImportId BIGINT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (sourceId, sourceSheet, sourceRow),
  INDEX leads_sync_lead (leadId),
  INDEX leads_sync_hash (sourceId, rowHash),
  FOREIGN KEY (sourceId) REFERENCES v2_sources(id),
  FOREIGN KEY (leadId) REFERENCES v2_leads(id),
  FOREIGN KEY (lastImportId) REFERENCES v2_lead_imports(id)
);

-- Immutable private provenance for each inserted/changed physical row.
CREATE TABLE IF NOT EXISTS v2_lead_sync_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sourceId INT NOT NULL,
  sourceSheet VARCHAR(100) NOT NULL,
  sourceRow INT NOT NULL,
  leadId INT NOT NULL,
  importId BIGINT NOT NULL,
  actorId INT NOT NULL,
  actorUsername VARCHAR(128) NOT NULL,
  changeKind VARCHAR(16) NOT NULL,
  oldSnapshotJson LONGTEXT NULL,
  newSnapshotJson LONGTEXT NOT NULL,
  provenanceJson LONGTEXT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX leads_history_key (sourceId, sourceSheet, sourceRow, id),
  INDEX leads_history_import (importId, id),
  FOREIGN KEY (sourceId) REFERENCES v2_sources(id),
  FOREIGN KEY (leadId) REFERENCES v2_leads(id),
  FOREIGN KEY (importId) REFERENCES v2_lead_imports(id),
  FOREIGN KEY (actorId) REFERENCES v2_accounts(id)
);
