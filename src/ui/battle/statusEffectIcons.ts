// Font Awesome Free SVGs: CC BY 4.0; embedded sources retain their attribution.
import attack from "@fortawesome/fontawesome-free/svgs/solid/hand-fist.svg?raw";
import defense from "@fortawesome/fontawesome-free/svgs/solid/shield.svg?raw";
import agility from "@fortawesome/fontawesome-free/svgs/solid/person-running.svg?raw";
import intelligence from "@fortawesome/fontawesome-free/svgs/solid/brain.svg?raw";
import charge from "@fortawesome/fontawesome-free/svgs/solid/dumbbell.svg?raw";
import chant from "@fortawesome/fontawesome-free/svgs/solid/wand-magic-sparkles.svg?raw";
import focus from "@fortawesome/fontawesome-free/svgs/solid/bullseye.svg?raw";
import fire from "@fortawesome/fontawesome-free/svgs/solid/fire.svg?raw";
import ice from "@fortawesome/fontawesome-free/svgs/solid/snowflake.svg?raw";
import wind from "@fortawesome/fontawesome-free/svgs/solid/wind.svg?raw";
import electric from "@fortawesome/fontawesome-free/svgs/solid/bolt.svg?raw";
import earth from "@fortawesome/fontawesome-free/svgs/solid/mountain.svg?raw";
import element from "@fortawesome/fontawesome-free/svgs/solid/shapes.svg?raw";
import physical from "@fortawesome/fontawesome-free/svgs/solid/hand-fist.svg?raw";
import ailment from "@fortawesome/fontawesome-free/svgs/solid/biohazard.svg?raw";
import sleep from "@fortawesome/fontawesome-free/svgs/solid/bed.svg?raw";
import poison from "@fortawesome/fontawesome-free/svgs/solid/flask.svg?raw";
import seal from "@fortawesome/fontawesome-free/svgs/solid/ban.svg?raw";
import blind from "@fortawesome/fontawesome-free/svgs/solid/eye-slash.svg?raw";
import instant_death from "@fortawesome/fontawesome-free/svgs/solid/skull.svg?raw";
import burn from "@fortawesome/fontawesome-free/svgs/solid/fire-flame-curved.svg?raw";
import freeze from "@fortawesome/fontawesome-free/svgs/solid/icicles.svg?raw";
import paralyze from "@fortawesome/fontawesome-free/svgs/solid/bolt-lightning.svg?raw";
import guard from "@fortawesome/fontawesome-free/svgs/solid/shield-halved.svg?raw";
import up from "@fortawesome/fontawesome-free/svgs/solid/arrow-up.svg?raw";
import down from "@fortawesome/fontawesome-free/svgs/solid/arrow-down.svg?raw";
import nullIcon from "@fortawesome/fontawesome-free/svgs/solid/ban.svg?raw";
import reflect from "@fortawesome/fontawesome-free/svgs/solid/rotate-left.svg?raw";
import absorb from "@fortawesome/fontawesome-free/svgs/solid/circle-arrow-down.svg?raw";
import unknown from "@fortawesome/fontawesome-free/svgs/solid/circle-question.svg?raw";

function compose(glyph: string, modifier?: string): string {
  const base = glyph.replace("<svg ", '<svg x="4" y="4" width="32" height="32" ');
  const badge = modifier
    ? `<circle cx="37" cy="37" r="11" fill="#20182b"/>${modifier.replace("<svg ", '<svg x="29" y="29" width="16" height="16" style="color:white" ')}`
    : "";
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style="color:#20182b"><rect width="48" height="48" rx="9" fill="#fff8ee"/>${base}${badge}</svg>`)}`;
}

const icons: Record<string, string> = {};
for (const [id, glyph] of Object.entries({ attack, defense, agility, intelligence })) {
  icons[`${id}_up`] = compose(glyph, up);
  icons[`${id}_down`] = compose(glyph, down);
}
for (const [id, glyph] of Object.entries({ fire, ice, wind, electric, earth, physical })) {
  icons[`${id}_null`] = compose(glyph, nullIcon);
  icons[`${id}_reflect`] = compose(glyph, reflect);
  icons[`${id}_absorb`] = compose(glyph, absorb);
}
icons.element_null = compose(element, nullIcon);
icons.ailment_null = compose(ailment, nullIcon);
for (const [id, glyph] of Object.entries({
  charge,
  chant,
  focus,
  sleep,
  poison,
  seal,
  blind,
  instant_death,
  burn,
  freeze,
  paralyze,
  guard,
})) {
  icons[id] = compose(glyph);
}
const fallback = compose(unknown);
export function statusEffectIcon(effectId: string): string {
  return icons[effectId] ?? fallback;
}
