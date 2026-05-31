# 技能设计大纲 V1

## 公式表

### 参数速查

| id  | name                     | 数值 | 说明                       |
| --- | ------------------------ | ---- | -------------------------- |
| 1   | damage.varianceMin       | 0.95 | 伤害随机浮动下限           |
| 2   | damage.varianceMax       | 1.05 | 伤害随机浮动上限           |
| 3   | damage.levelInfluence    | 0.01 | 每等级差对伤害的影响系数   |
| 4   | damage.minDamage         | 1    | 最小伤害保底               |
| 5   | affinity.weak            | 1.5  | 弱点倍率                   |
| 6   | affinity.resist          | 0.5  | 耐性倍率                   |
| 7   | affinity.nullify         | 0    | 无效/吸收/反射时伤害为 0   |
| 8   | affinity.normal          | 1.0  | 普通无克制无耐性倍率       |
| 9   | hitRate.agilityInfluence | 0.2  | 敏捷差对命中率的影响系数   |
| 10  | hitRate.minHitRate       | 5    | 最终命中率下限（%）        |
| 11  | hitRate.maxHitRate       | 95   | 最终命中率上限（%）        |
| 12  | critRate.base            | 5    | 基础暴击率（%）            |
| 13  | critRate.agilityBonus    | 0.1  | 敏捷转化为暴击率的系数     |
| 14  | critRate.max             | 50   | 暴击率上限（%）            |
| 15  | exp.baseExpToNext        | 50   | 升到下一级所需的基础经验值 |
| 16  | exp.levelExponent        | 1.5  | 经验曲线指数               |
| 17  | guard.damageReduction    | 1    | 防御时伤害减免系数         |
| 18  | damage.defenceInfluence  | 0.01 | 防御值对伤害的影响         |

### 核心公式

| id  | 公式           | 表达式                                                                                                       |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | 伤害           | damage = sqrt(power) \* sqrt(attack or intelligence) \* variance \*affinity\* levelBonus \* defenceInfluence |
| 3   | 治疗           | heal = targetMaxHP \* healRatio                                                                              |
| 4   | 防御力伤害补正 | defenceInfluence = 3 / (2 + (targetDefence / attack or intelligence))                                        |

> 暴击时 damage \* 1.5，蓄力/吟唱时 damage \* 2，专注时必定暴击。

## 状态表

| id  | effectId         | name           | type    | dur | statModifiers   | dmg% | 说明                                            |
| --- | ---------------- | -------------- | ------- | --- | --------------- | ---- | ----------------------------------------------- |
| 1   | attack_up        | 攻击力上升     | buff    | 3   | attack: \*1.25  | -    | 与 attack_down 互相抵消，可堆叠2次              |
| 2   | attack_down      | 攻击力下降     | debuff  | 3   | attack: \*0.75  | -    | 与 attack_up 互相抵消，可堆叠2次                |
| 3   | defense_up       | 防御力上升     | buff    | 3   | defense: \*1.25 | -    | 与 defense_down 互相抵消，可堆叠2次             |
| 4   | defense_down     | 防御力下降     | debuff  | 3   | defense: \*0.75 | -    | 与 defense_up 互相抵消，可堆叠2次               |
| 5   | agility_up       | 敏捷上升       | buff    | 3   | agility: \*1.25 | -    | 与 agility_down 互相抵消，可堆叠2次             |
| 6   | agility_down     | 敏捷下降       | debuff  | 3   | agility: \*0.75 | -    | 与 agility_up 互相抵消，可堆叠2次               |
| 7   | charge           | 蓄力           | buff    | ∞   | -               | -    | 下一次物理伤害 \*2，命中后消失，miss 不消耗     |
| 8   | chant            | 吟唱           | buff    | ∞   | -               | -    | 下一次魔法伤害 \*2，命中后消失，miss 不消耗     |
| 9   | focus            | 专注           | buff    | ∞   | -               | -    | 下一次物理攻击必定暴击，命中后消失，miss 不消耗 |
| 10  | fire_null        | 火焰无效盾     | buff    | 1   | -               | -    | 1回合/1次：火属性伤害无效，同角色覆盖           |
| 11  | fire_reflect     | 火焰反射盾     | buff    | 1   | -               | -    | 1回合/1次：火属性伤害反弹回攻击者，同角色覆盖   |
| 12  | fire_absorb      | 火焰吸收盾     | buff    | 1   | -               | -    | 1回合/1次：火属性伤害转换为 HP，同角色覆盖      |
| 13  | ice_null         | 冰水无效盾     | buff    | 1   | -               | -    | 1回合/1次：冰属性伤害无效，同角色覆盖           |
| 14  | ice_reflect      | 冰水反射盾     | buff    | 1   | -               | -    | 1回合/1次：冰属性伤害反弹，同角色覆盖           |
| 15  | ice_absorb       | 冰水吸收盾     | buff    | 1   | -               | -    | 1回合/1次：冰属性伤害转换为 HP，同角色覆盖      |
| 16  | wind_null        | 疾风无效盾     | buff    | 1   | -               | -    | 1回合/1次：风属性伤害无效，同角色覆盖           |
| 17  | wind_reflect     | 疾风反射盾     | buff    | 1   | -               | -    | 1回合/1次：风属性伤害反弹，同角色覆盖           |
| 18  | wind_absorb      | 疾风吸收盾     | buff    | 1   | -               | -    | 1回合/1次：风属性伤害转换为 HP，同角色覆盖      |
| 19  | electric_null    | 雷鸣无效盾     | buff    | 1   | -               | -    | 1回合/1次：雷属性伤害无效，同角色覆盖           |
| 20  | electric_reflect | 雷鸣反射盾     | buff    | 1   | -               | -    | 1回合/1次：雷属性伤害反弹，同角色覆盖           |
| 21  | electric_absorb  | 雷鸣吸收盾     | buff    | 1   | -               | -    | 1回合/1次：雷属性伤害转换为 HP，同角色覆盖      |
| 22  | earth_null       | 岩土无效盾     | buff    | 1   | -               | -    | 1回合/1次：土属性伤害无效，同角色覆盖           |
| 23  | earth_reflect    | 岩土反射盾     | buff    | 1   | -               | -    | 1回合/1次：土属性伤害反弹，同角色覆盖           |
| 24  | earth_absorb     | 岩土吸收盾     | buff    | 1   | -               | -    | 1回合/1次：土属性伤害转换为 HP，同角色覆盖      |
| 25  | element_null     | 全元素无效盾   | buff    | 1   | -               | -    | 1回合/1次：火冰风雷土全无效，同角色覆盖         |
| 26  | physical_null    | 物理无效盾     | buff    | 1   | -               | -    | 1回合/1次：物理伤害无效，同角色覆盖             |
| 27  | physical_reflect | 物理反射盾     | buff    | 1   | -               | -    | 1回合/1次：物理伤害反弹，同角色覆盖             |
| 28  | physical_absorb  | 物理吸收盾     | buff    | 1   | -               | -    | 1回合/1次：物理伤害转换为 HP，同角色覆盖        |
| 29  | ailment_null     | 异常状态无效盾 | buff    | 1   | -               | -    | 1回合/1次：异常状态附加无效，同角色覆盖         |
| 30  | sleep            | 睡眠           | ailment | 3   | -               | -    | 无法行动，每回合恢复 5% HP/MP，被攻击必定暴击   |
| 31  | poison           | 中毒           | dot     | 3   | -               | 10   | 每回合扣除 10% 最大 HP                          |
| 32  | seal             | 封技           | ailment | 3   | -               | -    | 无法使用技能                                    |
| 33  | blind            | 致盲           | ailment | 3   | -               | -    | 技能命中率 −30%（加法）                         |
| 34  | instant_death    | 即死           | ailment | 1   | -               | -    | 立即战斗不能，Boss 免疫                         |
| 35  | burn             | 燃烧           | dot     | 3   | -               | 10   | 每回合扣 10% 最大 HP，受风属性伤害 +50%         |
| 36  | freeze           | 冻结           | ailment | 1   | -               | -    | 无法行动，物理攻击贯穿耐性且必定暴击            |
| 37  | paralyze         | 麻痹           | ailment | 3   | attack: *0.75   | -    | 物理伤害 −25%，受土属性伤害 +50%                |
| 38  | guard            | 防御           | buff    | 1   | -               | -    | 本回合受到的伤害减免 20%                        |

