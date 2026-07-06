import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BackupService } from './backup.service';

/**
 * דשבורד בקרה/גיבוי — מנהלי מערכת בלבד (ADMIN).
 * /backup/health — ספירות + סימני חיים של המסד (מהיר, לרענון תכוף)
 * /backup/snapshot — כל הנתונים המלאים לתצוגה בטבלאות
 */
@Controller('backup')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('health')
  health() {
    return this.backup.health();
  }

  @Get('snapshot')
  snapshot() {
    return this.backup.snapshot();
  }
}
