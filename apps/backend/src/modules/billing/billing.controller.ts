import { Controller, Get, Post, Body, Param, Patch, UseGuards, Req } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('subscriptions')
  async getSubscriptions(@Req() req: any) {
    return this.billingService.getSubscriptions();
  }

  @Post('subscriptions')
  async createSubscription(@Req() req: any, @Body() data: { domainId: string; planId: string; billingCycle: string; pricePerYear: number }) {
    return this.billingService.createSubscription(data.domainId, data.planId, data);
  }

  @Post('subscriptions/:id/cancel')
  async cancelSubscription(@Param('id') id: string) {
    return this.billingService.cancelSubscription(id);
  }

  @Post('subscriptions/:id/renew')
  async renewSubscription(@Param('id') id: string) {
    return this.billingService.renewSubscription(id);
  }

  @Get('invoices')
  async getInvoices(@Req() req: any) {
    return this.billingService.getInvoices();
  }
}