> **盾类规则**（id 10-29）：同角色同盾类只能存在一种，后施放的覆盖先施放的。
> **增减益规则**（id 1-6）：同名可堆叠（如 attack_up *2），同名正负互相抵消。
> **蓄力/吟唱/专注**（id 7-9）：持续时间无限，命中后自动移除，miss 时不消耗。
> **状态异常**（id 30-37）：Boss 免疫即死，其他异常 Boss 有不同抗性。冻结仅有 1 回合。

## 技能表

### 物理·剑系（1-18）

| id  | name      | description                                                  | category | element  | power | mpCost | targetType   | accuracy | statDriver | statusEffects                            |
| --- | --------- | ------------------------------------------------------------ | -------- | -------- | ----- | ------ | ------------ | -------- | ---------- | ---------------------------------------- |
| 1   | 攻击      | 对一名敌人造成物理属性少量伤害                               | physical | physical | 10    | 0      | single_enemy | 90       | attack     |                                          |
| 2   | 斩击      | 对一名敌人造成物理属性少量伤害                               | physical | physical | 12    | 4      | single_enemy | 95       | attack     |                                          |
| 3   | 横扫      | 对全体敌人造成物理属性少量伤害                               | physical | physical | 9     | 5      | all_enemies  | 95       | attack     |                                          |
| 4   | 突击      | 对一名敌人造成高暴击率的物理属性少量伤害，命中率较低         | physical | physical | 11    | 10     | single_enemy | 50       | attack     |                                          |
| 5   | 破甲击    | 对一名敌人造成物理属性少量伤害，附加3回合的防御力下降效果    | physical | physical | 12    | 10     | single_enemy | 90       | attack     | defense_down(chance=100, duration=3)     |
| 6   | 猛拳      | 对一名敌人造成2次物理属性少量伤害                            | physical | physical | 6     | 6      | single_enemy | 95       | attack     |                                          |
| 7   | 半月斩    | 对一名敌人造成物理属性中量伤害                               | physical | physical | 20    | 12     | single_enemy | 95       | attack     |                                          |
| 8   | 破空斩    | 对全体敌人造成物理属性中量伤害                               | physical | physical | 16    | 14     | all_enemies  | 95       | attack     |                                          |
| 9   | 流云·燕返 | 对一名敌人造成物理属性中量伤害，赋予自身3回合的敏捷上升效果  | physical | physical | 20    | 14     | single_enemy | 95       | attack     | agility_up(self, chance=200, duration=3) |
| 10  | 舍身一击  | 对一名敌人造成高暴击率的物理属性中量伤害                     | physical | physical | 26    | 16     | single_enemy | 55       | attack     |                                          |
| 11  | 居合      | 对一名敌人造成物理属性中量伤害，暴击时威力提升               | physical | physical | 22    | 14     | single_enemy | 90       | attack     |                                          |
| 12  | 震地猛冲  | 对全体敌人造成高暴击率的物理属性中量伤害，命中率较低         | physical | physical | 20    | 20     | all_enemies  | 50       | attack     |                                          |
| 13  | 大切断    | 对一名敌人造成物理属性大量伤害                               | physical | physical | 48    | 24     | single_enemy | 90       | attack     |                                          |
| 14  | 怪力乱神  | 对一名敌人造成2~3次物理属性中量伤害                          | physical | physical | 18    | 22     | single_enemy | 90       | attack     |                                          |
| 15  | 暴乱之舞  | 对全体敌人造成物理属性大量伤害                               | physical | physical | 38    | 32     | all_enemies  | 90       | attack     |                                          |
| 16  | 冥界之门  | 对全体敌人造成物理属性大量伤害，剩余生命值越低，伤害越高     | physical | physical | 40    | 34     | all_enemies  | 90       | attack     |                                          |
| 17  | 限界破灭  | 对全体敌人造成2~3次物理属性大量伤害，附加3回合的敏捷下降效果 | physical | physical | 20    | 38     | all_enemies  | 90       | attack     | agility_down(chance=200, duration=3)     |
| 18  | 神之手    | 对一名敌人造成物理属性特大伤害                               | physical | physical | 80    | 45     | single_enemy | 90       | attack     |                                          |

