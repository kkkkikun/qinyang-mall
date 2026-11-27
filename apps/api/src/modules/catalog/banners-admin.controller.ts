import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsIn,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AdminRole, BannerUpsertRequest } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { BannersService } from './banners.service';
import { Trim, TrimNullable } from '../../common/decorators/trim.decorator';

export class BannerUpsertDto implements BannerUpsertRequest {
  @ApiProperty({ example: '琴扬精纺羊绒 · 定制服饰' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Trim()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Trim()
  imageUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Trim()
  storageKey?: string;

  @ApiProperty({ enum: ['NONE', 'PRODUCT', 'CATEGORY', 'PAGE'] })
  @IsIn(['NONE', 'PRODUCT', 'CATEGORY', 'PAGE'])
  linkType!: 'NONE' | 'PRODUCT' | 'CATEGORY' | 'PAGE';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  linkValue?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsDateString()
  @TrimNullable()
  startAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsDateString()
  @TrimNullable()
  endAt?: string | null;
}

@ApiTags('管理端 · 首页轮播')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/banners')
export class BannersAdminController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  @ApiOperation({ summary: '轮播列表' })
  list() {
    return this.banners.listAll();
  }

  @Post()
  @ApiOperation({ summary: '新增轮播' })
  create(@Body() dto: BannerUpsertDto, @CurrentAdmin() admin: AdminPrincipal) {
    return this.banners.create(dto, admin);
  }

  @Put(':id')
  @ApiOperation({ summary: '修改轮播' })
  update(
    @Param('id') id: string,
    @Body() dto: BannerUpsertDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.banners.update(id, dto, admin);
  }

  @Delete(':id')
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '删除轮播（店主专属）' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.banners.remove(id, admin);
  }
}
