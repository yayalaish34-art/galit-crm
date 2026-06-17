-- Task.type: enum TaskType -> text workflow steps, backfilled from currentStage.
-- 0..6 -> step1..step7 (פתיחת פנייה → דוח); 99 (display-only quote stage) -> stepQuote.
ALTER TABLE "Task" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "type" TYPE text USING (
  CASE
    WHEN COALESCE("currentStage", 0) = 99 THEN 'stepQuote'
    ELSE 'step' || (COALESCE("currentStage", 0) + 1)
  END
);
ALTER TABLE "Task" ALTER COLUMN "type" SET DEFAULT 'step1';
DROP TYPE IF EXISTS "TaskType";