### 物理·弓系（19-28）

| id  | name         | description                                              | category | element  | power | mpCost | targetType   | accuracy | statDriver | statusEffects                 |
| --- | ------------ | -------------------------------------------------------- | -------- | -------- | ----- | ------ | ------------ | -------- | ---------- | ----------------------------- |
| 19  | 瞄准射击     | 对一名敌人造成物理属性少量伤害                           | physical | physical | 10    | 2      | single_enemy | 100      | attack     |                               |
| 20  | 速射         | 对一名敌人造成1~2次物理属性少量伤害                      | physical | physical | 8     | 5      | single_enemy | 95       | attack     |                               |
| 21  | 乱箭         | 对全体敌人造成1~2次物理属性少量伤害                      | physical | physical | 6     | 6      | all_enemies  | 90       | attack     |                               |
| 22  | 流星         | 对一名敌人造成物理属性中量伤害                           | physical | physical | 24    | 12     | single_enemy | 95       | attack     |                               |
| 23  | 毒箭         | 对一名敌人造成物理属性中量伤害，附加毒效果               | physical | physical | 20    | 14     | single_enemy | 90       | attack     | poison(chance=60, duration=3) |
| 24  | 五月雨击     | 对全体敌人造成2~4次物理属性少量伤害                      | physical | physical | 5     | 10     | all_enemies  | 90       | attack     |                               |
| 25  | 万箭齐发     | 对全体敌人造成物理属性中量伤害                           | physical | physical | 18    | 16     | all_enemies  | 90       | attack     |                               |
| 26  | 狙杀         | 对一名敌人造成高命中率的物理属性大量伤害，暴击时威力提升 | physical | physical | 44    | 26     | single_enemy | 100      | attack     |                               |
| 27  | 刹那五月雨击 | 对全体敌人造成2~4次物理属性中量伤害                      | physical | physical | 10    | 22     | all_enemies  | 90       | attack     |                               |
| 28  | 彗星         | 对全体敌人造成1~2次物理属性大量伤害                      | physical | physical | 26    | 32     | all_enemies  | 90       | attack     |                               |

### 物理·枪系（29-36）

| id  | name   | description                                               | category | element  | power | mpCost | targetType   | accuracy | statDriver | statusEffects                        |
| --- | ------ | --------------------------------------------------------- | -------- | -------- | ----- | ------ | ------------ | -------- | ---------- | ------------------------------------ |
| 29  | 穿刺   | 对一名敌人造成高暴击率的物理属性少量伤害                  | physical | physical | 12    | 6      | single_enemy | 70       | attack     |                                      |
| 30  | 回马枪 | 对一名敌人造成2次物理属性少量伤害                         | physical | physical | 8     | 6      | single_enemy | 95       | attack     |                                      |
| 31  | 螺旋突 | 对一名敌人造成物理属性中量伤害，附加3回合的防御力下降效果 | physical | physical | 22    | 14     | single_enemy | 90       | attack     | defense_down(chance=200, duration=3) |
| 32  | 幽影枪 | 对全体敌人造成高命中率的物理属性中量伤害                  | physical | physical | 16    | 16     | all_enemies  | 100      | attack     |                                      |
| 33  | 血枪刺 | 对一名敌人造成物理属性大量伤害                            | physical | physical | 50    | 24     | single_enemy | 90       | attack     |                                      |
| 34  | 破筋钻 | 对全体敌人造成物理属性中量伤害，附加3回合的攻击力下降效果 | physical | physical | 18    | 18     | all_enemies  | 90       | attack     | attack_down(chance=200, duration=3)  |
| 35  | 穿心   | 对一名敌人造成高命中率的物理属性大量伤害，暴击时威力提升  | physical | physical | 46    | 28     | single_enemy | 100      | attack     |                                      |
| 36  | 枪雨   | 对全体敌人造成物理属性特大伤害，概率附加3回合的封技效果   | physical | physical | 60    | 50     | all_enemies  | 90       | attack     | seal(chance=40, duration=3)          |

### 火系魔法（37-43）

| id  | name     | description                                                     | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects               |
| --- | -------- | --------------------------------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | --------------------------- |
| 37  | 火球术   | 对一名敌人造成火属性少量伤害，概率附加3回合的燃烧效果           | magic    | Fire    | 22    | 4      | single_enemy | 95       | intelligence | burn(chance=30, duration=3) |
| 38  | 连珠火   | 对全体敌人造成火属性少量伤害，概率附加3回合的燃烧效果           | magic    | Fire    | 16    | 7      | all_enemies  | 95       | intelligence | burn(chance=25, duration=3) |
| 39  | 大火球   | 对一名敌人造成火属性中量伤害，概率附加3回合的燃烧效果           | magic    | Fire    | 55    | 12     | single_enemy | 95       | intelligence | burn(chance=40, duration=3) |
| 40  | 炎爆     | 对全体敌人造成火属性中量伤害，概率附加3回合的燃烧效果           | magic    | Fire    | 42    | 16     | all_enemies  | 95       | intelligence | burn(chance=30, duration=3) |
| 41  | 炎龙     | 对一名敌人造成火属性大量伤害，概率附加3回合的燃烧效果           | magic    | Fire    | 120   | 26     | single_enemy | 95       | intelligence | burn(chance=50, duration=3) |
| 42  | 火焰漩涡 | 对全体敌人造成火属性大量伤害，概率附加3回合的燃烧效果           | magic    | Fire    | 90    | 34     | all_enemies  | 95       | intelligence | burn(chance=35, duration=3) |
| 43  | 地狱业火 | 对全体敌人造成必定命中的火属性特大伤害，概率附加3回合的燃烧效果 | magic    | Fire    | 180   | 50     | all_enemies  | 100      | intelligence | burn(chance=50, duration=3) |

