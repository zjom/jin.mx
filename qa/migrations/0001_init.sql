-- One row per customer link. The token is the secret in the url
CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  questionnaire TEXT NOT NULL,
  customer TEXT NOT NULL,
  vars TEXT NOT NULL DEFAULT '{}',
  answers TEXT NOT NULL DEFAULT '{}',
  position TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT
);

-- Submissions of general questionnaires
CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  questionnaire TEXT NOT NULL,
  answers TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE INDEX responses_questionnaire ON responses (questionnaire, submitted_at);

-- Everything that has been submitted, from either kind
CREATE VIEW submissions AS
SELECT token AS id, questionnaire, customer, answers, submitted_at
FROM invites
WHERE submitted_at IS NOT NULL
UNION ALL
SELECT id, questionnaire, NULL AS customer, answers, submitted_at
FROM responses;
