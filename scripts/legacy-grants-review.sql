-- Review only. Do not UPDATE or DELETE from this file.
-- Leftover grants do not open tests. A deploy does not convert them.
-- Run on a copy of the database, not as part of application startup.
SELECT user_id, exam, created_at
FROM grants
ORDER BY user_id, exam;