### 冰水系魔法（44-50）

| id  | name     | description                                                     | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects                 |
| --- | -------- | --------------------------------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ----------------------------- |
| 44  | 水球术   | 对一名敌人造成水属性少量伤害                                    | magic    | Ice     | 22    | 4      | single_enemy | 95       | intelligence |                               |
| 45  | 雨润     | 对全体敌人造成水属性少量伤害                                    | magic    | Ice     | 16    | 7      | all_enemies  | 95       | intelligence |                               |
| 46  | 冰箭术   | 对一名敌人造成水属性中量伤害，概率附加1回合的冻结效果           | magic    | Ice     | 52    | 12     | single_enemy | 90       | intelligence | freeze(chance=25, duration=1) |
| 47  | 潮汐波   | 对全体敌人造成水属性中量伤害                                    | magic    | Ice     | 40    | 16     | all_enemies  | 95       | intelligence |                               |
| 48  | 寒冰锥   | 对一名敌人造成水属性大量伤害，概率附加1回合的冻结效果           | magic    | Ice     | 115   | 26     | single_enemy | 90       | intelligence | freeze(chance=30, duration=1) |
| 49  | 水幕天华 | 对全体敌人造成水属性大量伤害                                    | magic    | Ice     | 88    | 34     | all_enemies  | 95       | intelligence |                               |
| 50  | 悲叹冥河 | 对全体敌人造成必定命中的水属性特大伤害，概率附加1回合的冻结效果 | magic    | Ice     | 175   | 50     | all_enemies  | 100      | intelligence | freeze(chance=35, duration=1) |

### 风系魔法（51-57）

| id  | name     | description                            | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects |
| --- | -------- | -------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ------------- |
| 51  | 旋风术   | 对一名敌人造成风属性少量伤害           | magic    | Wind    | 22    | 4      | single_enemy | 95       | intelligence |               |
| 52  | 风压     | 对全体敌人造成风属性少量伤害           | magic    | Wind    | 16    | 7      | all_enemies  | 95       | intelligence |               |
| 53  | 疾风术   | 对一名敌人造成风属性中量伤害           | magic    | Wind    | 55    | 12     | single_enemy | 95       | intelligence |               |
| 54  | 风灵回旋 | 对全体敌人造成风属性中量伤害           | magic    | Wind    | 42    | 16     | all_enemies  | 95       | intelligence |               |
| 55  | 飓风术   | 对一名敌人造成风属性大量伤害           | magic    | Wind    | 120   | 26     | single_enemy | 95       | intelligence |               |
| 56  | 龙卷地狱 | 对全体敌人造成风属性大量伤害           | magic    | Wind    | 90    | 34     | all_enemies  | 95       | intelligence |               |
| 57  | 万物流转 | 对全体敌人造成必定命中的风属性特大伤害 | magic    | Wind    | 180   | 50     | all_enemies  | 100      | intelligence |               |

### 雷系魔法（58-64）

| id  | name       | description                                                     | category | element  | power | mpCost | targetType   | accuracy | statDriver   | statusEffects                   |
| --- | ---------- | --------------------------------------------------------------- | -------- | -------- | ----- | ------ | ------------ | -------- | ------------ | ------------------------------- |
| 58  | 电流术     | 对一名敌人造成雷属性少量伤害，概率附加3回合的麻痹效果           | magic    | Electric | 22    | 4      | single_enemy | 95       | intelligence | paralyze(chance=25, duration=3) |
| 59  | 静电场     | 对全体敌人造成雷属性少量伤害，概率附加3回合的麻痹效果           | magic    | Electric | 16    | 7      | all_enemies  | 95       | intelligence | paralyze(chance=20, duration=3) |
| 60  | 落雷       | 对一名敌人造成雷属性中量伤害，概率附加3回合的麻痹效果           | magic    | Electric | 55    | 12     | single_enemy | 95       | intelligence | paralyze(chance=30, duration=3) |
| 61  | 闪电链     | 对全体敌人造成雷属性中量伤害，概率附加3回合的麻痹效果           | magic    | Electric | 42    | 16     | all_enemies  | 95       | intelligence | paralyze(chance=25, duration=3) |
| 62  | 雷兽之鼓动 | 对一名敌人造成雷属性大量伤害，概率附加3回合的麻痹效果           | magic    | Electric | 120   | 26     | single_enemy | 95       | intelligence | paralyze(chance=40, duration=3) |
| 63  | 朱庇特之怒 | 对全体敌人造成雷属性大量伤害，概率附加3回合的麻痹效果           | magic    | Electric | 90    | 34     | all_enemies  | 95       | intelligence | paralyze(chance=30, duration=3) |
| 64  | 类星体     | 对全体敌人造成必定命中的雷属性特大伤害，概率附加3回合的麻痹效果 | magic    | Electric | 180   | 50     | all_enemies  | 100      | intelligence | paralyze(chance=40, duration=3) |

### 土系魔法（65-71）

| id  | name     | description                            | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects |
| --- | -------- | -------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ------------- |
| 65  | 岩石弹   | 对一名敌人造成土属性少量伤害           | magic    | Earth   | 22    | 4      | single_enemy | 95       | intelligence |               |
| 66  | 沙尘     | 对全体敌人造成土属性少量伤害           | magic    | Earth   | 16    | 7      | all_enemies  | 95       | intelligence |               |
| 67  | 地刺     | 对一名敌人造成土属性中量伤害           | magic    | Earth   | 55    | 12     | single_enemy | 95       | intelligence |               |
| 68  | 山崩     | 对全体敌人造成土属性中量伤害           | magic    | Earth   | 42    | 16     | all_enemies  | 95       | intelligence |               |
| 69  | 陨石术   | 对一名敌人造成土属性大量伤害           | magic    | Earth   | 120   | 26     | single_enemy | 95       | intelligence |               |
| 70  | 地震波   | 对全体敌人造成土属性大量伤害           | magic    | Earth   | 90    | 34     | all_enemies  | 95       | intelligence |               |
| 71  | 泰坦之战 | 对全体敌人造成必定命中的土属性特大伤害 | magic    | Earth   | 180   | 50     | all_enemies  | 100      | intelligence |               |

