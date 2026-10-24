import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CommerceService } from '../services/commerce.service';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('products')
export class CommerceController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('flash-sales/active') activeSales() { return this.commerce.sales(true); }
  @Get('recommendations') async recommendations() { const result=await this.commerce.ranking(); return {items:result.top,period_days:result.period_days}; }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Get('flash-sales') sales() { return this.commerce.sales(); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Post('flash-sales') save(@Body() body: any) { return this.commerce.saveSale(body); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Put('flash-sales/:id') update(@Param('id',ParseIntPipe) id: number,@Body() body: any) { return this.commerce.saveSale(body,id); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Delete('flash-sales/:id') remove(@Param('id',ParseIntPipe) id: number) { return this.commerce.deleteSale(id); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Get('flash-sale-campaigns') campaigns() { return this.commerce.campaigns(); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Post('flash-sale-campaigns') createCampaign(@Body() body:any) { return this.commerce.saveCampaign(body); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Put('flash-sale-campaigns/:id') updateCampaign(@Param('id',ParseIntPipe) id:number,@Body() body:any) { return this.commerce.saveCampaign(body,id); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Delete('flash-sale-campaigns/:id') deleteCampaign(@Param('id',ParseIntPipe) id:number) { return this.commerce.deleteCampaign(id); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Get('ranking') ranking() { return this.commerce.ranking(); }
  @UseGuards(JwtAuthGuard,RolesGuard) @Roles('ADMIN')
  @Put('ranking') weights(@Body() body: {weights:any}) { return this.commerce.saveRanking(body.weights); }
}
@Controller('table-order')
export class TableOrderController {
  constructor(private readonly commerce: CommerceService) {}
  @Get('menu') menu(@Query('branch_code') branch: string) { return this.commerce.tableMenu(branch); }
  @Post('orders') order(@Body() body:any) { return this.commerce.tableOrder(body); }
}
