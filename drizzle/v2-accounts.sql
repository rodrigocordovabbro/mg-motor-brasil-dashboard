-- Account-management support tables. The finite migration runner adds the
-- role/sessionVersion columns to the already provisioned v2_accounts table.
CREATE TABLE IF NOT EXISTS v2_account_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  accountId INT NOT NULL,
  actorId INT NOT NULL,
  action VARCHAR(32) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX account_history (accountId,id),
  FOREIGN KEY (accountId) REFERENCES v2_accounts(id),
  FOREIGN KEY (actorId) REFERENCES v2_accounts(id)
);

CREATE TABLE IF NOT EXISTS v2_user_migrations (
  migrationId VARCHAR(120) PRIMARY KEY,
  appliedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