### 光系魔法（72-78）

| id  | name     | description                                      | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects |
| --- | -------- | ------------------------------------------------ | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ------------- |
| 72  | 辉光之印 | 对一名敌人造成光属性中量伤害，命中弱点时概率即死 | magic    | Light   | 25    | 5      | single_enemy | 95       | intelligence |               |
| 73  | 圣光普照 | 对全体敌人造成光属性中量伤害，命中弱点时概率即死 | magic    | Light   | 18    | 8      | all_enemies  | 95       | intelligence |               |
| 74  | 天使垂恩 | 对一名敌人造成光属性大量伤害，命中弱点时概率即死 | magic    | Light   | 60    | 14     | single_enemy | 95       | intelligence |               |
| 75  | 神之裁决 | 对一名敌人造成光属性大量伤害，命中弱点时概率即死 | magic    | Light   | 45    | 18     | all_enemies  | 95       | intelligence |               |
| 76  | 世外桃源 | 对全体敌人造成光属性特大伤害，命中弱点时概率即死 | magic    | Light   | 130   | 28     | single_enemy | 95       | intelligence |               |

### 暗系魔法（77-81）

| id  | name     | description                                      | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects |
| --- | -------- | ------------------------------------------------ | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ------------- |
| 77  | 诅咒言灵 | 对一名敌人造成暗属性中量伤害，命中弱点时概率即死 | magic    | Dark    | 100   | 36     | all_enemies  | 95       | intelligence |               |
| 78  | 灵魂号哭 | 对全体敌人造成暗属性中量伤害，命中弱点时概率即死 | magic    | Dark    | 200   | 55     | all_enemies  | 100      | intelligence |               |
| 79  | 暗影之拥 | 对一名敌人造成暗属性大量伤害，命中弱点时概率即死 | magic    | Dark    | 25    | 6      | single_enemy | 90       | intelligence |               |
| 80  | 混沌     | 对全体敌人造成暗属性大量伤害，命中弱点时概率即死 | magic    | Dark    | 18    | 8      | all_enemies  | 90       | intelligence |               |
| 81  | 死神之手 | 对全体敌人造成暗属性特大伤害，命中弱点时概率即死 | magic    | Dark    | 60    | 14     | single_enemy | 90       | intelligence |               |

### 回复系（82-91）

| id  | name       | description                                  | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects |
| --- | ---------- | -------------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ------------- |
| 82  | 小治愈术   | 治疗我方一名成员25%生命值                    | heal     | Heal    | 45    | 18     | all_enemies  | 90       | intelligence |               |
| 83  | 全体小治愈 | 治疗我方全体成员25%生命值                    | heal     | Heal    | 130   | 28     | single_enemy | 90       | intelligence |               |
| 84  | 中治愈术   | 治疗我方一名成员50%生命值                    | heal     | Heal    | 100   | 36     | all_enemies  | 90       | intelligence |               |
| 85  | 全体中治愈 | 治疗我方全体成员50%生命值                    | heal     | Heal    | 200   | 55     | all_enemies  | 100      | intelligence |               |
| 86  | 大治愈术   | 治疗我方一名成员100%生命值                   | heal     | Heal    | -     | 6      | all_enemies  | 95       | intelligence |               |
| 87  | 全体大治愈 | 治疗我方全体成员100%生命值                   | heal     | Heal    | -     | 16     | all_enemies  | 95       | intelligence |               |
| 88  | 恢复术     | 解除我方一名成员的所有异常状态               | heal     | Heal    | -     | 32     | all_enemies  | 95       | intelligence |               |
| 89  | 圣母的慈爱 | 治疗我方全体成员100%生命值并解除所有异常状态 | heal     | Heal    | -     | 52     | all_enemies  | 95       | intelligence |               |

### 辅助系（90-102）

| id  | name     | description                                     | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects |
| --- | -------- | ----------------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ------------- |
| 90  | 攻击强化 | 为我方全体成员赋予3回合的攻击力上升             | support  | None    | 250   | 70     | all_enemies  | 95       | intelligence |               |
| 91  | 防御强化 | 为我方全体成员赋予3回合的防御力上升             | support  | None    | 5     | 60     | all_enemies  | 90       | attack       |               |
| 92  | 敏捷强化 | 为我方全体成员赋予3回合的敏捷上升               | support  | None    | 30    | 4      | single_ally  | 100      | intelligence |               |
| 93  | 全强化   | 为我方全体成员赋予3回合的攻击力·防御力·敏捷上升 | support  | None    | 20    | 8      | all_allies   | 100      | intelligence |               |
| 94  | 攻击弱化 | 对全体敌人赋予3回合的攻击力下降                 | support  | None    | 70    | 12     | single_ally  | 100      | intelligence |               |
| 95  | 防御弱化 | 对全体敌人赋予3回合的防御力下降                 | support  | None    | 50    | 20     | all_allies   | 100      | intelligence |               |
| 96  | 敏捷弱化 | 对全体敌人赋予3回合的敏捷下降                   | support  | None    | 999   | 30     | single_ally  | 100      | intelligence |               |
| 97  | 全弱化   | 对全体敌人赋予3回合的攻击力·防御力·敏捷下降     | support  | None    | 30    | 5      | single_enemy | 95       | intelligence |               |
| 98  | 强化破灭 | 解除敌方全体成员的强化效果                      | support  | None    | 0     | 2      | single_enemy | 95       | intelligence |               |
| 99  | 弱化破灭 | 解除我方全体成员的弱化效果                      | support  | None    | 0     | 6      | single_enemy | 50       | intelligence |               |
| 100 | 蓄力     | 下一次的物理攻击伤害翻倍                        | support  | None    | 0     | 12     | all_enemies  | 40       | intelligence |               |
| 101 | 吟唱     | 下一次的魔法攻击伤害翻倍                        | support  | None    | 0     | 6      | single_enemy | 50       | intelligence |               |
| 102 | 专注     | 下一次的物理攻击必定暴击                        | support  | None    | 0     | 12     | all_enemies  | 40       | intelligence |               |

