import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { MigrationService } from './migration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('migration')
@UseGuards(JwtAuthGuard)
export class MigrationController {
  constructor(private migrationService: MigrationService) {}

  @Post('supabase')
  async importFromSupabase(@Body() data: any, @Req() req: any) {
    return this.migrationService.importFromSupabase(data);
  }
}