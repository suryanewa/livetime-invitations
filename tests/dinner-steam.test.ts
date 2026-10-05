import { describe, expect, it } from 'vitest';
import { Color, Group, MeshStandardMaterial, Vector2, Vector3 } from 'three';
import { COVER, COVER_PROFILE, COVER_SEATED, dinnerBounds, PLATE, plateTop } from '../models/dinnerContract.ts';
import type { DinnerRig } from '../models/dinner.ts';
import { buildDisposalBin } from '../models/disposalBin.ts';
import { VisualDirector } from '../src/core/visualDirector.ts';
import { DIRECTIONS, type MaterialLibrary } from '../src/render/materials.ts';
import { DinnerScene } from '../src/scenes/dinner/index.ts';
import { STEAM_LOOK } from '../models/dinnerSteam.ts';
import { ACCEPT, DURATIONS, frameFor, newFrame, REVEAL_DIR, REWIND, sampleSequence } from '../src/scenes/dinner/sequences.ts';
import {
  axisForward, axisInverse, CLOUD, cloudDensity, recedeWeight, cloudLook, cloudSeat, cloudState, crownFray, dragAt, dragCentre, EDGE, GUSH, heldDrag, gushOut, gushRise, leftSteamEnd, raisedGap, undercutAt, RAISED_DIR, riseAt, SPILL, spillFade,
  spillSource, SQUEEZE, STEAM_END, steamBounds, steamEndAfter, STEAM_GONE, STEAM_REST, stirFade, VEIL, veilDensity, veilSource, wakeFade,
} from '../src/scenes/dinner/steam.ts';

/**
 * Dinner v1.6: the steam under the cloche as a volume (Surya: "it needs to realistically accumulate
 * under the cloche and somewhat match its shape when it's lifted"). The field's plan is checked
 * against the cloche, the reveal's choreography and the physics it claims, through its CPU mirror
 * (the smooth envelope the shader adds its turbulence to); the scene's steam clocks are driven
 * through the real VisualDirector, stepping `simulate` the way the controller's fixed stepper does.
 */

const SU_CM = 16.875; // one Dinner scene unit (DINNER_WORLD_SCALE × 20 cm)

/** The dome's outer radius at height y (cover space). */
function domeRadius(y: number): number {
  for (let i = 1; i < COVER_PROFILE.length; i++) {
    const [r1, y1] = COVER_PROFILE[i]!;
    if (y <= y1) {
      const [r0, y0] = COVER_PROFILE[i - 1]!;
      return y1 > y0 ? r0 + ((r1 - r0) * (y - y0)) / (y1 - y0) : r1;
    }
  }
  return 0;
}
/** The forward-mapped cavity outline at τ: its top, the widest of its upper half and of its base. */
function outline(tau: number) {
  const s = cloudState(tau);
  const { radius: R, height: H, power: p, rim } = CLOUD;
  let top = 0, cap = 0, low = 0;
  for (let i = 0; i <= 60; i++) {
    const q = (i / 60) * H, P = R * Math.pow(Math.max(0, 1 - Math.pow(q / H, p)), 1 / p);
    const [r, y] = axisForward(P, rim + q, s);
    top = Math.max(top, y);
    if (q > 0.35) cap = Math.max(cap, r);
  }
  low = axisForward(0.6, 0.1, s)[0];
  return { top, cap, low, base: axisForward(0.6, 0.1, s) };
}
/**
 * (v1.6 polish 6) The visible outline at τ: the cavity's wall moved in by the condensate's receding edge (the
 * superellipse's p-norm distance, the crown's leading face receding least), forward-mapped: its top and its widest.
 */
function visibleOutline(tau: number) {
  const s = cloudState(tau);
  const { radius: R, height: H, power: p, rim } = CLOUD;
  let top = 0, cap = 0;
  for (let i = 0; i <= 60; i++) {
    const q = (i / 60) * H, P = R * Math.pow(Math.max(0, 1 - Math.pow(q / H, p)), 1 / p);
    const k = Math.max(0, 1 - (s.recede * recedeWeight(P, rim + q)) / Math.min(R, H));
    const [r, y] = axisForward(P * k, rim + q * k, s);
    top = Math.max(top, y);
    if (q > 0.35) cap = Math.max(cap, r);
  }
  return { top, cap };
}

