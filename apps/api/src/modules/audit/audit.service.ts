import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AdminRole, AuditLogDto, AuditLogListQuery, Paginated } from '@qinyang/contracts';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

export interface AuditRecordInput {
  actorId?: string | null;
  actorName?: string | null;
  actorRole?: AdminRole | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * 需要脱敏的字段名。量体资料、联系方式、收货地址属于敏感数据，
 * 审计留痕只保留变更事实，不落明文。
 */
const REDACTED_KEYS = new Set([
  'contact',
  'customerContact',
  'measurements',
  'measurementSnapshot',
  'measurementFields',
  'phone',
  'detail',
  'address',
  'remark',
  'note',
  'passwordHash',
  'password',
]);

const redact = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    output[key] = REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(item);
  }
  return output;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** 写审计记录。审计失败不得阻断主业务，仅记录错误。 */
  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.repo.insert({
        actorId: input.actorId ?? null,
        actorName: input.actorName ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        before: (input.before === undefined ? null : redact(input.before)) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        after: (input.after === undefined ? null : redact(input.after)) as any,
        ip: input.ip ?? null,
      });
    } catch (error) {
      this.logger.error(
        `审计写入失败 action=${input.action} target=${input.targetType}:${input.targetId ?? '-'}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async list(query: AuditLogListQuery): Promise<Paginated<AuditLogDto>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.repo.createQueryBuilder('log');
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.targetType) {
      qb.andWhere('log.targetType = :targetType', { targetType: query.targetType });
    }
    if (query.targetId) qb.andWhere('log.targetId = :targetId', { targetId: query.targetId });
    if (query.actorId) qb.andWhere('log.actorId = :actorId', { actorId: query.actorId });

    qb.orderBy('log.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();

    return {
      items: items.map((log) => ({
        id: log.id,
        actorId: log.actorId,
        actorName: log.actorName ?? '',
        actorRole: log.actorRole,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        before: log.before ?? null,
        after: log.after ?? null,
        ip: log.ip,
        createdAt: log.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    };
  }
}
