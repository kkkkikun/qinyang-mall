import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaRole, MediaDto } from '@qinyang/contracts';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StorageService } from '../storage/storage.service';
import { UploadQueryDto } from './dto/product.dto';

/** multer 上传文件对象（类型来自 @types/multer） */
type MulterFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * 图片上传（受控文件存储）。上传只负责落盘与返回对象键，
 * 绑定到商品图集由 `/admin/products/:id/media` 完成。
 */
@ApiTags('管理端 · 媒体')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/media')
export class MediaAdminController {
  constructor(private readonly storage: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传图片' })
  async upload(
    @UploadedFile() file: MulterFile | undefined,
    @Body() query: UploadQueryDto,
  ): Promise<MediaDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('缺少上传文件');
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('仅支持 JPEG / PNG / WebP 图片');
    }
    if (file.buffer.byteLength > MAX_BYTES) {
      throw new BadRequestException('图片超过 8MB 限制');
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    const key = `uploads/${month}/${randomUUID()}${ext}`;

    const stored = await this.storage.put(key, file.buffer, file.mimetype);

    return {
      id: '',
      storageKey: stored.key,
      url: stored.url,
      role: query.role ?? MediaRole.DETAIL,
      width: 0,
      height: 0,
      bytes: stored.bytes,
      sortOrder: 0,
      productId: null,
      alt: null,
    };
  }
}
