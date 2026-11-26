-- The language a questionnaire was last shown in: set when a customer link is
-- made with lang=, and whenever the reader uses the language switch
ALTER TABLE invites ADD COLUMN lang TEXT;
ALTER TABLE responses ADD COLUMN lang TEXT;

DROP VIEW submissions;

CREATE VIEW submissions AS
SELECT token AS id, questionnaire, customer, answers, lang, submitted_at
FROM invites
WHERE submitted_at IS NOT NULL
UNION ALL
SELECT id, questionnaire, NULL AS customer, answers, lang, submitted_at
FROM responses;
