import { MigrationInterface, QueryRunner } from 'typeorm';

/** 新增图文说明页表 */
export class CreateGuidePages1785000001000 implements MigrationInterface {
  name = 'CreateGuidePages1785000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE \`guide_pages\` (
      \`id\` varchar(36) NOT NULL,
      \`slug\` varchar(64) NOT NULL,
      \`title\` varchar(128) NOT NULL,
      \`summary\` varchar(255) NULL,
      \`sections\` json NOT NULL,
      \`sortOrder\` int NOT NULL DEFAULT 0,
      \`status\` varchar(16) NOT NULL DEFAULT 'ACTIVE',
      \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`UQ_guide_pages_slug\` (\`slug\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `guide_pages`');
  }
}
