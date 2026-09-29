import type { Object3D } from 'three';
import { COVER, COVER_SEATED, PLATE, type DishPreset } from './dinnerContract.ts';
import {
  basilLeaves,
  broccoliCrowns,
  carrots,
  clocheShell,
  greens,
  knobGeometry,
  knobProxy,
  pastaNest,
  pastaProxy,
  PLATE_BAND,
  plateBody,
  plateFoot,
  plateProxy,
  sauceDollop,
  tomatoes,
  vegProxy,
} from './dinnerParts.ts';
import { cylinderBand, group, mesh } from './geometry.ts';
import { markNoShadowCast, markShadowProxy } from './shadowProxy.ts';
import type { ModelContext } from './types.ts';

/**
 * Dinner geometry (static parts + named nodes; exported to GLB). The shared bin comes from
 * assets/shared/disposal-bin.glb and is attached by the rig.
 *
 * Premium covered dish (style reference v1.0 object rule, L2 surfaces): a glazed cream coupe
 * plate on an ink-glazed foot band (its ≥3:1 base line), with the family perforation row inlaid
 * in a channel on its rim wall above the foot; a thin-walled cloche whose brushed satin dome
 * springs from a crisp applied rib over a polished skirt band rolled into a polished bead (the
 * delight: a mirror-bright lip whose glint travels round it as the cover lifts and tilts), a
 * superellipse dome with a turned step at the crown, a slightly darker satin inside with the
 * knob's fixing nut, and a broad turned coral anodised knob on a spun collar — the object's one
 * enamel insert. Food is modelled, not photographed: a fork-twirled spaghetti nest under a glossy
 * pool of tomato sauce whose rolled front lip faces the key (a crisp wet highlight line) and whose
 * sides thin to a film the strands break through, with basil (the larger leaf creased down its
 * midrib); or a generous, physically stacked pile of roasted vegetables — a bank of broccoli
 * florets (crowns of rounded sub-florets on pale branching stalks) behind a big central floret,
 * three baby carrots with feathery tops lying across the front, and a cluster of cherry tomatoes
 * on the vine at the front right.
 *
 * Draw calls: plate, ink foot, band, plate proxy, food meshes (three for pasta; four for the
 * vegetables, whose broccoli crowns take the darker velvety `mat_basil`), food proxy, cloche
 * outside (with the turned collar), polished band and bead, cloche inside, knob, knob proxy = 13
 * (pasta) / 14 (vegetables). Dense meshes skip the shadow pass; invisible low-poly proxies cast
 * for them (models/shadowProxy.ts), and the cloche's inner skin casts for the shell.
 */
export function buildDinnerGeometry(ctx: ModelContext, preset: DishPreset = 'pasta'): Object3D {
  const { lib } = ctx;
  const root = group('dinner_root');

  // ── Plate ──────────────────────────────────────────────────────────────────
  const plate = group('plate_authored', root);
  const plateSecondary = group('plate_secondary', plate);
  const plateMesh = mesh('plate_mesh', plateBody(72), lib.get('mat_plate'), plateSecondary);
  const foot = mesh('plate_foot', plateFoot(72), lib.get('mat_body_ink'), plateSecondary);
  // Family perforation row: whole dots round the rim wall, pitch = band height.
  const band = mesh('plate_signature', cylinderBand(PLATE_BAND.radius, PLATE_BAND.height, PLATE_BAND.height, 128), lib.get('mat_signature'), plateSecondary);
  band.position.y = PLATE_BAND.y;
  markNoShadowCast(plateMesh, foot, band);
  markShadowProxy(mesh('plate_shadow_proxy', plateProxy(), lib.get('mat_plate'), plateSecondary));

  // ── Food ───────────────────────────────────────────────────────────────────
  const food = group('food_root', plateSecondary);
  food.position.y = PLATE.well;

  const pasta = group('food_pasta', food);
  const nest = mesh('pasta_nest', pastaNest(), lib.get('mat_pasta'), pasta);
  const sauce = mesh('pasta_sauce', sauceDollop(), lib.get('mat_sauce'), pasta);
  const basil = mesh('pasta_basil', basilLeaves(), lib.get('mat_basil'), pasta);
  markNoShadowCast(nest, sauce, basil);
  markShadowProxy(mesh('pasta_shadow_proxy', pastaProxy(), lib.get('mat_pasta'), pasta));

  const veg = group('food_vegetables', food);
  const carrot = mesh('veg_carrots', carrots(), lib.get('mat_veg_orange'), veg);
  const tomato = mesh('veg_tomatoes', tomatoes(), lib.get('mat_veg_red'), veg);
  const green = mesh('veg_greens', greens(), lib.get('mat_veg_green'), veg);
  const broccoli = mesh('veg_broccoli', broccoliCrowns(), lib.get('mat_basil'), veg);
  markNoShadowCast(carrot, tomato, green, broccoli);
  markShadowProxy(mesh('veg_shadow_proxy', vegProxy(), lib.get('mat_veg_green'), veg));

  pasta.visible = preset === 'pasta';
  veg.visible = preset === 'vegetables';

  // ── Cloche ─────────────────────────────────────────────────────────────────
  const cover = group('cover_authored', root);
  cover.position.copy(COVER_SEATED);
  const coverSecondary = group('cover_secondary', cover);
  const shell = clocheShell(64, 16);
  const outer = mesh('cover_mesh', shell.outer, lib.get('mat_cloche'), coverSecondary);
  // Polished stock: the skirt band, the applied rib and the rolled bead.
  const bead = mesh('cover_bead', shell.bead, lib.get('mat_cloche_polished'), coverSecondary);
  const inner = mesh('cover_inner', shell.inner, lib.get('mat_metal_brushed'), coverSecondary);
  const knob = mesh('cover_handle', knobGeometry(32), lib.get('mat_anodized'), coverSecondary);
  knob.position.y = COVER.domeHeight;
  // The inner skin casts for the shell (see knobProxy); the outer skin, bead and knob skip the pass.
  markNoShadowCast(outer, bead, knob);
  const knobCaster = markShadowProxy(mesh('cover_handle_shadow_proxy', knobProxy(), lib.get('mat_anodized'), coverSecondary));
  knobCaster.position.y = COVER.domeHeight;

  group('dish_shadow', root).position.set(0, 0.002, 0);
  return root;
}
