import type { BattleEffectsMode } from "@/composables/useBattleEffects";
import type { BattleActionTrace, BattleSnapshot } from "@/types/battle";
import { effectColor, effectFamily, effectProfile, impactBeats, outcomeLabel, type ElementProfile } from "./battleEffectRecipes";
import slash from "@/assets/battle-effects/slash_02.png";
import glow from "@/assets/battle-effects/light_01.png";
import bolt from "@/assets/battle-effects/spark_05.png";
import magic from "@/assets/battle-effects/magic_01.png";
import star from "@/assets/battle-effects/star_04.png";
import ring from "@/assets/battle-effects/circle_03.png";
import flame from "@/assets/battle-effects/flame_01.png";
import projectile from "@/assets/battle-effects/trace_01.png";
import fire from "@/assets/battle-effects/flame_05.png";
import wind from "@/assets/battle-effects/twirl_02.png";
import earth from "@/assets/battle-effects/dirt_01.png";
import heart from "@/assets/battle-effects/symbol_01.png";
import icewater from "@/assets/battle-effects/icewater.svg?no-inline";
import dark from "@/assets/battle-effects/dark.svg?no-inline";
import almighty from "@/assets/battle-effects/almighty.svg?no-inline";
import ailment from "@/assets/battle-effects/ailment.svg?no-inline";

export const EFFECT_TEXTURES = { slash, glow, bolt, magic, star, ring, flame, projectile, fire, wind, earth, heart, icewater, dark, almighty, ailment };
type Texture = keyof typeof EFFECT_TEXTURES;
export const MAX_EFFECT_ELEMENTS = 48;
export const EFFECT_WATCHDOG_MS = 3000;
const readyTextures = new Set<Texture>();
let loading: Promise<boolean> | undefined;
export function loadEffectTextures(): Promise<boolean> {
  return loading ??= Promise.all((Object.entries(EFFECT_TEXTURES) as [Texture, string][]).map(async ([key, url]) => {
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth > 0) { readyTextures.add(key); return true; }
    } catch { /* Only recipes requiring this texture use Reduced feedback. */ }
    return false;
  })).then(results => results.every(Boolean));
}

function burstTextures(profile: ElementProfile): Texture[] {
  if (!profile.texture) return [];
  return [profile.texture, "glow", ...(profile.texture === "magic" || profile.texture === "heart" ? ["ring" as const] : []), ...(profile.texture === "fire" ? ["flame" as const] : [])];
}

interface Point { x: number; y: number }
interface Anchor extends Point { visible: boolean }
export function participantAnchor(root: HTMLElement, host: HTMLElement, id: string, side: string): Anchor {
  const bounds = host.getBoundingClientRect();
  const candidates = root.querySelectorAll<HTMLElement>(".battle-hud__enemy-row [data-participant-id], .battle-hud__party-row [data-participant-id]");
  const card = [...candidates].find(node => node.dataset.participantId === id);
  if (card && !card.closest('[inert], [aria-hidden="true"]')) {
    const rect = card.getBoundingClientRect();
    let left = Math.max(0, bounds.left, rect.left);
    let right = Math.min(window.innerWidth, bounds.right, rect.right);
    let top = Math.max(0, bounds.top, rect.top);
    let bottom = Math.min(window.innerHeight, bounds.bottom, rect.bottom);
    for (let parent = card.parentElement; parent && parent !== root.parentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const clip = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
    }
    if (rect.width > 0 && rect.height > 0 && right > left && bottom > top && getComputedStyle(card).visibility !== "hidden") {
      return { x: (left + right) / 2 - bounds.left, y: (top + bottom) / 2 - bounds.top, visible: true };
    }
  }
  return { x: bounds.width / 2, y: bounds.height * (side === "enemy" ? 0.32 : 0.7), visible: false };
}

export interface EffectPlayback {
  action: BattleActionTrace;
  before: BattleSnapshot;
  mode: BattleEffectsMode;
  reveal: () => void;
  feedback: (text: string) => void;
}