### 异常状态技能（103-112）

| id  | name     | description                                       | category | element | power | mpCost | targetType   | accuracy | statDriver   | statusEffects                             |
| --- | -------- | ------------------------------------------------- | -------- | ------- | ----- | ------ | ------------ | -------- | ------------ | ----------------------------------------- |
| 103 | 催眠     | 概率对一名敌人施加1回合的睡眠效果                 | magic    | Ailment | 0     | 28     | all_enemies  | 90       | intelligence | sleep(chance=60, duration=1)              |
| 104 | 摇篮曲   | 概率对全体敌人施加1回合的睡眠效果                 | magic    | Ailment | 0     | 42     | all_enemies  | 90       | intelligence | sleep(chance=40, duration=1)              |
| 105 | 大往生   | 对所有睡眠状态的敌人造成即死                      | magic    | Ailment | 0     | 18     | all_enemies  | 90       | intelligence | instant_death(chance=100, requires=sleep) |
| 106 | 毒针     | 概率对一名敌人施加1回合的中毒效果                 | magic    | Ailment | 0     | 3      | single_enemy | 90       | intelligence | poison(chance=60, duration=1)             |
| 107 | 毒雾     | 概率对全体敌人施加1回合的中毒效果                 | magic    | Ailment | 0     | 6      | all_enemies  | 90       | intelligence | poison(chance=40, duration=1)             |
| 108 | 毒雨     | 对全体敌人造成中量伤害，高概率附加1回合的中毒效果 | magic    | Ailment | 25    | 12     | all_enemies  | 90       | intelligence | poison(chance=75, duration=1)             |
| 109 | 干扰电波 | 概率对一名敌人施加3回合的封技效果                 | magic    | Ailment | 0     | 6      | single_enemy | 90       | intelligence | seal(chance=60, duration=3)               |
| 110 | 记忆空洞 | 概率对全体敌人施加3回合的封技效果                 | magic    | Ailment | 0     | 12     | all_enemies  | 90       | intelligence | seal(chance=40, duration=3)               |
| 111 | 视觉剥夺 | 概率对一名敌人施加3回合的致盲效果                 | magic    | Ailment | 0     | 6      | single_enemy | 90       | intelligence | blind(chance=60, duration=3)              |
| 112 | 幻境蜃尘 | 概率对全体敌人施加3回合的致盲效果                 | magic    | Ailment | 0     | 12     | all_enemies  | 90       | intelligence | blind(chance=40, duration=3)              |

### 护盾技能（113-132）

| id  | name         | description                                                     | category | element | power | mpCost | targetType | accuracy | statDriver   | statusEffects                |
| --- | ------------ | --------------------------------------------------------------- | -------- | ------- | ----- | ------ | ---------- | -------- | ------------ | ---------------------------- |
| 113 | 火焰防护     | 对我方所有成员施加1回合的仅生效一次的火属性无效护盾             | support  | None    | 0     | 8      | all_allies | 200      | intelligence | fire_null(duration=1)        |
| 114 | 火焰反射     | 对我方所有成员施加1回合的仅生效一次的火属性反弹护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | fire_reflect(duration=1)     |
| 115 | 火焰吸收     | 对我方所有成员施加1回合的仅生效一次的火属性吸收护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | fire_absorb(duration=1)      |
| 116 | 冰水防护     | 对我方所有成员施加1回合的仅生效一次的水属性无效护盾             | support  | None    | 0     | 8      | all_allies | 200      | intelligence | ice_null(duration=1)         |
| 117 | 冰水反射     | 对我方所有成员施加1回合的仅生效一次的水属性反弹护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | ice_reflect(duration=1)      |
| 118 | 冰水吸收     | 对我方所有成员施加1回合的仅生效一次的水属性吸收护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | ice_absorb(duration=1)       |
| 119 | 疾风防护     | 对我方所有成员施加1回合的仅生效一次的风属性无效护盾             | support  | None    | 0     | 8      | all_allies | 200      | intelligence | wind_null(duration=1)        |
| 120 | 疾风反射     | 对我方所有成员施加1回合的仅生效一次的风属性反弹护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | wind_reflect(duration=1)     |
| 121 | 疾风吸收     | 对我方所有成员施加1回合的仅生效一次的风属性吸收护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | wind_absorb(duration=1)      |
| 122 | 雷鸣防护     | 对我方所有成员施加1回合的仅生效一次的雷属性无效护盾             | support  | None    | 0     | 8      | all_allies | 200      | intelligence | electric_null(duration=1)    |
| 123 | 雷鸣反射     | 对我方所有成员施加1回合的仅生效一次的雷属性反弹护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | electric_reflect(duration=1) |
| 124 | 雷鸣吸收     | 对我方所有成员施加1回合的仅生效一次的雷属性吸收护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | electric_absorb(duration=1)  |
| 125 | 岩土防护     | 对我方所有成员施加1回合的仅生效一次的土属性无效护盾             | support  | None    | 0     | 8      | all_allies | 200      | intelligence | earth_null(duration=1)       |
| 126 | 岩土反射     | 对我方所有成员施加1回合的仅生效一次的土属性反弹护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | earth_reflect(duration=1)    |
| 127 | 岩土吸收     | 对我方所有成员施加1回合的仅生效一次的土属性吸收护盾             | support  | None    | 0     | 10     | all_allies | 200      | intelligence | earth_absorb(duration=1)     |
| 128 | 元素防护     | 对我方所有成员施加1回合的仅生效一次的火·水·风·雷·土属性无效护盾 | support  | None    | 0     | 22     | all_allies | 200      | intelligence | element_null(duration=1)     |
| 129 | 物理防护     | 对我方所有成员施加1回合的仅生效一次的物理属性无效护盾           | support  | None    | 0     | 10     | all_allies | 200      | intelligence | physical_null(duration=1)    |
| 130 | 物理反射     | 对我方所有成员施加1回合的仅生效一次的物理属性反弹护盾           | support  | None    | 0     | 14     | all_allies | 200      | intelligence | physical_reflect(duration=1) |
| 131 | 物理吸收     | 对我方所有成员施加1回合的仅生效一次的物理属性吸收护盾           | support  | None    | 0     | 14     | all_allies | 200      | intelligence | physical_absorb(duration=1)  |
| 132 | 异常状态防护 | 对我方所有成员施加1回合的仅生效一次的异常状态无效护盾           | support  | None    | 0     | 12     | all_allies | 200      | intelligence | ailment_null(duration=1)     |

