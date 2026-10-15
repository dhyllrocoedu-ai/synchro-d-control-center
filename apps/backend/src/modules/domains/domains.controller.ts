import { Controller, Get, Post, Body, Param, Patch, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { DomainsService } from './domains.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('domains')
@UseGuards(JwtAuthGuard)
export class DomainsController {
  constructor(private domainsService: DomainsService) {}

  @Post()
  async create(@Body() data: any, @Req() req: any) {
    return this.domainsService.create(data);
  }

  @Get()
  async findAll(@Req() req: any, @Query() filters: any) {
    return this.domainsService.findAll(filters);
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    return this.domainsService.getStats();
  }

  @Get('expiring')
  async getExpiring(@Req() req: any, @Query('days') days?: string) {
    return this.domainsService.getExpiring(parseInt(days || '30'));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.domainsService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    return this.domainsService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.domainsService.delete(id);
  }

  @Post(':id/check')
  async checkNow(@Param('id') id: string) {
    return { success: true, message: 'Check queued' };
  }
}