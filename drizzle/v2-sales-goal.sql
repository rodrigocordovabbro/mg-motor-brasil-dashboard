-- Manual monthly total sales-goal overrides. This table is intentionally
-- separate from v2_commercial_imports and from any per-dealer/group target.
CREATE TABLE IF NOT EXISTS v2_sales_total_goals (
  competence VARCHAR(7) NOT NULL PRIMARY KEY,
  goal INT UNSIGNED NOT NULL,
  updatedBy INT NOT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updatedBy) REFERENCES v2_accounts(id)
);

CREATE TABLE IF NOT EXISTS v2_sales_total_goal_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competence VARCHAR(7) NOT NULL,
  oldGoal INT UNSIGNED NULL,
  newGoal INT UNSIGNED NOT NULL,
  accountId INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX sales_total_goal_history (competence, id),
  FOREIGN KEY (accountId) REFERENCES v2_accounts(id)
);

-- Per-month transactional mutex. Created empty; no goal value is seeded.
CREATE TABLE IF NOT EXISTS v2_sales_total_goal_locks (
  competence VARCHAR(7) NOT NULL PRIMARY KEY
);
