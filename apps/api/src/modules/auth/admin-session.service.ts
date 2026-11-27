import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminRole } from '@qinyang/contracts';
import { AdminUser as AdminUserEntity } from '../../database/entities/admin-user.entity';
import { BusinessException } from '../../common/errors/business.exception';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

/**
 * 管理员会话的**现况**解析。
 *
 * 背景：
 * 管理员令牌里带着 `role`，此前守卫直接信任它，令牌有效期内（默认 8–12 小时）
 * **角色/状态一律不变**。于是：
 *
 * - 店主把店员降为普通权限后，那个店员手上的旧令牌**依然能调店主专属接口**
 *   （改价、删商品、取消订单）；
 * - 账号被停用后，旧令牌**仍可用到自然过期**。
 *
 * 也就是说「停用一个账号」这件事在最长一个令牌周期内是不生效的 ——
 * 这对一个小商家的后台来说是不能接受的。
 *
 * 修法：
 * **令牌只作身份凭据，权限一律取库里的现况。**
 * 每次管理员请求按主键读一次管理员行（后台流量很小，一次主键查询可以忽略），
 * 账号不存在或已停用 → 401；角色以**库里的**为准。
 * 降权 / 停用立刻生效，不留窗口。
 */
@Injectable()
export class AdminSessionService {
  private readonly logger = new Logger(AdminSessionService.name);

  constructor(
    @InjectRepository(AdminUserEntity)
    private readonly repo: Repository<AdminUserEntity>,
  ) {}

  /**
   * 按令牌里的账号 id 解析**当前**的管理员身份。
   *
   * @param id 令牌里的管理员 id
   * @param fallbackRole 令牌里带的角色 —— 仅在极端情况（库不可达）下兜底，
   *                     正常路径一律以库里的角色为准
   */
  async resolve(id: string, fallbackRole: AdminRole): Promise<AdminPrincipal> {
    const user = await this.repo.findOne({ where: { id } });

    if (!user) {
      // 账号被删除：令牌立刻作废
      this.logger.warn(`管理员令牌对应的账号不存在（id=${id}），拒绝该请求`);
      throw BusinessException.unauthorized('登录状态无效或账号已不存在，请重新登录');
    }

    if (user.status !== 'ACTIVE') {
      this.logger.warn(`管理员账号已停用（id=${id}, status=${user.status}），拒绝该请求`);
      throw BusinessException.unauthorized('账号已停用，请联系店主');
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      // 以库里的角色为准：降权立刻生效
      role: user.role,
    };
  }
}