### 指令技能（133）

| id  | name | description                        | category | element | power | mpCost | targetType | accuracy | statDriver   | statusEffects     |
| --- | ---- | ---------------------------------- | -------- | ------- | ----- | ------ | ---------- | -------- | ------------ | ----------------- |
| 133 | 防御 | 做出防御，减少本回合受到攻击的伤害 | support  | None    | 0     | 0      | self       | 200      | intelligence | guard(duration=1) |

### 被动技能（134-164）

| id  | name         | description                   | category | element | power | mpCost | targetType | accuracy | statDriver | statusEffects |
| --- | ------------ | ----------------------------- | -------- | ------- | ----- | ------ | ---------- | -------- | ---------- | ------------- |
| 134 | 斗志         | 暴击率略微提升                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 135 | 火焰强化     | 火属性伤害+25%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 136 | 高级火焰强化 | 火属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 137 | 冰水强化     | 冰属性伤害+25%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 138 | 高级冰水强化 | 冰属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 139 | 疾风强化     | 风属性伤害+25%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 140 | 高级疾风强化 | 风属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 141 | 雷鸣强化     | 雷属性伤害+25%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 142 | 高级雷鸣强化 | 雷属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 143 | 高级岩土强化 | 土属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 144 | 光强化       | 光属性伤害+25%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 145 | 高级光强化   | 光属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 146 | 暗强化       | 暗属性伤害+25%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 147 | 高级暗强化   | 暗属性伤害+50%                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 148 | 物理强化     | 物理属性伤害+25%              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 149 | 高级物理强化 | 物理属性伤害+50%              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 150 | 万能强化     | 万能属性伤害+25%              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 151 | 高级万能强化 | 万能属性伤害+50%              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 152 | 火焰无效     | 火属性攻击无效化              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 153 | 冰水无效     | 冰属性攻击无效化              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 154 | 疾风无效     | 风属性攻击无效化              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 155 | 雷鸣无效     | 雷属性攻击无效化              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 156 | 岩土无效     | 土属性攻击无效化              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 157 | 物理耐性     | 物理属性伤害减半              | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 158 | 物理无效     | 物理属性攻击无效化            | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 159 | 蛊毒         | 自己施予的异常状态成功率上升  | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 160 | 复仇         | 自身HP越低，造成的伤害越高    | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 161 | 再生         | 每回合恢复5%HP                | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 162 | 振奋         | 每回合恢复5MP                 | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 163 | 坚忍         | HP归零时有一次机会以1HP坚持住 | passive  | None    | 0     | 0      | self       | -        | attack     |               |
| 164 | 灵性         | 战斗胜利后获得的EXP提升       | passive  | None    | 0     | 0      | self       | -        | attack     |               |

### 专属技能（165-187）

| id  | name       | description                                                                       | category | element  | power | mpCost | targetType   | accuracy | statDriver   | statusEffects                                                 |
| --- | ---------- | --------------------------------------------------------------------------------- | -------- | -------- | ----- | ------ | ------------ | -------- | ------------ | ------------------------------------------------------------- |
| 165 | 烛光一闪   | 对一名敌人造成火属性中量物理伤害，附加3回合的防御力下降                           | physical | Fire     | 55    | 22     | single_enemy | 95       | attack       | defense_down(chance=200, duration=3)                          |
| 166 | 日珥       | 对全体敌人造成火属性大量伤害，高概率附加3回合的燃烧效果                           | magic    | Fire     | 110   | 38     | all_enemies  | 95       | intelligence | burn(chance=70, duration=3)                                   |
| 167 | 烈焰魔剑   | 对一名敌人造成高暴击率的火属性特大物理伤害，蓄力状态下可贯穿敌人耐性              | physical | Fire     | 90    | 45     | single_enemy | 80       | attack       |                                                               |
| 168 | 寒冰牢狱   | 对全体敌人造成水属性少量伤害，高概率附加1回合的冻结效果                           | magic    | Ice      | 20    | 14     | all_enemies  | 90       | intelligence | freeze(chance=70, duration=1)                                 |
| 169 | 深海的呼唤 | 对全体敌人造成水属性大量伤害，附加3回合的2层攻击力下降效果                        | magic    | Ice      | 100   | 38     | all_enemies  | 95       | intelligence | attack_down*2(chance=200, duration=3)                         |
| 170 | 生命之源泉 | 治疗我方全体成员50%生命值，解除弱化效果并附加3回合的攻击力·防御力·敏捷上升效果    | heal     | Heal     | 50    | 35     | all_allies   | 100      | intelligence | attack_up+defense_up+agility_up(chance=200, duration=3)       |
| 171 | 风之舞步   | 我方全体成员敏捷上升到效果提升到最高                                              | support  | Wind     | 0     | 18     | all_allies   | 100      | intelligence | agility_up_max(chance=200, duration=3)                        |
| 172 | 千风刃     | 对一名敌人造成6次风属性的少量物理伤害                                             | physical | Wind     | 6     | 24     | single_enemy | 90       | attack       |                                                               |
| 173 | 永恒之枪   | 对一名敌人造成必定命中的物理属性超特大伤害                                        | physical | Physical | 120   | 55     | single_enemy | 200      | attack       |                                                               |
| 174 | 激昂心灵   | 赋予我方一名成员蓄力&吟唱效果                                                     | support  | None     | 0     | 20     | single_ally  | 100      | intelligence | charge+chant(chance=200)                                      |
| 175 | 升天       | 对全体敌人造成高概率的光属性即死效果                                              | magic    | Light    | 0     | 28     | all_enemies  | 70       | intelligence | instant_death(chance=60)                                      |
| 176 | 炽天使之诗 | 以光属性扣除全体敌人75%剩余生命值（对Boss不生效）                                 | magic    | Light    | 0     | 42     | all_enemies  | 100      | intelligence |                                                               |
| 177 | 妙见神轮   | 对全体敌人造成10~15次万能属性少量物理伤害                                         | physical | Almighty | 5     | 65     | all_enemies  | 90       | attack       |                                                               |
| 178 | 地狱凝视   | 解除全体敌人的攻击力·防御力·敏捷上升、蓄力、吟唱和专注效果，并赋予3回合的下降效果 | support  | Dark     | 0     | 24     | all_enemies  | 90       | intelligence | attack_down+defense_down+agility_down(chance=200, duration=3) |
| 179 | 黑洞       | 对全体敌人造成高概率的暗属性即死效果                                              | magic    | Dark     | 0     | 28     | all_enemies  | 70       | intelligence | instant_death(chance=60)                                      |
| 180 | 启示录     | 对全体敌人造成万能属性超特大伤害，概率附加燃烧·中毒·封技·致盲状态                 | magic    | Almighty | 220   | 70     | all_enemies  | 95       | intelligence | burn+poison+seal+blind(chance=35, duration=3)                 |
| 181 | 崩溃珠     | 对全体敌人造成万能属性少量伤害                                                    | magic    | Almighty | 15    | 6      | all_enemies  | 95       | intelligence |                                                               |
| 182 | 吸血       | 以万能属性吸收一名敌人的HP                                                        | magic    | Almighty | 40    | 5      | single_enemy | 95       | intelligence |                                                               |
| 183 | 吸魔       | 以万能属性吸收一名敌人的MP                                                        | magic    | Almighty | 0     | 2      | single_enemy | 95       | intelligence |                                                               |
| 184 | 微型新星   | 对全体敌人造成万能属性中量伤害                                                    | magic    | Almighty | 45    | 16     | all_enemies  | 95       | intelligence |                                                               |
| 185 | 核能冲击   | 对全体敌人造成万能属性大量伤害                                                    | magic    | Almighty | 95    | 32     | all_enemies  | 95       | intelligence |                                                               |
| 186 | 伽马射线暴 | 对全体敌人造成万能属性特大伤害                                                    | magic    | Almighty | 200   | 66     | all_enemies  | 95       | intelligence |                                                               |
| 187 | 螺旋蛇     | 对一名敌人造成高暴击率的万能属性超特大物理伤害                                    | physical | Almighty | 130   | 100    | single_enemy | 80       | attack       |                                                               |

