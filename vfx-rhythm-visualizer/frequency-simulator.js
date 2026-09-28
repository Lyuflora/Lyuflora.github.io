const MAX_EVENTS = 1200;

function createRandom(seed) {
  let state = seed >>> 0;
  return function() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random, min, max) {
  return min + (max - min) * random();
}

/**
 * V1 interpretation point for the engine-specific emission rule.
 * A sampled spawn rate creates a base interval of 1 / rate seconds; the
 * sampled particle delay is added to that interval. Update this one function
 * when matching a particular game's particle-system semantics. The simulator
 * and its visualizations consume the resulting event records, not this rule.
 */
export function deriveSpawnInterval(sampledSpawnRate, sampledDelay) {
  const safeRate = Math.max(0.01, Number(sampledSpawnRate) || 0.01);
  const safeDelay = Math.max(0, Number(sampledDelay) || 0);
  return (1 / safeRate) + safeDelay;
}

export class SpawnSimulator {
  static simulate(settings) {
    const config = {
      spawnRateMin: Math.max(0.2, Number(settings.spawnRateMin) || 0.2),
      spawnRateMax: Math.max(0.2, Number(settings.spawnRateMax) || 0.2),
      particleDelayMin: Math.max(0, Number(settings.particleDelayMin) || 0),
      particleDelayMax: Math.max(0, Number(settings.particleDelayMax) || 0),
      duration: Math.min(20, Math.max(2, Number(settings.duration) || 8)),
      seed: (Number(settings.seed) >>> 0) || 1
    };
    config.spawnRateMin = Math.min(config.spawnRateMin, config.spawnRateMax);
    config.particleDelayMin = Math.min(config.particleDelayMin, config.particleDelayMax);

    const random = createRandom(config.seed);
    const events = [];
    let time = 0;

    while (events.length < MAX_EVENTS) {
      const sampledSpawnRate = between(random, config.spawnRateMin, config.spawnRateMax);
      const sampledDelay = between(random, config.particleDelayMin, config.particleDelayMax);
      const baseInterval = 1 / Math.max(0.01, sampledSpawnRate);
      const interval = deriveSpawnInterval(sampledSpawnRate, sampledDelay);
      time += interval;
      if (time > config.duration) break;
      events.push({
        time: time,
        sampledSpawnRate: sampledSpawnRate,
        sampledDelay: sampledDelay,
        baseInterval: baseInterval,
        interval: interval
      });
    }

    return {seed: config.seed, duration: config.duration, events: events};
  }
}

export function createOutcomeSeeds(seed) {
  const base = (Number(seed) >>> 0) || 1;
  return [1019, 2029, 4093].map(function(offset) {
    const value = (base + offset) >>> 0;
    return value || offset;
  });
}