/** One overlay owns every element, animation, deadline and cancellation promise. */
export function createBattleEffectsRenderer(host: HTMLElement, root: HTMLElement) {
  let generation = 0;
  const animations = new Set<Animation>();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let release: (() => void) | undefined;
  let refresh = 0;
  let disposed = false;
  void loadEffectTextures();

  function clearDecorations() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    host.replaceChildren();
  }
  function cancel() {
    generation++;
    cancelAnimationFrame(refresh);
    refresh = 0;
    clearDecorations();
    clearTimeout(deadline);
    deadline = undefined;
    release?.();
    release = undefined;
  }
  // Layout changes invalidate current coordinates; the next phase measures again.
  const layoutChanged = () => {
    if (!release || refresh) return;
    refresh = requestAnimationFrame(() => { refresh = 0; clearDecorations(); });
  };
  root.addEventListener("scroll", layoutChanged, true);
  window.addEventListener("resize", layoutChanged);

  function decorate(texture: keyof typeof EFFECT_TEXTURES | null, point: Point, size: number, color: string, frames: Keyframe[], duration: number): Promise<void> {
    if (host.childElementCount >= MAX_EFFECT_ELEMENTS) return Promise.resolve();
    const node = document.createElement("i");
    node.className = texture ? "battle-effect-texture" : "battle-effect-local";
    Object.assign(node.style, { left: `${point.x}px`, top: `${point.y}px`, width: `${size}px`, height: `${size}px`, backgroundColor: color });
    if (texture) node.style.maskImage = `url("${EFFECT_TEXTURES[texture]}")`;
    host.append(node);
    const animation = node.animate(frames, { duration, easing: "cubic-bezier(.2,.65,.25,1)", fill: "both" });
    animations.add(animation);
    return animation.finished.then(() => {}, error => {
      if (animation.playState !== "idle") throw error;
    }).finally(() => { animations.delete(animation); node.remove(); });
  }
  function pulse(texture: keyof typeof EFFECT_TEXTURES | null, point: Point, size: number, color: string, duration: number, rotation = 0) {
    return decorate(texture, point, size, color, [
      { transform: `translate(-50%,-50%) rotate(${rotation - 18}deg) scale(.3)`, opacity: 0 },
      { transform: `translate(-50%,-50%) rotate(${rotation}deg) scale(.85)`, opacity: texture === "fire" ? .55 : .85, offset: .35 },
      { transform: `translate(-50%,-50%) rotate(${rotation + 20}deg) scale(1.15)`, opacity: 0 },
    ], duration);
  }
  function burst(profile: ElementProfile, point: Point, duration: number, ordinal: number, group: boolean) {
    const { texture, color } = profile;
    if (!texture) return pulse(null, point, 52, color, duration);
    const size = group ? 280 : 220;
    const rotation = texture === "slash" ? (ordinal % 2 ? 25 : -45) : texture === "projectile" ? -45 : 0;
    const faint = ["slash", "projectile", "star", "wind"].includes(texture);
    const mainSize = texture === "projectile" || texture === "star" ? 320 : Math.max(size, 260);
    const jobs = [pulse("glow", point, size * .65, color, duration), faint
      // Sparse PNG alpha needs a readable crest over portraits, within the same beat.
      ? decorate(texture, point, mainSize, color, [
        { transform: `translate(-50%,-50%) rotate(${rotation - 18}deg) scale(.5) scaleX(${texture === "projectile" ? 3 : 1})`, opacity: 0 },
        { transform: `translate(-50%,-50%) rotate(${rotation}deg) scale(.95) scaleX(${texture === "projectile" ? 3 : 1})`, opacity: 1, offset: .35 },
        { transform: `translate(-50%,-50%) rotate(${rotation + 10}deg) scale(1.05) scaleX(${texture === "projectile" ? 3 : 1})`, opacity: .9, offset: .7 },
        { transform: `translate(-50%,-50%) rotate(${rotation + 20}deg) scale(1.15) scaleX(${texture === "projectile" ? 3 : 1})`, opacity: 0 },
      ], duration)
      : pulse(texture, point, size, color, duration, rotation)];
    if (texture === "magic" || texture === "heart") jobs.push(pulse("ring", point, size * .85, color, duration));
    if (texture === "fire") jobs.push(pulse("flame", point, size * .75, color, duration, 20));
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      jobs.push(decorate("glow", point, 22, color, [
        { transform: "translate(-50%,-50%) scale(.3)", opacity: 0 },
        { opacity: .65, offset: .25 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * 85}px),calc(-50% + ${Math.sin(angle) * 65}px)) scale(.7)`, opacity: 0 },
      ], duration));
    }
    return Promise.all(jobs);
  }

  async function play(input: EffectPlayback): Promise<void> {
    cancel();
    if (disposed || input.mode === "off") { input.reveal(); return; }
    const token = generation;
    let revealed = false;
    const reveal = () => { if (!revealed) { revealed = true; input.reveal(); } };
    const interrupted = new Promise<void>(resolve => { release = resolve; });
    deadline = setTimeout(cancel, EFFECT_WATCHDOG_MS);
    const name = (id?: string | null) => input.before.participants.find(p => p.id === id)?.displayName ?? id ?? "战况";
    const anchor = (id?: string | null) => {
      const participant = input.before.participants.find(p => p.id === id);
      return participantAnchor(root, host, id ?? "", participant?.side ?? "enemy");
    };
    const color = effectColor(input.action);
    const family = effectFamily(input.action);
    const beats = impactBeats(input.action);
    const required = new Set<Texture>();
    if (family !== "neutral") required.add("magic");
    if (family === "magic") required.add("glow");
    for (const beat of beats) for (const outcome of beat.outcomes) {
      if (["miss", "block", "status_no_effect"].includes(outcome.type)) continue;
      for (const texture of burstTextures(effectProfile(input.action, outcome))) required.add(texture);
    }
    const reduced = input.mode === "reduced" || [...required].some(texture => !readyTextures.has(texture));
    const run = async () => {
      if (!reduced && family !== "neutral") {
        const source = anchor(input.action.actorId);
        if (source.visible) await pulse("magic", source, 100, color, 180);
        if (generation !== token) return;
        if (family === "magic") {
          const target = anchor(beats[0]?.outcomes[0]?.primaryTargetId ?? beats[0]?.outcomes[0]?.finalTargetId);
          if (source.visible && target.visible) await decorate("glow", source, 90, color, [
            { transform: "translate(-50%,-50%) scale(.4)", opacity: .2 },
            { transform: `translate(calc(-50% + ${target.x - source.x}px),calc(-50% + ${target.y - source.y}px)) scale(1)`, opacity: .85 },
          ], 180);
        }
      }
      if (generation !== token) return;
      const shownBeats = reduced ? [{ outcomes: beats.flatMap(beat => beat.outcomes) }] : beats;
      for (let index = 0; index < shownBeats.length; index++) {
        const beat = shownBeats[index]!;
        const labels = [...new Set(beat.outcomes.map(o => `${name(o.finalTargetId ?? o.primaryTargetId)} · ${outcomeLabel(o)}`))];
        input.feedback(labels.join(" / ") || "战况更新");
        const duration = reduced ? 120 : Math.min(300, 1400 / beats.length);
        const jobs: Promise<unknown>[] = [];
        const visuals = beat.outcomes.map(outcome => {
          const target = outcome.finalTargetId ?? outcome.primaryTargetId;
          return {
            point: anchor(target),
            side: input.before.participants.find(p => p.id === target)?.side,
            profile: effectProfile(input.action, outcome),
            role: outcome.type === "absorb" || (outcome.hpDelta ?? 0) > 0 ? "recovery"
              : outcome.type === "reflect" && (outcome.hpDelta ?? 0) >= 0 ? "interception"
              : (outcome.hpDelta ?? 0) < 0 ? "damage" : "status",
            active: outcome.type !== "miss" && outcome.type !== "status_no_effect" && outcome.type !== "block",
          };
        });
        const group = input.action.targetType === "all_enemies" || input.action.targetType === "all_allies";
        const visible = visuals.filter(v => v.active && v.point.visible);
        const first = visible[0];
        // Mixed roles or opposing sides need their own real anchors, not a midpoint burst.
        const shared = !reduced && group && first && visible.every(v =>
          v.side === first.side && v.role === first.role && v.profile.texture === first.profile.texture && v.profile.color === first.profile.color);
        if (shared) {
          const center = {
            x: (Math.min(...visible.map(v => v.point.x)) + Math.max(...visible.map(v => v.point.x))) / 2,
            y: (Math.min(...visible.map(v => v.point.y)) + Math.max(...visible.map(v => v.point.y))) / 2,
          };
          jobs.push(burst(first.profile, center, duration, index, true));
        }
        for (const visual of visuals) {
          if (!visual.point.visible) continue;
          if (reduced || !visual.active || shared) jobs.push(pulse(null, visual.point, 46, visual.profile.color, duration));
          else jobs.push(burst(visual.profile, visual.point, duration, index, false));
        }
        if (!jobs.length) {
          // Hidden recipients use the named strip, never another participant's card.
          const cue = root.querySelector<HTMLElement>(".battle-presentation-cue");
          if (cue) {
            const rect = cue.getBoundingClientRect();
            const base = host.getBoundingClientRect();
            jobs.push(pulse(null, { x: rect.left - base.left + 14, y: rect.top - base.top + rect.height / 2 }, 24, color, duration));
          }
        }
        await Promise.all(jobs);
        if (generation !== token) return;
      }
      reveal();
    };
    try { await Promise.race([run(), interrupted]); }
    catch { /* A failed animation reveals canonical state instead of locking combat. */ }
    finally {
      if (generation === token) cancel();
      reveal();
    }
  }
  function dispose() {
    disposed = true;
    cancel();
    cancelAnimationFrame(refresh);
    root.removeEventListener("scroll", layoutChanged, true);
    window.removeEventListener("resize", layoutChanged);
  }
  return { play, cancel, dispose };
}
