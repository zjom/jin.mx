-- Questionnaires live in the database, so one can be added or changed from
-- anywhere without a deploy. The row says which revision is being served
CREATE TABLE questionnaires (
  slug TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

-- Every import is kept, so old answers can be read beside the questions that
-- were asked at the time
CREATE TABLE revisions (
  slug TEXT NOT NULL,
  revision INTEGER NOT NULL,
  definition TEXT NOT NULL,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (slug, revision)
);

-- The revision answered, set when a questionnaire is sent
ALTER TABLE invites ADD COLUMN revision INTEGER;
ALTER TABLE responses ADD COLUMN revision INTEGER;

-- A revoked link answers like one that never existed
ALTER TABLE invites ADD COLUMN revoked_at TEXT;

-- Everything sent before now answered the files this database is seeded with
UPDATE invites SET revision = 1 WHERE submitted_at IS NOT NULL;
UPDATE responses SET revision = 1;

CREATE INDEX invites_questionnaire ON invites (questionnaire, created_at);

DROP VIEW submissions;

CREATE VIEW submissions AS
SELECT token AS id, questionnaire, customer, answers, lang, revision, submitted_at
FROM invites
WHERE submitted_at IS NOT NULL
UNION ALL
SELECT id, questionnaire, NULL AS customer, answers, lang, revision, submitted_at
FROM responses;
