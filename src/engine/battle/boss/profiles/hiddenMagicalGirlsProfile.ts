import type { BossProfile } from "@/engine/battle/boss/bossRegistry";
import type { BossActionIntent, BossContext, BossEffect, BossUtilityCandidate } from "@/engine/battle/boss/bossTypes";
import { BATTLE_ELEMENTS } from "@/types/battle";
export const ALL_HIDDEN_DAMAGE_RESISTANCE = BATTLE_ELEMENTS.Physical | BATTLE_ELEMENTS.Gun | BATTLE_ELEMENTS.Fire | BATTLE_ELEMENTS.Ice | BATTLE_ELEMENTS.Electric | BATTLE_ELEMENTS.Wind | BATTLE_ELEMENTS.Earth | BATTLE_ELEMENTS.Light | BATTLE_ELEMENTS.Dark | BATTLE_ELEMENTS.Almighty;
export function effectiveHiddenAilmentChance(baseChance: number, priorSuccesses: number): number { return Math.max(5, baseChance - 25 * priorSuccesses); }
export interface HiddenPairState { phase:"trial"|"confluence"|"horizon"; bigWindowStartRound:number; bigWindowDamage:number; smallWindow:{remainingPlayerRounds:number;damage:number}|null; crisisEntered:Record<"107"|"108",boolean>; finalPlayerRoundsRemaining:number|null; reviveTargetActorId:string|null; ailmentSuccesses:Record<string,Record<string,number>>; }
const INITIAL:HiddenPairState={phase:"trial",bigWindowStartRound:1,bigWindowDamage:0,smallWindow:null,crisisEntered:{"107":false,"108":false},finalPlayerRoundsRemaining:null,reviveTargetActorId:null,ailmentSuccesses:{}};
function pair(context:BossContext):HiddenPairState{return structuredClone((context.runtime.mechanicState["hidden:pair"] as HiddenPairState|undefined)??INITIAL);}
function bosses(context:BossContext){return context.snapshot.participants.filter((p)=>p.enemyId==="107"||p.enemyId==="108");}
function livingPlayers(context:BossContext){return context.snapshot.participants.filter((p)=>p.side==="player"&&p.isActive&&!p.isDown).map((p)=>p.id);}
function sharedRatio(context:BossContext){const values=bosses(context);return values.reduce((n,p)=>n+p.hp.current,0)/values.reduce((n,p)=>n+p.hp.max,0);}
function isPlayer(context:BossContext,id:string){return context.snapshot.participants.some((p)=>p.id===id&&p.side==="player");}
function stateEffect(value:HiddenPairState):BossEffect{return{type:"set_mechanic_state",key:"hidden:pair",value};}
export const hiddenMagicalGirlsProfile:BossProfile={
 id:"hidden-magical-girls",actorEnemyIds:["107","108"],initialPhase:"trial",skillIds:Array.from({length:24},(_,i)=>String(306+i)),
 reduceEvent(context,event):BossEffect[]{const value=pair(context);const effects:BossEffect[]=[];
  if(event.type==="damage_applied"&&(context.snapshot.participants.find(p=>p.id===event.targetId)?.enemyId==="107"||context.snapshot.participants.find(p=>p.id===event.targetId)?.enemyId==="108")){
   if(isPlayer(context,event.sourceId)){value.bigWindowDamage+=event.amount;if(value.smallWindow)value.smallWindow.damage+=event.amount;}
   const ratio=sharedRatio(context);if(value.phase==="trial"&&ratio<=0.7){value.phase="confluence";value.smallWindow={remainingPlayerRounds:2,damage:0};effects.push(...bosses(context).map(p=>({type:"set_phase",actorId:p.id,phase:"confluence"} as BossEffect)),{type:"append_mechanic_log",summary:"天地交灼",details:["小型 DPS 检定开始：2 回合 / 800 伤害"]});}
   if(value.phase!=="horizon"&&ratio<=0.35){value.phase="horizon";value.smallWindow=null;effects.push(...bosses(context).map(p=>({type:"set_phase",actorId:p.id,phase:"horizon"} as BossEffect)),{type:"append_mechanic_log",summary:"终末地平",details:["危急状态与最终倒计时已启用"]});}
   for(const boss of bosses(context)){if((boss.enemyId==="107"||boss.enemyId==="108")&&boss.hp.current/boss.hp.max<=0.2)value.crisisEntered[boss.enemyId]=true;}
   if(value.crisisEntered["107"]&&value.crisisEntered["108"]&&value.finalPlayerRoundsRemaining==null){value.finalPlayerRoundsRemaining=6;effects.push({type:"append_mechanic_log",summary:"终景倒计时启动",details:["剩余 6 个玩家回合"]});}
   effects.unshift(stateEffect(value));return effects;
  }
  if(event.type==="round_ended"){
   if(event.turnCount%8===0){if(value.bigWindowDamage<2000){effects.push({type:"set_flag",key:"hidden:bigDpsFailed",value:true},{type:"append_mechanic_log",summary:"大 DPS 检定失败",details:[`${value.bigWindowDamage} / 2000`]});}else{effects.push({type:"set_flag",key:"hidden:bigDpsFailed",value:false},{type:"append_mechanic_log",summary:"大 DPS 检定通过",details:[`${value.bigWindowDamage} / 2000`]});}value.bigWindowStartRound=event.turnCount+1;value.bigWindowDamage=0;}
   if(value.smallWindow){value.smallWindow.remainingPlayerRounds-=1;if(value.smallWindow.remainingPlayerRounds<=0){const failed=value.smallWindow.damage<800;effects.push({type:"set_flag",key:"hidden:smallDpsFailed",value:failed},{type:"append_mechanic_log",summary:failed?"小 DPS 检定失败":"小 DPS 检定通过",details:[`${value.smallWindow.damage} / 800`]});if(failed){for(const boss of bosses(context)){effects.push({type:"adjust_hp",actorId:boss.id,amount:Math.ceil(boss.hp.max*0.1)},{type:"apply_status",actorId:boss.id,effectId:"attack_up",duration:3},{type:"apply_status",actorId:boss.id,effectId:"intelligence_up",duration:3});}}else{const earth=bosses(context).find(p=>p.enemyId==="108");if(earth)effects.push({type:"apply_status",actorId:earth.id,effectId:"defense_down",duration:1});}value.smallWindow=null;}}
   if(value.finalPlayerRoundsRemaining!=null){value.finalPlayerRoundsRemaining=Math.max(0,value.finalPlayerRoundsRemaining-1);if(value.finalPlayerRoundsRemaining===0)effects.push({type:"set_flag",key:"hidden:finalFailed",value:true});}
   effects.unshift(stateEffect(value));return effects;
  }
  if(event.type==="participant_down"){
   const pairMembers=bosses(context);const living=pairMembers.filter(p=>!p.isDown);const down=pairMembers.filter(p=>p.isDown);value.reviveTargetActorId=down.length===1&&living.length===1?down[0]!.id:null;return[stateEffect(value),{type:"append_mechanic_log",summary:value.reviveTargetActorId?"复苏脉动已排入下一实际行动":"双重击破成立",details:value.reviveTargetActorId?[`目标 ${value.reviveTargetActorId}`]:[]}];
  }
  if(event.type==="action_resolved"&&event.actionId==="324"&&value.reviveTargetActorId){const target=value.reviveTargetActorId;value.reviveTargetActorId=null;return[{type:"revive_actor",actorId:target,hpPercent:50},stateEffect(value),{type:"append_mechanic_log",summary:"复苏脉动",details:["同伴恢复 50% 最大生命"]}];}
  if(event.type==="status_applied"){const target=context.snapshot.participants.find(p=>p.id===event.targetId);if(target?.enemyId==="107"||target?.enemyId==="108"){value.ailmentSuccesses[target.id]??={};value.ailmentSuccesses[target.id]![event.effectId]=(value.ailmentSuccesses[target.id]![event.effectId]??0)+1;return[stateEffect(value),{type:"increment_ailment_resistance",actorId:target.id,effectId:event.effectId}];}}
  return[];
 },
 selectPriorityIntent(context,priority){const value=pair(context);if(priority==="hard_defeat"&&(context.runtime.flags["hidden:bigDpsFailed"]||context.runtime.flags["hidden:finalFailed"]))return{type:"force_defeat",skillId:context.runtime.flags["hidden:bigDpsFailed"]?"317":"316",reason:"隐藏挑战硬性检定失败"};if(priority==="revival"&&value.reviveTargetActorId&&context.actorId){const actor=context.snapshot.participants.find(p=>p.id===context.actorId);if(actor&&!actor.isDown)return{type:"use_skill",actorId:actor.id,skillId:"324",targetIds:[value.reviveTargetActorId],reason:"强制复活优先"};}return null;},
 selectForcedIntent(){return null;},enumerateUtilityCandidates(context):BossUtilityCandidate[]{const actor=context.snapshot.participants.find(p=>p.id===context.actorId);if(!actor)return[];const skillId=actor.enemyId==="107"?"306":"318";return[{intent:{type:"use_skill",actorId:actor.id,skillId,targetIds:livingPlayers(context).slice(0,1),reason:"基础职责"},available:true,score:5,noise:0.1,stableOrder:0}];}
};
