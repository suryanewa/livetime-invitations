import { describe, expect, it } from 'vitest';
import { BIN } from '../models/disposalBin.ts';
import { cm, REFERENCE_CM, WORLD_UNIT_CM } from '../models/worldScale.ts';
import { PARTY_WORLD_SCALE, PLAYER, RECORD } from '../models/recordContract.ts';
import { BIRTHDAY_WORLD_SCALE, CAKE_RADIUS, CAKE_SCALE, CAKE_TOTAL_HEIGHT, MASTER } from '../models/birthdayContract.ts';
import { BALL_R, BOARD, RIM, RIM_CENTER, SPORTS_WORLD_SCALE } from '../models/sportsContract.ts';
import { COVER, DINNER_WORLD_SCALE, DISH_HEIGHT, PLATE } from '../models/dinnerContract.ts';
import { BUSINESS_WORLD_SCALE, CARD, CARD_PRINT, MM_PER_UNIT, READER } from '../models/businessContract.ts';

/**
 * v1.4: one world scale (1 unit = 20 cm). Each scene's contract stays in its own scene units and
 * declares its world scale from one real-world reference; these are the real sizes that follow
 * (models/worldScale.ts REFERENCE_CM, docs/scenes/<scene>-v1.2.md "v1.4 scale").
 */
const toCm = (sceneUnits: number, worldScale: number) => sceneUnits * worldScale * WORLD_UNIT_CM;
const near = (value: number, target: number, rel: number) => expect(Math.abs(value - target) / target).toBeLessThanOrEqual(rel);

describe('World scale (v1.4): every object at its real size', () => {
  it('Party: the record is a 12-inch LP; the plinth about 42 × 32 cm', () => {
    near(toCm(2 * RECORD.radius, PARTY_WORLD_SCALE), REFERENCE_CM.record, 0.005);
    near(toCm(PLAYER.width, PARTY_WORLD_SCALE), 42.1, 0.01);
    near(toCm(PLAYER.depth, PARTY_WORLD_SCALE), 32.4, 0.01);
  });

  it('Birthday: the cake on its stand is 35 cm tall; the cake with candles sinks below the bin rim', () => {
    const onStand = (MASTER.cakeTop - MASTER.standBottom) * CAKE_SCALE;
    near(toCm(onStand, BIRTHDAY_WORLD_SCALE), REFERENCE_CM.cakeOnStand, 0.01);
    near(toCm(2 * CAKE_RADIUS, BIRTHDAY_WORLD_SCALE), 27.7, 0.01);
    near(toCm(2 * BIN.radius, BIRTHDAY_WORLD_SCALE), REFERENCE_CM.binDiameter.birthday, 0.005);
    expect(BIN.floor + CAKE_TOTAL_HEIGHT).toBeLessThan(BIN.rimTop);
    expect(CAKE_RADIUS).toBeLessThan(BIN.opening);
  });

  it('Sports (v1.5): an 18 cm mini ball, a 14.5" (36.8 cm) rim at 4 ft, a 74.9 cm mini board', () => {
    expect(SPORTS_WORLD_SCALE).toBeCloseTo(1.8, 10);
    near(toCm(2 * BALL_R, SPORTS_WORLD_SCALE), REFERENCE_CM.miniBall, 1e-9);
    near(toCm(2 * RIM.innerRadius, SPORTS_WORLD_SCALE), 36.83, 1e-9);
    near(toCm(BOARD.width, SPORTS_WORLD_SCALE), 74.9, 0.005);
    near(toCm(RIM_CENTER.y + RIM.tube, SPORTS_WORLD_SCALE), 121.92, 1e-6);
  });

  it('Dinner: a 27 cm plate under a 21.9 cm cloche; the bin sized against the dish', () => {
    near(toCm(2 * PLATE.radius, DINNER_WORLD_SCALE), REFERENCE_CM.plate, 1e-9);
    near(toCm(2 * COVER.radius, DINNER_WORLD_SCALE), 22.1, 0.01);
    near(toCm(DISH_HEIGHT, DINNER_WORLD_SCALE), 15.9, 0.01);
    near(toCm(2 * BIN.radius, DINNER_WORLD_SCALE), REFERENCE_CM.binDiameter.dinner, 0.005);
    expect(PLATE.radius).toBeLessThan(BIN.opening);
    expect(BIN.floor + DISH_HEIGHT).toBeLessThan(BIN.rimTop);
  });

  it('Business: a CR80 card; the holder about 5.7 × 8.9 cm, the reader 7.0 × 10.4 cm', () => {
    near(toCm(CARD_PRINT.width, BUSINESS_WORLD_SCALE), REFERENCE_CM.cardShortSide, 1e-9);
    // The physics already ran at this size: one scene unit is MM_PER_UNIT.
    near(BUSINESS_WORLD_SCALE * WORLD_UNIT_CM * 10, MM_PER_UNIT, 1e-9);
    near(toCm(CARD.width, BUSINESS_WORLD_SCALE), 5.67, 0.01);
    near(toCm(CARD.height, BUSINESS_WORLD_SCALE), 8.88, 0.01);
    near(toCm(READER.width, BUSINESS_WORLD_SCALE), 7.01, 0.01);
    near(toCm(READER.height, BUSINESS_WORLD_SCALE), 10.45, 0.01);
  });

  it('cm() converts with the one world unit', () => {
    expect(cm(WORLD_UNIT_CM)).toBe(1);
    expect(WORLD_UNIT_CM).toBe(20);
  });
});
