import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomizationRequestListQuery } from '@qinyang/contracts';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { CurrentCustomer } from '../../common/decorators/customer.decorator';
import { CustomizationService } from './customization.service';
import { QuoteService } from '../quote/quotes.service';
import { CreateCustomizationRequestDto } from './dto/customization.dto';
import { QuoteConfirmDto, QuoteRejectDto } from './dto/quote-action.dto';
import { CustomizationRequestQueryDto } from './dto/customization-request-query.dto';

@ApiTags('顾客端 · 定制申请')
@ApiBearerAuth('customer')
@UseGuards(CustomerAuthGuard)
@Controller('customization-requests')
export class CustomizationCustomerController {
  constructor(
    private readonly service: CustomizationService,
    private readonly quotes: QuoteService,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '提交定制申请（含量体资料）' })
  create(
    @Body() dto: CreateCustomizationRequestDto,
    @CurrentCustomer('id') customerId: string,
  ) {
    return this.service.create(dto, customerId);
  }

  @Get()
  @ApiOperation({ summary: '我的定制申请列表' })
  list(
    @Query() query: CustomizationRequestQueryDto,
    @CurrentCustomer('id') customerId: string,
  ) {
    return this.service.listMine(customerId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '定制申请详情' })
  get(@Param('id') id: string, @CurrentCustomer('id') customerId: string) {
    return this.service.getMine(id, customerId);
  }

  @Post(':id/confirm-quote')
  @HttpCode(200)
  @ApiOperation({ summary: '确认报价（必须为当前有效版本）' })
  confirmQuote(
    @Param('id') id: string,
    @Body() dto: QuoteConfirmDto,
    @CurrentCustomer('id') customerId: string,
  ) {
    return this.quotes.confirmByCustomer(id, dto.quoteId, dto.expectedVersion, customerId);
  }

  @Post(':id/reject-quote')
  @HttpCode(200)
  @ApiOperation({ summary: '拒绝报价（申请回到待报价，等待重新报价）' })
  rejectQuote(
    @Param('id') id: string,
    @Body() dto: QuoteRejectDto,
    @CurrentCustomer('id') customerId: string,
  ) {
    return this.quotes.rejectByCustomer(id, dto.quoteId, dto.expectedVersion, customerId, dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '取消定制申请' })
  cancel(@Param('id') id: string, @CurrentCustomer('id') customerId: string) {
    return this.service.cancelByCustomer(id, customerId);
  }
}
