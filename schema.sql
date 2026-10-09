-- Apply with: wrangler d1 execute gtrack --file=schema.sql [--remote]

CREATE TABLE IF NOT EXISTS mails (
  id       TEXT PRIMARY KEY,
  subject  TEXT    NOT NULL DEFAULT '',
  recipient TEXT   NOT NULL DEFAULT '',
  sent_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS opens (
  id        TEXT    NOT NULL,
  opened_at INTEGER NOT NULL,
  ua        TEXT    NOT NULL DEFAULT '',
  is_proxy  INTEGER NOT NULL DEFAULT 0,  -- suspected automatic prefetch (Apple MPP, scanners)
  is_self   INTEGER NOT NULL DEFAULT 0   -- sender viewing their own sent mail
);
CREATE INDEX IF NOT EXISTS opens_id ON opens (id);

CREATE TABLE IF NOT EXISTS self_marks (
  id        TEXT    NOT NULL,
  marked_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS self_marks_id ON self_marks (id);
