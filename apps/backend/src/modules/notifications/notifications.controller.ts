import { Controller, Get, Post, Patch, Delete, Param, Query, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  @ApiResponse({ status: 200, description: 'List of notifications' })
  @ApiQuery({ name: 'read', required: false, type: Boolean })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findAll(
    @Req() req: any,
    @Query() filters: any,
  ) {
    return this.notificationsService.findAll({
      userId: req.user.id,
      read: filters.read !== undefined ? filters.read : undefined,
      type: filters.type,
      limit: filters.limit,
      offset: filters.offset,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  async getUnreadCount(
    @Req() req: any,
  ) {
    const count = await this.notificationsService.findUnreadCount(
      req.user.id,
    );
    return { count };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification by ID' })
  @ApiResponse({ status: 200, description: 'Notification details' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async findById(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.notificationsService.findById(id, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({ status: 201, description: 'Notification created' })
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: any,
    @Body() dto: any,
  ) {
    return this.notificationsService.create({
      ...dto,
      userId: req.user.id,
    });
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Create multiple notifications' })
  @ApiResponse({ status: 201, description: 'Notifications created' })
  @HttpCode(HttpStatus.CREATED)
  async createBulk(
    @Req() req: any,
    @Body() notifications: any[],
  ) {
    return this.notificationsService.createBulk(
      notifications.map(n => ({ ...n, userId: req.user.id })),
    );
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markRead(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(id, req.user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllRead(
    @Req() req: any,
  ) {
    return this.notificationsService.markAllRead(req.user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @HttpCode(HttpStatus.OK)
  async delete(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.notificationsService.delete(id, req.user.id);
  }
}