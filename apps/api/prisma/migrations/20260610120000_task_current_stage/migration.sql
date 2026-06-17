-- Add currentStage and currentStageChangedAt to Task for persisting CRM workflow step across refreshes
ALTER TABLE "Task" ADD COLUMN "currentStage" INTEGER;
ALTER TABLE "Task" ADD COLUMN "currentStageChangedAt" TIMESTAMP(3);
