CREATE TABLE IF NOT EXISTS v2_dispatch_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fileSha256 VARCHAR(64) NOT NULL UNIQUE,
  fileName VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  dateFrom VARCHAR(10) NOT NULL,
  dateTo VARCHAR(10) NOT NULL,
  generatedLabel VARCHAR(100) NOT NULL,
  metadata JSON NOT NULL,
  importedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS v2_dispatch_rows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reportId INT NOT NULL,
  rowNumber INT NOT NULL,
  storeName VARCHAR(500) NOT NULL,
  crmResponsible VARCHAR(500) NOT NULL,
  syonetIntegration VARCHAR(100) NOT NULL,
  bbroIntegration VARCHAR(100) NOT NULL,
  UNIQUE KEY report_row (reportId,rowNumber),
  FOREIGN KEY (reportId) REFERENCES v2_dispatch_reports(id)
);
CREATE TABLE IF NOT EXISTS v2_dispatch_cells (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rowId INT NOT NULL,
  dispatchDate VARCHAR(10) NOT NULL,
  syonet VARCHAR(100) NOT NULL,
  sourceManual VARCHAR(100) NOT NULL,
  volume INT NOT NULL,
  UNIQUE KEY row_day (rowId,dispatchDate),
  FOREIGN KEY (rowId) REFERENCES v2_dispatch_rows(id)
);
CREATE TABLE IF NOT EXISTS v2_dispatch_checks (
  cellId INT PRIMARY KEY,
  isOk BOOLEAN NOT NULL,
  version INT NOT NULL,
  reviewerLabel VARCHAR(100) NOT NULL,
  updatedBy INT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cellId) REFERENCES v2_dispatch_cells(id),
  FOREIGN KEY (updatedBy) REFERENCES v2_accounts(id)
);
CREATE TABLE IF NOT EXISTS v2_dispatch_check_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cellId INT NOT NULL,
  previousIsOk BOOLEAN NULL,
  isOk BOOLEAN NOT NULL,
  reviewerLabel VARCHAR(100) NOT NULL,
  changedBy INT NOT NULL,
  version INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX cell_history (cellId,id),
  FOREIGN KEY (cellId) REFERENCES v2_dispatch_cells(id),
  FOREIGN KEY (changedBy) REFERENCES v2_accounts(id)
);
