import { Vector3 } from 'three';
import { NetSim, type NetLattice } from '../models/sportsNet.ts';

/** A fixed numeric kernel (typed-array loads and stores, a square root): the yardstick the net's cost is measured in. */
const REF = new Float64Array(4096);
function reference(): number {
  let s = 0;
  for (let k = 0; k < 64; k++) {
    for (let i = 0; i < REF.length; i++) {
      const v = Math.sqrt(REF[i]! + i * k + 1);
      REF[i] = v * 0.5;
      s += v;
    }
  }
  return s;
}

/**
 * The net simulation's cost per 60 fps frame (two 1/120 s steps, the ball in the net), in units of
 * the reference kernel, robust to machine load: the two are timed in interleaved rounds after a
 * warm-up and each is taken at its fastest round (contention only ever adds time, so the minimum
 * approaches the true cost of each, and their ratio does not depend on how loaded the machine is).
 */
export function netCost(lattice: NetLattice, rounds = 15): { perFrameMs: number; referenceMs: number; ratio: number } {
  const sim = new NetSim(lattice);
  const contact = { center: new Vector3(0, -0.3, 0), previous: new Vector3(0, -0.25, 0) };
  let i = 0;
  const frames = (n: number) => {
    for (let f = 0; f < n; f++) {
      for (let s = 0; s < 2; s++, i++) {
        contact.previous.copy(contact.center);
        contact.center.y = -0.3 - 0.4 * Math.sin(i / 20);
        sim.step(1 / 120, contact);
      }
    }
  };
  let sink = 0;
  frames(60);
  for (let w = 0; w < 5; w++) sink += reference();
  let simBest = Infinity, refBest = Infinity;
  for (let r = 0; r < rounds; r++) {
    let t0 = performance.now();
    frames(30);
    simBest = Math.min(simBest, (performance.now() - t0) / 30);
    t0 = performance.now();
    sink += reference();
    refBest = Math.min(refBest, performance.now() - t0);
  }
  if (sink === -1) console.log(sink);
  return { perFrameMs: simBest, referenceMs: refBest, ratio: simBest / refBest };
}
