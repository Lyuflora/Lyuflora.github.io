const MIN_RATE = 0.55;
const MAX_RATE = 24;

function clamp(value,min,max) {
  return Math.min(max,Math.max(min,value));
}

function round(value,places) {
  const scale = Math.pow(10,places);
  return Math.round(value*scale)/scale;
}

/** Convert the two easy-tuner values into the emitter's exact rate and delay ranges. */
export function deriveEmitterSettings(tuning) {
  const density = clamp(Number(tuning.density)||0,0,100)/100;
  const randomness = clamp(Number(tuning.regularity)||0,0,100)/100;
  const centerRate = MIN_RATE*Math.pow(MAX_RATE/MIN_RATE,density);
  const spread = 0.035+randomness*0.70;
  const rateMin = clamp(round(centerRate*(1-spread/2),1),0.2,32);
  const rateMax = clamp(round(centerRate*(1+spread/2),1),0.2,32);
  const delayMax = clamp(round((1/centerRate)*randomness*0.82,2),0,1.5);
  return {
    spawnRateMin:Math.min(rateMin,rateMax),
    spawnRateMax:Math.max(rateMin,rateMax),
    particleDelayMin:0,
    particleDelayMax:delayMax
  };
}

/** Estimate the easy-tuner values represented by directly edited emitter ranges. */
export function inferSimpleTuning(settings) {
  const rateMin = Math.max(0.2,Number(settings.spawnRateMin)||0.2);
  const rateMax = Math.max(rateMin,Number(settings.spawnRateMax)||rateMin);
  const delayMin = Math.max(0,Number(settings.particleDelayMin)||0);
  const delayMax = Math.max(delayMin,Number(settings.particleDelayMax)||0);
  const centerRate = (rateMin+rateMax)/2;
  const meanDelay = (delayMin+delayMax)/2;
  const effectiveRate = 1/(1/centerRate+meanDelay);
  const density = Math.log(clamp(effectiveRate,MIN_RATE,MAX_RATE)/MIN_RATE)/Math.log(MAX_RATE/MIN_RATE);
  const rateSpread = clamp(((rateMax-rateMin)/centerRate-0.035)/0.70,0,1);
  const delaySpread = clamp(((delayMax-delayMin)*centerRate)/0.82,0,1);
  const regularity = rateSpread*0.55+delaySpread*0.45;
  return {
    density:Math.round(density*100),
    regularity:Math.round(regularity*100)
  };
}
