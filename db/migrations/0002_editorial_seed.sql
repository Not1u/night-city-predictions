-- Editorial records only. No production accounts, orders, points or fabricated schedule.
INSERT INTO characters(id,name,codename,category,bio,source_url,created_at,updated_at) VALUES
('weak','微克·金斯利','WEAK','crew','昔日传奇，正在夜城寻找新的方向。','https://www.cyberpunk.net/en/edgerunners2','2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('d','D','D','crew','逐渐接近真相的流浪者与黑客。','https://www.cyberpunk.net/en/edgerunners2','2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('roman','罗曼·卡拉克斯','ROMAN','crew','用镜头记录夜城的人。','https://www.cyberpunk.net/en/edgerunners2','2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('talia','塔莉亚·杨','TALIA','crew','在公司与帮派之间寻找自己的道路。','https://www.cyberpunk.net/en/edgerunners2','2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('avida','阿维达','AVIDA','associated','牵动新团队命运的关联人物。',NULL,'2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('sal','萨尔','SAL','associated','超梦世界里的夜城居民。',NULL,'2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('jessie','杰西','JESSIE','associated','在超梦与现实之间工作的工程师。',NULL,'2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('kitano','北野','KITANO','associated','来自荒坂的公司人物。',NULL,'2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('richard','理查德','RICHARD','associated','来自康陶的公司人物。',NULL,'2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z'),
('kiril','基里尔·杨','KIRIL','associated','塔莉亚的父亲，康陶高管。',NULL,'2026-10-13T00:00:00.000Z','2026-10-13T00:00:00.000Z');
INSERT INTO rounds(id,episode,title,status,created_at) VALUES('episode-01',1,'第一集','draft','2026-10-13T00:00:00.000Z');
INSERT INTO round_characters(round_id,character_id) SELECT 'episode-01',id FROM characters WHERE category <> 'memory';