describe('Dinner steam field (v1.6)', () => {
  it('is a pure function of the steam clock: the same state and the same density every time, all finite', () => {
    const p = new Vector3(0.2, 0.5, -0.1);
    for (const tau of [0, 0.3, 0.6, 1.2, 2.5]) {
      expect(cloudState(tau)).toEqual(cloudState(tau));
      expect(cloudDensity(p, cloudState(tau))).toBe(cloudDensity(p, cloudState(tau)));
      const s = cloudState(tau);
      for (const v of [s.rise, s.dragUp, s.cap, s.stem, s.skirt, s.roll, s.ringR, s.ringY, s.turb, s.erode, s.fade]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('accumulates under the cloche: at the seat the cloud is the dome\'s cavity, dense under the crown, clear just above the porcelain', () => {
    const s = cloudState(0);
    // Inside the cloche, above the plate: fog (densest under the crown).
    for (const [r, y] of [[0, 0.6], [0.3, 0.4], [0.45, 0.2], [0.2, 0.12]] as const) {
      // (v1.6 polish 5: the base keeps 35 % of the crown's density, was 55 %.)
      expect(cloudDensity(new Vector3(r, y, 0), s), `${r}, ${y}`).toBeGreaterThan(0.3);
    }
    expect(cloudDensity(new Vector3(0, 0.62, 0), s)).toBeGreaterThan(cloudDensity(new Vector3(0, 0.1, 0), s));
    // Outside the dome, above its crown, and on the porcelain itself: none.
    for (let i = 0; i < 400; i++) {
      const a = i * 2.399, r = 0.05 + (i % 20) * 0.045, y = ((i * 7) % 40) * 0.025;
      const p = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      const inside = y - COVER_SEATED.y < 0 ? r < COVER.lipRadius : r < domeRadius(y - COVER_SEATED.y);
      if (!inside) expect(cloudDensity(p, s), `${r.toFixed(2)}, ${y.toFixed(2)}`).toBe(0);
    }
    expect(cloudSeat(new Vector3(0.2, plateTop(0.2) + 0.002, 0))).toBeLessThan(0.05);
  });

  it('the lifting dome drags its top up a little while it is over the plate, then lets go', () => {
    expect(dragAt(0.2)).toBeGreaterThan(0);
    // (v1.6 polish 5: the held dome) While the fog holds the dome's shape its crown has taken up only a share of the
    // drag (under a centimetre and a half on the axis); the rest catches up after the hold, 1–4 cm in all.
    expect(dragAt(0.6) * dragCentre(0) * SU_CM).toBeLessThan(1.5);
    expect(dragAt(0.6) * dragCentre(0) * SU_CM).toBeGreaterThan(0.5);
    expect(dragAt(1.2) * SU_CM).toBeGreaterThan(1);
    expect(dragAt(1.2) * SU_CM).toBeLessThan(4);
    expect(heldDrag(CLOUD.hold[0])).toBeCloseTo(CLOUD.dragHeld, 6);
    expect(crownFray(CLOUD.hold[0])).toBe(0);
    expect(crownFray(CLOUD.hold[1])).toBe(1);
    // The held dome: 0.15–0.25 s after the rim clears the cloud's side (the release, 0.4 s) its top stands within
    // 2.5 cm of the cavity's (≈ 1 cm of drag, ≈ 1.2 cm of the bubble's slow start); a beat later it has been drawn up
    // and is rising away.
    expect(CLOUD.hold[0] - CLOUD.release).toBeGreaterThanOrEqual(0.15);
    expect(CLOUD.hold[0] - CLOUD.release).toBeLessThanOrEqual(0.25);
    expect((outline(CLOUD.hold[0]).top - outline(0).top) * SU_CM).toBeLessThan(2.5);
    expect((outline(1.0).top - outline(CLOUD.hold[0]).top) * SU_CM).toBeGreaterThan(5);
    // Once the dome is clear of the plate (≈ 0.45 s) and the crown has caught up (≈ 1.05 s) it drags nothing more.
    expect(dragAt(1.4)).toBeCloseTo(dragAt(1.1), 3);
    const side = new Vector2();
    dragAt(1.2, side);
    // Along the dome's path (back-left), a centimetre or so.
    expect(side.x * REVEAL_DIR.x + side.y * REVEAL_DIR.z).toBeGreaterThan(0);
    expect(side.length() * SU_CM).toBeLessThan(2.5);
  });

  it('keeps the dome\'s shape for a beat once the dome has cleared it, then mushrooms', () => {
    // The dome is clear of the plate's middle by 0.45 s.
    const f = sampleSequence('accept', 0.45, newFrame());
    expect(Math.hypot(f.coverPos.x, f.coverPos.z)).toBeGreaterThan(0.7);
    const seat = outline(0), held = outline(0.45), later = outline(1.3);
    // Its outline then is the cavity's within a centimetre and a half, its top drawn up into a peak after
    // the dome, 0.5–5 cm (of a 10.6 cm dome; v1.6 polish 5: the held dome, its crown drawn up ≈ 0.8 cm, was 1–5).
    expect(Math.abs(held.cap - seat.cap) * SU_CM).toBeLessThan(1.5);
    expect(Math.abs(held.low - seat.low) * SU_CM).toBeLessThan(1.5);
    expect((held.top - seat.top) * SU_CM).toBeGreaterThan(0.5);
    expect((held.top - seat.top) * SU_CM).toBeLessThan(5);
    // A buoyant bubble starts from rest: the top has risen under a centimetre and a half 0.2 s after the release.
    expect(riseAt(0.2) * SU_CM).toBeLessThan(1.5);
    // (v1.6 polish 5: then it rises away rather than hovering: the fifth judge measured the centroid ≈ 2 cm up at 1.12 s.)
    expect(riseAt(0.8) * SU_CM).toBeGreaterThan(12);
    // Then the cap rises away while the stem narrows.
    expect((later.top - held.top) * SU_CM).toBeGreaterThan(8);
    // (v1.6 polish 6; the sixth judge: "past one second the cloud behaves like smoke, not condensate": a smoke mushroom
    // 1.3× the plate. The thermal's air spreads, but its condensate evaporates from the edge in as the room's dry air
    // mixes in: the visible cap is narrower than the held dome by 1.3 s, and well inside the plate.)
    const vis = visibleOutline(1.3);
    expect(vis.cap).toBeLessThan(seat.cap);
    expect(vis.cap).toBeLessThan(0.85 * PLATE.radius);
    expect((vis.top - held.top) * SU_CM).toBeGreaterThan(6);
  });

  it('v1.6 polish 6: condensate, not smoke: its edge recedes from the release, the crown least, and it never gains fog', () => {
    // The visible boundary holds through the held dome (≤ 2 mm by 0.6 s), then recedes ≈ 2–3.5 cm by 1.0–1.4 s, never back.
    expect(cloudState(0.6).recede * SU_CM).toBeLessThan(0.2);
    expect(cloudState(1.0).recede * SU_CM).toBeGreaterThan(1.8);
    expect(cloudState(1.4).recede * SU_CM).toBeLessThan(3.5);
    let prev = 0;
    for (let tau = 0; tau <= 2.8; tau += 0.05) { const r = cloudState(tau).recede; expect(r).toBeGreaterThanOrEqual(prev); prev = r; }
    // The crown's leading face recedes least; the sides and the base the whole of it.
    expect(recedeWeight(0, CLOUD.rim + CLOUD.height)).toBeLessThan(0.35);
    expect(recedeWeight(CLOUD.radius, CLOUD.rim + 0.1)).toBe(1);
    // The vortex ring's core stays inside the visible edge (a rolled lip of the condensate, not a ring left outside it).
    for (const tau of [0.9, 1.1, 1.3]) {
      const s = cloudState(tau), wall = visibleOutline(tau);
      expect(s.ringR + s.ringSigma * 0.36).toBeLessThan(wall.cap + 0.05);
    }
    // No fog gathers once the dome has gone: the cap's own fog never rises after the release, and goes by the cloud's end.
    let cap = Infinity;
    for (let tau = 0.4; tau <= 2.8; tau += 0.05) { const s = cloudState(tau), c = cloudLook(s.age, s.erode).capCore; expect(c).toBeLessThanOrEqual(cap + 1e-12); cap = c; }
    expect(cloudLook(cloudState(3.0).age).capCore).toBeLessThan(1e-9);
  });

  it('v1.6 polish: holds the dome\'s shape ≈ 0.3 s with no drift, then a cap no wider than the plate that thins by 1.2 s', () => {
    // The dome is clear of the cloud by ≈ 0.45 s; at 0.72 s the walls still stand within a centimetre
    // and a half of the cavity's, the base has not slumped, and nothing leans or drifts sideways.
    const seat = outline(0), held = outline(0.72);
    expect(Math.abs(held.cap - seat.cap) * SU_CM).toBeLessThan(1.5);
    expect(Math.abs(held.low - seat.low) * SU_CM).toBeLessThan(1.5);
    for (const tau of [0.45, 0.55, 0.65]) expect(cloudState(tau).lean.length() * SU_CM).toBeLessThan(0.05);
    // While it is still over the plate, the cap's widest (its roll, the draught's lean at its height and the edge's
    // mean reach included) stays within ≈ the plate (v1.6 polish 5: 1.15× its radius while it rolls, by 1.3 s, as the
    // stronger thermal rises away; the first judge measured 1.2–1.4× and called it far too much vapour).
    let widest = 0;
    for (let tau = 0.5; tau <= 1.3; tau += 0.05) {
      const s = cloudState(tau), o = outline(tau), look = cloudLook(s.age, s.erode, undefined, s.peel);
      widest = Math.max(widest, o.cap + s.lean.length() * Math.max(0, o.top - 0.15) + 0.5 * (look.amp + look.billow));
    }
    expect(widest).toBeLessThanOrEqual(1.15 * PLATE.radius);
    // Less vapour: by 1.2 s the fog inside has mostly gone (the sheets carry what is left), and evaporation is under way
    // (v1.6 polish 6: from the edge in: the boundary has receded ≈ 2.5 cm, the erosion is slower and the edge's).
    const at12 = cloudState(1.2);
    expect(cloudLook(at12.age, at12.erode).core).toBeLessThan(0.25);
    expect(at12.erode).toBeGreaterThan(0.15);
    expect(at12.recede * SU_CM).toBeGreaterThan(2);
    // The edge: a band under a centimetre while young (v1.6 polish 4: ≈ 6 mm, the sheets that cross it carry the
    // outline), widening as the room's air mixes in, carved by 1–2 cm lobes.
    expect(cloudLook(0).band * SU_CM).toBeLessThan(0.7);
    expect(cloudLook(1.5).band).toBeGreaterThan(cloudLook(0).band * 2);
    expect(cloudLook(0).billow * SU_CM).toBeGreaterThan(0.3);
    // The vortex ring rolls the cap's edge into a lip, over a third of a turn by 1.2 s (v1.6 polish 6: a rolled lip, not the
    // sixth judge's smoke ring: more than half a turn before).
    expect(at12.roll).toBeGreaterThan(2);
  });

  it('v1.6 polish 2: from the lift-off the outer layer peels while the bulk holds; room air undercuts the foot from the rim in', () => {
    // Nothing peels while the dome still sits on the plate; the outer layer is fully turbulent soon
    // after the rim has lifted off, and its lobes and curls are centimetre and millimetre scale.
    expect(cloudState(0.2).peel).toBe(0);
    expect(cloudState(0.55).peel).toBeGreaterThan(0.75);
    expect(EDGE.fine * SU_CM).toBeGreaterThan(0.3);
    expect(EDGE.fine * SU_CM).toBeLessThan(0.6);
    expect(cloudLook(0.15, 0, undefined, 1).billow * SU_CM).toBeGreaterThan(1.2 * cloudLook(0.15, 0).billow * SU_CM);
    // The gravity current: none before the lift-off; by 0.55 s it has lifted the fog off the porcelain
    // at the rim by more than a centimetre, while 3 cm in the fog still sits on the well.
    expect(cloudState(0.25).undercutReach).toBe(0);
    const s = cloudState(0.55);
    expect(undercutAt(CLOUD.radius - 0.01, s) * SU_CM).toBeGreaterThan(1.0);
    expect(undercutAt(CLOUD.radius - 3 / SU_CM - s.undercutReach, s)).toBe(0);
    const at = (P: number, h: number) => cloudSeat(new Vector3(P, plateTop(P) + h, 0), CLOUD.floor, undercutAt(P, s));
    expect(at(CLOUD.radius - 0.05, 0.04)).toBeLessThan(0.05 * at(0.2, 0.04));
    expect(at(0.2, 0.04)).toBeGreaterThan(0.2);
    // (The held dome: the walls stand where they were, the undercut takes only the foot.)
    const P = CLOUD.radius - 0.05;
    expect(at(P, 0.25)).toBeCloseTo(cloudSeat(new Vector3(P, plateTop(P) + 0.25, 0), CLOUD.floor), 6);
  });

  it('v1.6 polish 2: the steam is lit in colour (a neutral key, a warm room) and its march fits the budget', () => {
    // The room's light is warmer than the key's: red over blue, so steam lit mostly by the room in a
    // warm room reads warm; the key is the window's light as the white plate renders it (neutral).
    const k = STEAM_LOOK.keyTint, r = STEAM_LOOK.roomTint;
    expect(Math.abs(k.r - k.b)).toBeLessThan(0.01);
    expect(r.r - r.b).toBeGreaterThan(0.04);
    // (v1.6 polish 3: #E6D7C0, linear R − B 0.26: the room is a smaller share of the light, so its tint is warmer; not orange.)
    expect(r.r - r.b).toBeLessThan(0.3);
    // The plate's shadow is a fraction of the key's share; dense fog in front of a surface casts none on it (the composite).
    expect(STEAM_LOOK.shadow).toBeLessThanOrEqual(0.2);
    // The march's budgets: the young cloud's fine edge the most, thin steam less; steps by phase.
    expect(STEAM_LOOK.thinPixels).toBeLessThan(STEAM_LOOK.marchPixels);
    expect(STEAM_LOOK.steps.dense).toBeGreaterThan(STEAM_LOOK.steps.thin);
    expect(STEAM_LOOK.steps.thin).toBeGreaterThanOrEqual(STEAM_LOOK.steps.veil);
  });

  it('v1.6 polish 3: a translucent body with a denser mixing skin; the cap keeps its fog as the stem and base empty; the light is a key over a fill', () => {
    // Translucent: the young fog's own density is a fraction of polish 2's (2.2), the skin where it
    // meets the room's air several times the core (the limb reads, the far rim shows through).
    const young = cloudLook(0.1, 0);
    expect(young.core).toBeLessThan(0.3);
    // (v1.6 polish 4: the body is thin dense sheets with clear air between, the skin light: a sheet is many times
    // the haze between sheets and denser than the skin, so the limb is no denser than the core.)
    expect(young.fold).toBeGreaterThan(10 * young.haze);
    expect(young.core * young.fold).toBeGreaterThan(young.sheet);
    // No hollow ring: the cap keeps a fog of its own after the core has emptied, and it thins by 1.4 s.
    const at = (tau: number) => cloudLook(cloudState(tau).age, cloudState(tau).erode);
    expect(at(1.0).capCore).toBeGreaterThan(2 * at(1.0).core);
    expect(at(1.0).capCore).toBeGreaterThan(0.08);
    // (v1.6 polish 5: the cap keeps its fog as it rises away, then thins: the fifth judge saw it "evaporate in place";
    // polish 6: it loses a third of it as the room's air first mixes in, keeps the rest and goes by the cloud's end.)
    expect(at(1.4).capCore).toBeGreaterThan(0.6 * at(1.0).capCore);
    expect(at(2.6).capCore).toBeLessThan(0.5 * at(1.0).capCore);
    // The light: the multiple-scattering octaves pulled back from polish 2 (0.45 / 0.18), the key's
    // shadow through the cloud steeper (1.25), the room a fill.
    expect(STEAM_LOOK.ms[0]).toBeLessThan(0.3);
    expect(STEAM_LOOK.ms[1]).toBeLessThan(0.1);
    expect(STEAM_LOOK.keyFall).toBeGreaterThan(2);
    expect(STEAM_LOOK.room).toBeLessThan(STEAM_LOOK.key / 10);
    // (v1.6 polish 6: a terminator: the key's self-shadow steeper, its floor the deep shade's diffuse light, under a fifth.)
    expect(STEAM_LOOK.keyFall).toBeGreaterThan(5);
    expect(STEAM_LOOK.keyFloor).toBeLessThan(0.2);
  });

  it('v1.6 polish 3: a gush out of the raised gap, rolling out over the rim and rising, gone by 0.66 s; its box holds it', () => {
    // The gap opens with the tip and closes at the lift-off; nothing after 0.5 s.
    expect(raisedGap(0)).toBe(0);
    expect(raisedGap(0.2)).toBeGreaterThan(0.05);
    expect(raisedGap(0.6)).toBe(0);
    // A parcel rolls out a few centimetres and rises as it slows, at a buoyant plume's pace.
    expect(gushOut(0.5) * SU_CM).toBeGreaterThan(2.5);
    expect(gushOut(0.5) * SU_CM).toBeLessThan(5);
    for (let a = 0; a < 0.5; a += 0.05) {
      expect(gushOut(a + 0.05)).toBeGreaterThanOrEqual(gushOut(a));
      expect(((gushRise(a + 0.05) - gushRise(a)) / 0.05) * SU_CM).toBeLessThan(35);
    }
    expect(gushRise(0.3) * SU_CM).toBeGreaterThan(3);
    // (v1.6 polish 5: it fades over 0.34–0.5 s, was 0.36–0.56; polish 6: over 0.42–0.66 s, carried up and out as it goes:
    // its oldest parcels have risen ≥ 8 cm by the time it has half gone. Polish 7: from 0.4 s, the seventh judge's "airbrushed
    // ball": its carried puff under 70 k px of the laptop's frame; the end, which sets its box, unchanged. The drawn tube widens
    // by `shownGrow` of the parcels' travel, the box by `grow`: the box still holds what is drawn.)
    expect(spillFade(0.4)).toBe(1);
    expect(spillFade(0.41)).toBeGreaterThan(0.98);
    expect(GUSH.shownGrow).toBeLessThanOrEqual(GUSH.grow);
    expect(spillFade(0.66)).toBe(0);
    expect(gushRise(0.54 - 0.3) * SU_CM).toBeGreaterThan(5);
    expect(gushRise(0.54 - 0.15) * SU_CM).toBeGreaterThan(8);
    // The box: every parcel's centre (round the raised side) at τ 0.3, 0.45 and 0.6 is inside it.
    for (const tau of [0.3, 0.45, 0.6]) {
      const s = cloudState(tau), lo = new Vector3(), hi = new Vector3();
      steamBounds(s, { tau, emitStart: -Infinity, emitEnd: Infinity }, new Vector3(), new Vector3(), new Vector3(), new Vector3(), lo, hi);
      for (let k = 0; k < SPILL.samples; k++) {
        const a = k * SPILL.dt, g = raisedGap(tau - a);
        if (spillSource(tau - a) <= 0) continue;
        for (const ang of [-0.5, 0, 0.5, 1.0]) {
          const dx = RAISED_DIR.x * Math.cos(ang) - RAISED_DIR.y * Math.sin(ang), dz = RAISED_DIR.x * Math.sin(ang) + RAISED_DIR.y * Math.cos(ang);
          const r = COVER.lipRadius + gushOut(a), y = plateTop(COVER.lipRadius) + 0.6 * g + gushRise(a);
          const p = new Vector3(dx * r, y, dz * r);
          expect(p.x).toBeGreaterThanOrEqual(lo.x); expect(p.x).toBeLessThanOrEqual(hi.x);
          expect(p.z).toBeGreaterThanOrEqual(lo.z); expect(p.z).toBeLessThanOrEqual(hi.z);
          expect(p.y).toBeLessThanOrEqual(hi.y);
        }
      }
    }
  });

  it('its base rolls outward and down over the plate\'s rim', () => {
    const s0 = outline(0), s1 = outline(1.3);
    expect(s0.base[0]).toBeLessThan(PLATE.giltRadius);
    // The base's outer air has slumped out to the gilt rim and beyond, no higher than the rim.
    expect(s1.base[0]).toBeGreaterThan(PLATE.giltRadius);
    // (v1.6 polish 5: lifted ≈ 1.2 cm by the stronger thermal's wake, was 0.05 su.)
    expect(s1.base[1]).toBeLessThan(PLATE.rimHeight + 0.08);
    // ... and the vortex ring rolls the cap's edge: the cloud's widest point is in its upper half.
    expect(outline(1.3).cap).toBeGreaterThan(axisForward(0.4, 0.3, cloudState(1.3))[0]);
  });

  it('rises like the warm air off a hot dish: at most 25 cm/s, slowing as it mixes in', () => {
    let vmax = 0;
    for (let a = 0; a < 3; a += 0.01) vmax = Math.max(vmax, (riseAt(a + 0.01) - riseAt(a)) / 0.01);
    expect(vmax * SU_CM).toBeLessThan(25);
    expect(vmax * SU_CM).toBeGreaterThan(8);
    const w = (a: number) => (riseAt(a + 0.005) - riseAt(a - 0.005)) / 0.01;
    expect(w(2.0)).toBeLessThan(w(0.7));
  });

  it('the shader\'s inverse map undoes the flow: forward(inverse(p)) = p wherever the cloud is', () => {
    let worst = 0;
    for (const tau of [0.4, 0.8, 1.2, 1.8]) {
      const s = cloudState(tau);
      for (let r = 0.02; r < 1.2; r += 0.05) {
        for (let y = 0.05; y < 2.2; y += 0.05) {
          if (cloudDensity(new Vector3(r, y, 0), s) <= 0) continue;
          const [P, Y] = axisInverse(r, y, s);
          const [r2, y2] = axisForward(P, Y, s);
          worst = Math.max(worst, Math.hypot(r2 - r, y2 - y));
        }
      }
    }
    // Within half a centimetre (the bisections' tolerance).
    expect(worst * SU_CM).toBeLessThan(0.5);
  });

  it('nothing in or under the plate or the table; the bounds hold all of it', () => {
    const min = new Vector3(), max = new Vector3(), vmin = new Vector3(), vmax = new Vector3();
    for (const tau of [0, 0.35, 0.6, 1.0, 1.6, 2.4]) {
      const s = cloudState(tau);
      steamBounds(s, { tau, emitStart: -Infinity, emitEnd: Infinity }, min, max, vmin, vmax);
      for (let i = 0; i < 1500; i++) {
        const a = i * 2.399, r = (i % 30) * 0.045, y = ((i * 13) % 60) * 0.045;
        const p = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        const d = cloudDensity(p, s);
        if (y < (r < PLATE.radius ? plateTop(r) : 0)) expect(d, `τ ${tau} at ${r.toFixed(2)}, ${y.toFixed(2)}`).toBe(0);
        if (d > 0.01) {
          expect(p.x).toBeGreaterThanOrEqual(min.x);
          expect(p.x).toBeLessThanOrEqual(max.x);
          expect(p.y).toBeLessThanOrEqual(max.y);
          expect(p.z).toBeGreaterThanOrEqual(min.z);
          expect(p.z).toBeLessThanOrEqual(max.z);
        }
      }
    }
    expect(veilDensity(-0.01, 1)).toBe(0);
  });

  it('tears into wisps and evaporates within a few seconds; the plate keeps breathing a thin veil to ≈ 4.5 s, gone by STEAM_END', () => {
    // The cloud's look: young it is fog with a soft edge; then its edge folds into sheets and its inside empties.
    expect(cloudLook(0.1, 0).core).toBeGreaterThan(cloudLook(1.5, 0.3).core * 3);
    expect(cloudState(CLOUD.release + CLOUD.life).fade).toBe(0);
    expect(cloudState(1.5).erode).toBeGreaterThan(cloudState(0.8).erode);
    const veilMax = (tau: number) => Math.max(...[0.1, 0.3, 0.5, 0.8, 1.1].map((h) => veilDensity(h, tau)));
    expect(veilMax(1.2)).toBeGreaterThan(0.2);
    expect(veilMax(4.0)).toBeGreaterThan(0.02);
    // (v1.6 polish: the plate keeps a few thin wisps through 3–5 s.)
    expect(veilMax(4.0)).toBeLessThan(0.45 * veilMax(1.2));
    for (let h = 0; h <= VEIL.length; h += 0.02) expect(veilDensity(h, STEAM_END)).toBeLessThanOrEqual(STEAM_GONE * 1.01);
    expect(STEAM_END).toBeGreaterThanOrEqual(CLOUD.release + CLOUD.life);
    expect(STEAM_END).toBeGreaterThan(DURATIONS.accept + 4);
    expect(STEAM_END).toBeLessThan(DURATIONS.accept + 5.5);
  });

  it('spills first from under the raised (guest) side while the far rim is still on the plate, until the dome lifts off', () => {
    expect(RAISED_DIR.x * REVEAL_DIR.x + RAISED_DIR.y * REVEAL_DIR.z).toBeLessThan(-0.99);
    const first = [0.02, 0.04, 0.06, 0.08, 0.1].find((t) => spillSource(t) > 0.05)!;
    expect(first).toBeLessThan(ACCEPT.tipPeak);
    // The far rim is the pivot then: still on the plate.
    const f = sampleSequence('accept', first, newFrame());
    expect(f.coverPos.y - COVER_SEATED.y).toBeLessThan(0.03);
    expect(spillSource(ACCEPT.tipPeak)).toBeGreaterThan(0.9);
    // (v1.6 polish 6: its feed tails off over 0.2–0.36 s as the dome lifts clear, was 0.24–0.3.)
    expect(spillSource(0.31)).toBeLessThan(0.3);
    expect(spillSource(0.37)).toBe(0);
    expect(spillFade(SPILL.fade[1])).toBe(0);
  });

  it('a reveal resumed part-way carries no new cloud (its cloud was left behind); a release window stops the veil softly', () => {
    expect(cloudState(0.8, 0.4).present).toBe(false);
    expect(cloudState(0.8).present).toBe(true);
    // The veil's source dies away over VEIL.cut after the cut, continuously.
    const cut = 1.0;
    for (let t = cut - 0.05; t < cut + VEIL.cut + 0.05; t += 0.005) {
      expect(Math.abs(veilSource(t + 0.005, -Infinity, cut) - veilSource(t, -Infinity, cut))).toBeLessThan(0.08);
    }
    expect(veilSource(cut + VEIL.cut, -Infinity, cut)).toBe(0);
    // Resumed at 0.6 s: nothing before, ramped up after.
    expect(veilSource(0.6, 0.6)).toBe(0);
    expect(veilSource(0.61, 0.6)).toBeLessThan(0.02);
  });

  it('the accepted still has no steam (posters, reduced motion, a saved accept)', () => {
    expect(STEAM_REST).toBeNull();
  });
});

// ── The scene's steam clock, through the director ───────────────────────────────
function plainLibrary(): MaterialLibrary {
  const direction = DIRECTIONS.L2;
  const cache = new Map<string, MeshStandardMaterial>();
  const make = (n: string) => new MeshStandardMaterial({ name: n, color: new Color(direction.surfaces[n]?.color ?? '#888888') });
  return { direction, get: (n: string) => cache.get(n) ?? (cache.set(n, make(n)), cache.get(n)!), unique: make, dispose() {} } as unknown as MaterialLibrary;
}

function stage() {
  const bin = buildDisposalBin({ lib: plainLibrary() });
  const plate = new Group(); plate.name = 'plate_authored';
  const cover = new Group(); cover.name = 'cover_authored';
  const root = new Group().add(plate, cover, bin);
  const stub = { setFootprint() {}, setHeight() {}, visible: false };
  const rig = {
    root, nodes: { plate_authored: plate, cover_authored: cover, bin_root: bin }, shadows: [], dishShadow: stub, coverShadow: stub,
    flapL: bin.getObjectByName('bin_flap_l')!, flapR: bin.getObjectByName('bin_flap_r')!, bounds: dinnerBounds(), setPreset() {}, dispose() {},
  } as unknown as DinnerRig;
  const scene = new DinnerScene(rig, { category: 'dinner', dish: 'pasta' });
  const director = new VisualDirector({ complete() {} }, 'guest', null);
  director.attach(scene);
  let now = 0;
  /** Frames of the controller's loop: the director, then simulate in 1/120 s steps. */
  const run = (seconds: number, each?: (t: number) => void) => {
    const end = now + seconds;
    while (now < end - 1e-9) {
      now += 1 / 60;
      const playing = director.update(now);
      scene.simulate(1 / 120);
      scene.simulate(1 / 120);
      each?.(now);
      if (!playing && !scene.settling() && !each) break;
    }
  };
  director.update(0);
  return { scene, director, run, get now() { return now; } };
}

describe('Dinner steam on stage (v1.5 clocks, v1.6 field)', () => {
  it('the reveal releases it on its own clock, it rises on after the reveal and ends clear; the loop then idles', () => {
    const s = stage();
    expect(s.scene.steamState.visible).toBe(false);
    s.director.setIntent('accept');
    const start = s.now;
    let firstSeen = -1;
    s.run(DURATIONS.accept - 0.05, (t) => {
      const st = s.scene.steamState;
      if (st.visible && firstSeen < 0) firstSeen = t - start;
      // Driven by the reveal's samples: the steam clock is the accept's time.
      if (st.tau !== null) expect(st.tau).toBeCloseTo(t - start, 6);
    });
    expect(firstSeen).toBeGreaterThanOrEqual(0);
    expect(firstSeen).toBeLessThan(0.05);
    // The director ends the reveal (accepted pose); the steam carries on through simulate.
    s.run(0.2);
    expect(s.director.state).toBe('accepted-pose');
    expect(s.scene.settling()).toBe(true);
    expect(s.scene.steamState.visible).toBe(true);
    const mid = s.scene.steamState.tau!;
    expect(mid).toBeGreaterThan(DURATIONS.accept);
    // Until it has gone: then nothing shows and the scene no longer asks for frames.
    let frames = 0;
    s.run(STEAM_END, () => { if (s.scene.settling()) frames++; });
    expect(s.scene.settling()).toBe(false);
    expect(s.scene.steamState.visible).toBe(false);
    expect(frames / 60).toBeCloseTo(STEAM_END - mid, 1);
  });

  it('decline and covering never show steam (the cloche stays on)', () => {
    const s = stage();
    s.director.setIntent('decline');
    s.run(DURATIONS.decline + 0.5, () => expect(s.scene.steamState.visible).toBe(false));
    const h = stage();
    h.director.setMode('host');
    h.director.prepareHost();
    h.run(DURATIONS.host + 0.5, () => expect(h.scene.steamState.visible).toBe(false));
  });

  it('reduced motion and a saved accept show the canonical still; settle() snaps live steam to it', () => {
    const s = stage();
    s.director.setReducedMotion(true);
    s.director.setIntent('accept');
    s.run(0.5);
    expect(s.scene.steamState.tau).toBe(STEAM_REST?.tau ?? null);
    expect(s.scene.settling()).toBe(false);
    const live = stage();
    live.director.setIntent('accept');
    live.run(DURATIONS.accept + 0.3);
    expect(live.scene.settling()).toBe(true);
    live.scene.settle();
    expect(live.scene.settling()).toBe(false);
    expect(live.scene.steamState.tau).toBe(STEAM_REST?.tau ?? null);
  });

  it('a replay starts the steam from the beginning (nothing accumulates)', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(DURATIONS.accept + 0.6);
    s.director.replay();
    expect(s.scene.steamState.tau).toBe(0);
    s.run(0.5);
    expect(s.scene.steamState.tau).toBeCloseTo(0.5, 6);
  });

  it('after a change back to accept, the steam follows the (possibly sped-up) reveal, then real time, with no jump', () => {
    const s = stage();
    s.director.setIntent('decline');
    s.run(0.7);
    s.director.setIntent('accept');
    let prev: number | null = null, maxStep = 0, steps = 0;
    s.run(DURATIONS.accept + 0.6, () => {
      const tau = s.scene.steamState.tau;
      if (tau !== null && prev !== null) {
        maxStep = Math.max(maxStep, tau - prev);
        expect(tau).toBeGreaterThanOrEqual(prev);
        steps++;
      }
      prev = tau;
    });
    expect(steps).toBeGreaterThan(30);
    // At most the reveal's speed-up per frame (k ≤ 1.5), never a skip.
    expect(maxStep).toBeLessThanOrEqual((1.5 / 60) * 1.01);
    expect(s.director.state).toBe('accepted-pose');
    expect(s.scene.settling()).toBe(true);
  });

  it('a change of mind mid-reveal leaves the steam already out to rise on and disperse on its own; nothing more is released', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(0.5);
    const before = s.scene.steamState;
    const cut = before.tau!;
    s.director.setIntent('decline');
    // The cut is never seen: the same steam, on the same clock, left behind (no fade).
    const after = s.scene.steamState;
    expect(after.visible).toBe(true);
    expect(after.tau).toBeNull();
    expect(after.left).toHaveLength(1);
    expect(after.left[0]).toMatchObject({ tau: cut, emitEnd: cut });
    const capture = after.left[0]!.capture;
    expect(after.left[0]!.until).toBe(leftSteamEnd(cut, -Infinity, capture));
    expect(after.left[0]!.until).toBeLessThanOrEqual(steamEndAfter(cut));
    // Stirred by the returning cover, it thins smoothly from the cut (no step), to 1 % within ≈ 2.5 s.
    expect(stirFade(0)).toBe(1);
    expect(1 - stirFade(1 / 60)).toBeLessThan(0.01);
    expect(stirFade(0.5)).toBeGreaterThan(0.3);
    expect(stirFade(2.5)).toBeLessThan(0.01);
    expect(after.fade).toBe(1);
    // The rewind sets the cover back on the plate: what it closes over then stays under it (the
    // first frame that counts has it seated, or barely lifted with the plate); the dish's wake
    // then breaks up the rest, smoothly.
    expect(wakeFade(0)).toBe(1);
    expect(1 - wakeFade(1 / 60)).toBeLessThan(0.02);
    expect(wakeFade(1.5)).toBeLessThan(0.01);
    expect(capture - cut).toBeGreaterThanOrEqual(REWIND.min);
    expect(capture - cut).toBeLessThanOrEqual(REWIND.max.decline + 1 / 60);
    const seated = frameFor('guest-ready', newFrame()).coverPos;
    // It disperses over its own life (over half a second here; stirred, thinning from the cut), then it has gone and the loop idles,
    // the decline's end (its pose) notwithstanding.
    const until = after.left[0]!.until;
    expect(until - cut).toBeGreaterThan(0.6);
    // (v1.6 polish 5) The seating's puffs live out their own life in the room's air as the dish is lifted away: the
    // clock that carries them outlives them (they were cut off with it, and with their box, in one frame).
    expect(until).toBeGreaterThanOrEqual(capture + SQUEEZE.life - 0.01);
    expect(SQUEEZE.life).toBeGreaterThan(0.5);
    let prev = cut, frames = 0, closed = false;
    s.run(until - cut + 0.1, () => {
      const l = s.scene.steamState.left;
      if (!l.length) return;
      expect(l[0]!.tau).toBeCloseTo(prev + 1 / 60, 9);
      if (!closed && l[0]!.tau >= capture) {
        closed = true;
        expect(s.scene.rig.nodes.cover_authored!.position.distanceTo(seated)).toBeLessThan(0.02);
      }
      prev = l[0]!.tau;
      frames++;
    });
    expect(closed).toBe(true);
    expect(frames / 60).toBeCloseTo(until - cut, 1);
    expect(s.scene.steamState.visible).toBe(false);
    s.run(DURATIONS.decline + 1);
    expect(s.director.state).toBe('declined-pose');
    expect(s.scene.steamState.visible).toBe(false);
    expect(s.scene.settling()).toBe(false);
    // The release stops softly: the veil's source dies away over VEIL.cut (continuous), then nothing;
    // its column's base detaches and rises off at its rise speed.
    for (let t = cut - 0.05; t < cut + VEIL.cut + 0.05; t += 0.005) {
      expect(Math.abs(veilSource(t + 0.005, -Infinity, cut) - veilSource(t, -Infinity, cut))).toBeLessThan(0.08);
    }
    expect(veilSource(cut + VEIL.cut, -Infinity, cut)).toBe(0);
    const tau = cut + 0.6;
    expect(veilDensity(VEIL.rise * (tau - cut - VEIL.cut) - 0.01, tau, -Infinity, cut)).toBe(0);
  });

  it('changed back mid-rewind, the reveal resumes and releases its own steam beside what was left behind', () => {
    const s = stage();
    s.director.setIntent('accept');
    s.run(0.6);
    s.director.setIntent('decline');
    s.run(0.1);
    const [left] = s.scene.steamState.left;
    expect(left).toBeDefined();
    s.director.setIntent('accept');
    const st = s.scene.steamState;
    // What was left behind carries on untouched (no jump back, no pop); the cover never closed
    // over it.
    expect(st.left).toEqual([{ ...left, capture: Infinity, until: leftSteamEnd(left!.emitEnd) }]);
    expect(left!.capture).toBeGreaterThan(left!.tau);
    // The reveal resumes part-way down its rewind and releases only from there (ramped up).
    expect(st.tau).not.toBeNull();
    expect(st.tau!).toBeGreaterThan(0);
    expect(st.tau!).toBeLessThan(0.6);
    expect(st.emitStart).toBe(st.tau);
    expect(veilSource(st.tau! + 0.01, st.emitStart)).toBeLessThan(0.02);
    // Its cloud is the one left behind.
    expect(cloudState(st.tau!, st.emitStart).present).toBe(false);
    s.run(DURATIONS.accept + 0.1);
    expect(s.director.state).toBe('accepted-pose');
    expect(s.scene.settling()).toBe(true);
  });

  it('however often the guest changes their mind, at most two lots of steam are left behind and it all ends', () => {
    const s = stage();
    for (let i = 0; i < 8; i++) {
      s.director.setIntent(i % 2 ? 'decline' : 'accept');
      s.run(0.35, () => expect(s.scene.steamState.left.length).toBeLessThanOrEqual(2));
    }
    s.director.setIntent('decline');
    s.run(STEAM_END + 1);
    expect(s.scene.steamState.visible).toBe(false);
    expect(s.scene.settling()).toBe(false);
  });
});
