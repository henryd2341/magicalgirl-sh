import type { BattleEffectsMode } from "@/composables/useBattleEffects";
import type { BattleActionTrace, BattleSnapshot } from "@/types/battle";
import { effectColor, effectFamily, impactBeats, outcomeLabel, type EffectFamily } from "./battleEffectRecipes";
import slash from "@/assets/battle-effects/slash_02.png";
import glow from "@/assets/battle-effects/light_01.png";
import bolt from "@/assets/battle-effects/spark_05.png";
import magic from "@/assets/battle-effects/magic_01.png";
import star from "@/assets/battle-effects/star_04.png";
import ring from "@/assets/battle-effects/circle_03.png";
import flame from "@/assets/battle-effects/flame_01.png";

export const EFFECT_TEXTURES = { slash, glow, bolt, magic, star, ring, flame };
export const MAX_EFFECT_ELEMENTS = 48;
export const EFFECT_WATCHDOG_MS = 3000;
let texturesReady = false;
let loading: Promise<boolean> | undefined;
export function loadEffectTextures(): Promise<boolean> {
  return loading ??= Promise.all(Object.values(EFFECT_TEXTURES).map(async url => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image.naturalWidth > 0;
  })).then(results => (texturesReady = results.every(Boolean)), () => false);
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
      { transform: `translate(-50%,-50%) rotate(${rotation}deg) scale(.85)`, opacity: .85, offset: .35 },
      { transform: `translate(-50%,-50%) rotate(${rotation + 20}deg) scale(1.15)`, opacity: 0 },
    ], duration);
  }
  function burst(family: EffectFamily, point: Point, color: string, duration: number, ordinal: number) {
    const jobs: Promise<void>[] = [];
    if (family === "slash") {
      jobs.push(pulse("slash", point, 220, color, duration, ordinal % 2 ? 25 : -45));
      jobs.push(pulse("slash", point, 160, "#fff1e8", duration, ordinal % 2 ? 210 : 135));
    } else if (family === "magic") {
      jobs.push(pulse("bolt", point, 210, color, duration, 35));
      jobs.push(pulse("glow", point, 140, color, duration));
    } else if (family === "area") {
      jobs.push(pulse("magic", point, 280, color, duration));
      jobs.push(pulse("flame", point, 220, color, duration, 20));
      jobs.push(pulse("ring", point, 260, color, duration));
    } else if (family === "heal") {
      jobs.push(pulse("magic", point, 150, color, duration));
      for (let i = 0; i < 5; i++) jobs.push(decorate("star", { x: point.x + (i - 2) * 22, y: point.y + 20 }, 46, i % 2 ? "#dcfff0" : color, [
        { transform: "translate(-50%,-50%) scale(.3)", opacity: 0 },
        { opacity: .9, offset: .3 },
        { transform: `translate(-50%,${-90 - i * 18}%) scale(1)`, opacity: 0 },
      ], duration));
    } else if (family === "support") {
      jobs.push(pulse("magic", point, 215, color, duration));
      jobs.push(pulse("ring", point, 180, "#fbe9bd", duration));
    } else jobs.push(pulse(null, point, 52, color, duration));
    if (family !== "neutral" && family !== "heal") for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      jobs.push(decorate("star", point, 34, color, [
        { transform: "translate(-50%,-50%) scale(.3)", opacity: 0 },
        { opacity: .8, offset: .25 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * 95}px),calc(-50% + ${Math.sin(angle) * 75}px)) scale(.7)`, opacity: 0 },
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
    const reduced = input.mode === "reduced" || !texturesReady;
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
          const recovery = outcome.type === "absorb" || (outcome.hpDelta ?? 0) > 0;
          const interception = outcome.type === "reflect" && (outcome.hpDelta ?? 0) >= 0;
          return {
            point: anchor(target),
            side: input.before.participants.find(p => p.id === target)?.side,
            family: recovery ? "heal" as const : interception ? "support" as const : family,
            color: recovery ? "#56efbd" : interception ? "#e6c767" : color,
            active: outcome.type !== "miss" && outcome.type !== "status_no_effect" && outcome.type !== "block",
          };
        });
        const group = input.action.targetType === "all_enemies" || input.action.targetType === "all_allies";
        const visible = visuals.filter(v => v.active && v.point.visible);
        const first = visible[0];
        // Mixed roles or opposing sides need their own real anchors, not a midpoint burst.
        const shared = !reduced && group && first && visible.every(v =>
          v.side === first.side && v.family === first.family && v.color === first.color);
        if (shared) {
          const center = {
            x: (Math.min(...visible.map(v => v.point.x)) + Math.max(...visible.map(v => v.point.x))) / 2,
            y: (Math.min(...visible.map(v => v.point.y)) + Math.max(...visible.map(v => v.point.y))) / 2,
          };
          jobs.push(burst(first.family, center, first.color, duration, index));
        }
        for (const visual of visuals) {
          if (!visual.point.visible) continue;
          if (reduced || !visual.active || shared) jobs.push(pulse(null, visual.point, 46, visual.color, duration));
          else jobs.push(burst(visual.family, visual.point, visual.color, duration, index));
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
