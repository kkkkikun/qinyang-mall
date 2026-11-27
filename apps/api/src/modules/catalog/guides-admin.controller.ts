import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminRole, GuidePageUpsertRequest, GuideSectionUpsertPayload } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { Trim, TrimNullable } from '../../common/decorators/trim.decorator';
import { GuidesService } from './guides.service';

/** 图文说明页的一个分节 */
export class GuideSectionUpsertDto implements GuideSectionUpsertPayload {
  @ApiProperty({ example: 'net-measure' })
  @IsString()
  @MaxLength(64)
  @Trim()
  id: string;

  @ApiProperty({ example: '净体测量' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Trim()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @TrimNullable()
  description?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @MaxLength(2000, { each: true })
  @IsString({ each: true })
  items: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  illustration?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @MaxLength(64, { each: true })
  @IsString({ each: true })
  fieldCodes: string[];
}

/** 图文说明页更新请求体 */
export class GuidePageUpsertDto implements GuidePageUpsertRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Trim()
  title?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  summary?: string | null;

  @ApiPropertyOptional({ type: [GuideSectionUpsertDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GuideSectionUpsertDto)
  sections?: GuideSectionUpsertDto[];
}

@ApiTags('管理端 · 图文说明')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/guides')
export class GuidesAdminController {
  constructor(private readonly guides: GuidesService) {}

  @Get()
  @ApiOperation({ summary: '图文说明页列表（含停用）' })
  list() {
    return this.guides.listAll();
  }

  @Put(':slug')
  // 店员可改（与「编辑商品文案」同属内容维护）；启停不在本接口范围内
  @Roles(AdminRole.OWNER, AdminRole.STAFF)
  @ApiOperation({ summary: '更新图文说明页（标题 / 摘要 / 分节内容）' })
  update(
    @Param('slug') slug: string,
    @Body() dto: GuidePageUpsertDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.guides.update(slug, dto, admin);
  }
}
