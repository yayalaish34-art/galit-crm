-- תיקון סחף: schema.prisma מגדיר `taskId String @unique` ב-TaskField, אבל
-- האינדקס הייחודי מעולם לא נוצר במסד (מיגרציות מוחלות כאן ידנית). התוצאה:
-- כל `taskField.upsert` נפל ב-500 עם 42P10 — "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" — כלומר שמירת שדות משימה
-- לא עבדה בכלל. אומת מראש שאין כפילויות taskId.
CREATE UNIQUE INDEX IF NOT EXISTS "TaskField_taskId_key" ON "TaskField"("taskId");
