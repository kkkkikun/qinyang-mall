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
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminRole } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { CategoriesService } from './categories.service';
import { Trim } from '../../common/decorators/trim.decorator';
import { CategoryUpsertRequest } from '@qinyang/contracts';

export class CategoryUpsertDto implements CategoryUpsertRequest {
  @ApiProperty({ example: 'knitwear-cardigan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  code!: string;

  @ApiProperty({ example: '开衫' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  parentId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' })
  @IsOptional()
  @IsIn(['ACTIVE', 'DISABLED'])
  status?: 'ACTIVE' | 'DISABLED';
}

@ApiTags('管理端 · 分类')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/categories')
export class CategoriesAdminController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: '分类树' })
  list() {
    return this.categories.tree(false);
  }

  @Post()
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '新增分类（店主专属）' })
  create(@Body() dto: CategoryUpsertDto, @CurrentAdmin() admin: AdminPrincipal) {
    return this.categories.create(dto, admin);
  }

  @Put(':id')
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '修改分类（店主专属）' })
  update(
    @Param('id') id: string,
    @Body() dto: CategoryUpsertDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.categories.update(id, dto, admin);
  }

  @Delete(':id')
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '删除分类（店主专属）' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.categories.remove(id, admin);
  }
}
