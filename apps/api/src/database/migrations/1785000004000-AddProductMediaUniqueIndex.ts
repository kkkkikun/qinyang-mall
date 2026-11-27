import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 商品图集的唯一性下沉到数据库。
 *
 * 背景：
 * `products.addMedia` 此前是「先查后写」—— 先按 (productId, storageKey) 查一条，
 * 没有就插入。两个店员同时把**同一张图**加入同一个商品时，两边都查不到，
 * 于是各插一条同 storageKey 的行 → 顾客端图集里同一张图出现两次。
 *
 * 与本仓库既有约束一致（orders.requestId、quotes(requestId, version)、
 * quotes.activeRequestId、measurement_templates(code, version)）：
 * 唯一性由**数据库**裁决 —— 并发写入时后者必然拿到重复键错误，
 * 而不是静默产生重复数据；应用层再把重复键翻译成 409。
 *
 * 迁移前必须先清理存量重复行，否则唯一索引建不上。
 * 这里删的是同一张图的**重复副本**，不是业务数据：
 * 同一个 (productId, storageKey) 多条记录在业务上没有第二种含义，
 * 因此按 id 升序保留一条、删除其余（与「历史数据只归档不删除」的策略不同，
 * 因为被删的并不是任何实体的历史版本）。
 */
export class AddProductMediaUniqueIndex1785000004000 implements MigrationInterface {
  name = 'AddProductMediaUniqueIndex1785000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) 先统计重复行数量并写进迁移日志，便于事后核对清理规模
    const rows: Array<{ cnt: string | number }> = await queryRunner.query(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT \`id\` FROM (
           SELECT \`id\`,
                  ROW_NUMBER() OVER (PARTITION BY \`productId\`, \`storageKey\` ORDER BY \`id\` ASC) AS rn
           FROM \`product_media\`
         ) t WHERE t.rn > 1
       ) d`,
    );
    const duplicated = Number(rows?.[0]?.cnt ?? 0);
    console.log(`[AddProductMediaUniqueIndex] 清理重复图集行：${duplicated} 条`);
    if (duplicated > 0) {
      // 2) 删除重复行，同一 (productId, storageKey) 下保留 id 最小的一条
      //    派生表多包一层：绕开 MySQL「删除时不能直接查同一张表」的限制
      await queryRunner.query(
        `DELETE FROM \`product_media\` WHERE \`id\` IN (
           SELECT \`id\` FROM (
             SELECT \`id\`,
                    ROW_NUMBER() OVER (PARTITION BY \`productId\`, \`storageKey\` ORDER BY \`id\` ASC) AS rn
             FROM \`product_media\`
           ) t WHERE t.rn > 1
         )`,
      );
    }

    // 3) 同一商品的同一个 storageKey 只能有一条图集记录
    await queryRunner.query(
      `ALTER TABLE \`product_media\`
         ADD UNIQUE INDEX \`UQ_product_media_productId_storageKey\` (\`productId\`, \`storageKey\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`product_media\` DROP INDEX \`UQ_product_media_productId_storageKey\``,
    );
  }
}
