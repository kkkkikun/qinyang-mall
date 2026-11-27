import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';

export class AdminLoginDto {
  @ApiProperty({ example: 'owner' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  username: string;

  @ApiProperty({ example: 'change-me-in-env' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password: string;
}

export class CustomerLoginDto {
  @ApiProperty({ description: 'wx.login 返回的 code；mock 模式下形如 dev:openid-001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Trim()
  code: string;
}
