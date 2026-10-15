import { Controller, Get, Post, Body, Param, Patch, Query, UseGuards, Req } from '@nestjs/common';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('approvals')
@UseGuards(JwtAuthGuard)
export class ApprovalsController {
  constructor(private approvalsService: ApprovalsService) {}

  @Post()
  async create(@Body() data: any, @Req() req: any) {
    return this.approvalsService.create(req.user.sub, data);
  }

  @Get()
  async findAll(@Query() filters: any) {
    return this.approvalsService.findAll(filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.approvalsService.findById(id);
  }

  @Post(':id/approve')
  async approve(@Param('id') id: string, @Req() req: any, @Body() data: { comment?: string }) {
    return this.approvalsService.approve(id, req.user.sub, data.comment);
  }

  @Post(':id/reject')
  async reject(@Param('id') id: string, @Req() req: any, @Body() data: { comment?: string }) {
    return this.approvalsService.reject(id, req.user.sub, data.comment);
  }
}