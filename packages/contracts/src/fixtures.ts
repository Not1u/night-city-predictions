import type { Character, Round, RoundCharacter } from './index';
/** Shared editorial fixture; presentation-layer assets are mapped in apps/web. */
export const characters: Character[] = [
  ['weak', '微克·金斯利', 'WEAK', 'crew', '昔日传奇，正在夜城寻找新的方向。'],
  ['d', 'D', 'D', 'crew', '逐渐接近真相的流浪者与黑客。'],
  ['roman', '罗曼·卡拉克斯', 'ROMAN', 'crew', '用镜头记录夜城的人。'],
  ['talia', '塔莉亚·杨', 'TALIA', 'crew', '在公司与帮派之间寻找自己的道路。'],
  ['avida', '阿维达', 'AVIDA', 'associated', '牵动新团队命运的关联人物。'],
  ['sal', '萨尔', 'SAL', 'associated', '超梦世界里的夜城居民。'],
  ['jessie', '杰西', 'JESSIE', 'associated', '在超梦与现实之间工作的工程师。'],
  ['kitano', '北野', 'KITANO', 'associated', '来自荒坂的公司人物。'],
  ['richard', '理查德', 'RICHARD', 'associated', '来自康陶的公司人物。'],
  ['kiril', '基里尔·杨', 'KIRIL', 'associated', '塔莉亚的父亲，康陶高管。']
].map(([id, name, codename, group, bio]) => ({ id, name, codename, group: group as Character['group'], bio, image_url: null, death_image_url: null, source_url: 'https://www.cyberpunk.net/en/edgerunners2' }));
export const memories = ['大卫', '露西', '丽贝卡', '曼恩', '多莉欧', '琦薇', '法拉第', '皮拉'];
export function demoRounds(now = Date.now()): Round[] {
  return [
    { id: 'demo-01', episode: 1, title: '夜城，没有既定结局', status: 'open', opens_at: new Date(now - 3600000).toISOString(), closes_at: new Date(now + 86400000 * 2 + 3600000 * 7).toISOString(), previous_round_id: null, pool_total: 0, participant_count: 0 },
    { id: 'demo-02', episode: 2, title: '故事尚未展开', status: 'draft', opens_at: null, closes_at: null, previous_round_id: 'demo-01', pool_total: 0, participant_count: 0 }
  ];
}
export const emptyRoundCharacters = (): RoundCharacter[] => characters.map(c => ({ ...c, death_confirmed: false, odds: { character_id: c.id, stake_total: 0, participant_count: 0, opening_reference: { numerator: 1, denominator: 1 }, live_reference: null } }));
