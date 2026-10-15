import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(private notesService: NotesService) {}

  @Get()
  async findAll(@Query('domainId') domainId: string) {
    return this.notesService.list(domainId);
  }

  @Post()
  async create(@Req() req: any, @Body() data: { domainId: string; content: string }) {
    return this.notesService.create(req.user.sub, data.domainId, data.content);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.notesService.remove(id);
  }
}
