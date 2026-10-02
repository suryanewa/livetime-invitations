/**
 * The shared bin's materials at export (v1.5): the builder (models/disposalBin.ts) writes named
 * materials with their factors; this gives each its PBR textures, generated here (deterministic:
 * scripts/bin/textures.ts, scripts/bin/ao.ts) and encoded by the masters' texture policy (WebP,
 * normals exact-lossless). `pnpm models bin` runs it.
 *
 * Texel density (cf. the masters: 15–100 px/cm, the hoop's tiled maps 50 px/cm): micro-normals
 * and the steel's roughness are tiled on UV0 at 85–200 px/cm; the turned parts' occlusion and
 * roughness variation are unique on UV1 at 5–26 px/cm (they are low-frequency). v1.5 review (the
 * first decline uploaded 34 MiB of maps): the body's and the bucket's occlusion/roughness and the
 * steel's roughness at half size (the profile occlusion and the 20–40 cm mottle, and 0.12 mm per
 * texel for streaks of 0.4 mm and more, lose nothing at any size the bin is drawn); 17 MiB.
 */
import type { Document, Material } from '@gltf-transform/core';
import { KHRMaterialsAnisotropy } from '@gltf-transform/extensions';
import { BIN_LATHES } from '../../models/disposalBin.ts';
import { loadSharp } from '../masters/sharp.ts';
import type { ComposeLog } from '../masters/compose.ts';
import type { SceneRecipe } from '../masters/types.ts';
import { occlusionProfile } from './ao.ts';
import * as T from './textures.ts';

/** The texture policy the bin's textures go through (the masters' optimizeComposed chain). */
export const BIN_RECIPE: SceneRecipe = {
  scene: 'bin',
  masters: [],
  textures: { maxSize: 2048, quality: 92 },
  contract: ['bin_root', 'bin_body', 'bin_lid', 'bin_flap_l', 'bin_flap_r', 'bin_pedal'],
};

/** Physical tile sizes (cm per UV0 unit) the builder lays out; the textures are drawn to them. */
const TILE = { powder: 5.76, plastic: 3, rubber: 3, steel: 6, tread: 1.2 } as const;

export async function finishBin(doc: Document, log: ComposeLog): Promise<void> {
  const sharp = loadSharp();
  const root = doc.getRoot();
  const material = (name: string): Material => {
    const m = root.listMaterials().find((x) => x.getName() === name);
    if (!m) throw new Error(`bin material ${name} missing`);
    return m;
  };
  const texture = async (name: string, img: T.Image) => {
    const png = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    return doc.createTexture(name).setImage(new Uint8Array(png)).setMimeType('image/png');
  };
  const t0 = performance.now();

  // Tiled micro-detail (UV0).
  const powderN = await texture('bin_powder_normal', T.powderNormal(512, TILE.powder));
  const edmN = await texture('bin_pp_normal', T.ppNormal(512, TILE.plastic));
  const linerN = await texture('bin_liner_normal', T.edmNormal(512, TILE.plastic, 0.6));
  const rubberN = await texture('bin_rubber_normal', T.rubberNormal(256, TILE.rubber));
  const steelN = await texture('bin_steel_normal', T.brushedNormal(1024, TILE.steel));
  const steelORM = await texture('bin_steel_orm', T.brushedOrm(512));
  const treadN = await texture('bin_tread_normal', T.treadNormal(256, TILE.tread));

  // Unique occlusion + roughness (UV1) for the turned parts: occlusion along the profile, the
  // finish's own roughness with a soft mottle (periodic round the part).
  const turnedORM = async (part: string, width: number, height: number, rough: number, spread: number, seed: number) => {
    const ao = occlusionProfile(part, height);
    const mottle = T.roughnessMottle(width, height, 3, 2, seed);
    const aoField = T.field(width, height, (_u, _v, _c, row) => ao[row]!);
    const r = T.field(width, height, (_u, _v, c, row) => rough + spread * mottle[row * width + c]!);
    return texture(`${part}_orm`, T.orm(width, height, aoField, r, 0));
  };
  const setORM = (m: Material, tex: Awaited<ReturnType<typeof texture>>, texCoord: number, occlusion: boolean) => {
    m.setMetallicRoughnessTexture(tex).setRoughnessFactor(1);
    m.getMetallicRoughnessTextureInfo()!.setTexCoord(texCoord);
    if (occlusion) {
      m.setOcclusionTexture(tex).setOcclusionStrength(1);
      m.getOcclusionTextureInfo()!.setTexCoord(texCoord);
    }
  };
  const setNormal = (m: Material, tex: Awaited<ReturnType<typeof texture>>, scale = 1) => {
    m.setNormalTexture(tex).setNormalScale(scale);
    m.getNormalTextureInfo()!.setTexCoord(0);
  };

  // Body: satin graphite powder coat (roughness 0.29 ± 0.04 over 20–40 cm), orange peel.
  const body = material('bin_powder');
  setNormal(body, powderN);
  setORM(body, await turnedORM('bin_body', 1024, 512, 0.29, 0.04, 101), 1, true);
  // Base cup and lid ring: EDM-textured PP (0.56 / 0.52 ± 0.025).
  for (const [name, part, rough, seed] of [['bin_base', 'bin_base', 0.56, 103], ['bin_ring', 'bin_lid_ring', 0.52, 107]] as const) {
    const m = material(name);
    setNormal(m, edmN);
    setORM(m, await turnedORM(part, 1024, 256, rough, 0.025, seed), 1, true);
  }
  // Inner bucket: mid-grey PP (0.45 ± 0.03), deep occlusion inside.
  const liner = material('bin_liner');
  setNormal(liner, linerN);
  setORM(liner, await turnedORM('bin_liner', 512, 512, 0.45, 0.03, 109), 1, true);
  // Small PP parts (hinge knuckles, pedal housing).
  setNormal(material('bin_plastic'), edmN);
  setNormal(material('bin_rubber'), rubberN);
  setNormal(material('bin_tread'), treadN);
  // Brushed stainless: grain along u, anisotropic highlight across it.
  const steel = material('bin_steel');
  setNormal(steel, steelN);
  setORM(steel, steelORM, 0, false);
  steel.setMetallicFactor(1);
  const anisotropy = doc.createExtension(KHRMaterialsAnisotropy).createAnisotropy().setAnisotropyStrength(0.55).setAnisotropyRotation(Math.PI / 2);
  steel.setExtension('KHR_materials_anisotropy', anisotropy);

  for (const part of BIN_LATHES) if (!root.listNodes().some((n) => n.getName() === part.name)) throw new Error(`bin part ${part.name} missing`);
  log(`bin: textures generated in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}
