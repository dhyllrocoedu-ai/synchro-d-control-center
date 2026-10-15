import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  async create(@Body() data: { email: string; password: string; name: string; role?: string }) {
    return this.usersService.create(data);
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.usersService.findAll();
  }

  @Get('me')
  async getProfile(@Req() req: any) {
    return this.usersService.findById(req.user.sub);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: { name?: string; avatarUrl?: string; role?: string }) {
    return this.usersService.update(id, data);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.usersService.delete(id);
    return { success: true };
  }

  // Password & 2FA endpoints
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Req() req: any,
    @Body() data: { currentPassword: string; newPassword: string }
  ) {
    return this.usersService.changePassword(req.user.sub, data.currentPassword, data.newPassword);
  }

  @Post('2fa/generate')
  @HttpCode(HttpStatus.OK)
  async generate2FA(@Req() req: any) {
    return this.usersService.generate2FASecret(req.user.sub);
  }

  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm2FA(@Req() req: any, @Body() data: { token: string }) {
    return this.usersService.confirm2FA(req.user.sub, data.token);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disable2FA(@Req() req: any, @Body() data: { password: string }) {
    return this.usersService.disable2FA(req.user.sub, data.password);
  }
}