---

## 设计说明

### 数值设计原则

**伤害层级（单目标）：**

| 层级   | 物理 power | 魔法 power | MP 范围（物理） | MP 范围（魔法） |
| ------ | ---------- | ---------- | --------------- | --------------- |
| 少量   | 10-14      | 20-25      | 0-6             | 4-8             |
| 中量   | 20-28      | 50-65      | 8-16            | 10-18           |
| 大量   | 40-55      | 110-130    | 18-28           | 22-36           |
| 特大   | 70-90      | 160-200    | 35-50           | 42-55           |
| 超特大 | 100-130    | 220-250    | 55-75           | 65-85           |

**AoE 修正：** 全体攻击 power ≈ 单目标 power *0.75，MP ≈ 单目标* 1.25

**命中率规则：**

- 标准攻击命中 90-95
- 必定命中（不可回避）= 100
- 高暴击技能命中 50-70（风险补偿）
- 即死/异常技能命中 40-70（高风险高回报）
- 暗属性基础命中 −5

**属性一致规律：**

- 火/冰/风/雷/土：同级技能 power 完全相同，仅元素不同
- 光/暗：同级 power 约 +10%（基础值更高），命中分别为 95/90（暗低5点）
- 万能：同级 power 约为元素的 75-80%（优势是无视耐性）
- 火/雷/暗：附带异常状态，冰仅附带冻结（1回合，平衡伤害）
- 风/土：纯伤害路线，无异常附加

**多段攻击：**

- 段数越多，单段 power 越低，总威力 ≈ 同级单目标的 1.2-1.5 倍
- 多段对 MP 有溢价（+20-30%），以补偿波动性

**回复量级：**

- 少量 = 30（单）/ 20（全）
- 中量 = 70（单）/ 50（全）
- 完全 = 999（仅单体）

**即死与百分比技能：**

- power = 0（非数值伤害）
- 命中较低（40-70），Boss 免疫
- MP 按效果强度定价：普通即死 6-12，范围即死 28，百分比扣血 42

**被动/护盾：**

- power = 0, mpCost = 0, targetType = self
- 元素护盾 MP 8-10，物理 10-14，全元素 22，异常 12
- 强化系 25% → 高级 50%

### 与现有数据对照

现有 `skills.jsonl` 中的少量技能与本文档保持一致：

- `attack`: 物理, power=10, mp=0, acc=90  →  设计 #1 ✓
- `cleave`: 物理, power=25, mp=6, acc=85   →  在 #7 半月斩(power=22, mp=12) 与 #13 大切断(power=48, mp=24) 之间，作为中量偏高定位
- `agi/bufu/zan`: 魔法少量, power=20, mp=4, acc=95  →  设计 #37/44/51 ✓
- `dia`: 回复少量, power=25, mp=5  →  设计 #92 迪亚(power=30, mp=4) 微调统一
- `tarukaja`: 攻击上升, mp=8  →  对应状态 buff 体系
- `mudo`: 暗少量, power=20, mp=6, acc=90  →  设计 #79(power=25, mp=6, acc=90) 调至与光同级

公式参数沿用 `formulas.jsonl`：

- 伤害浮动 0.95-1.05，最小伤害 1
- 弱点 1.5*，耐性 0.5*，无效 0*
- 命中率 = 技能命中 *(1 + (己方敏捷 − 敌方敏捷)* 0.2)，下限 5%，上限 95%
- 暴击率 = 5% + 敏捷加成 0.1，上限 50%
- 防御伤害减免 100%（完全抵消，但护盾仅1回合或1次触发）
