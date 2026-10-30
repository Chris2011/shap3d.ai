import { pluginContext } from './runtime';

/**
 * Sounds in the test run: a sound zone plays its sound in a loop while the player is inside (louder or softer by its
 * volume, with the echo of a room, hall or cave), the action _Play sound_ plays one once. A sound is a name – the
 * user's own files are kept with the plugin (Level panel › Sounds, `sounds/<name>.<ext>`); a name without a file plays
 * a stand-in made up from its name, so the timing can be tried before there are real sounds.
 */

const FOLDER = 'sounds/';
const AUDIO = /\.(ogg|mp3|wav|m4a|aac|flac|webm)$/i;

export type Reverb = 'none' | 'room' | 'hall' | 'cave';

/** the name a file is played by: its file name without the extension */
export const soundName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(AUDIO, '');

/** the user's sound files kept with the plugin */
export const listSounds = async () =>
  (await pluginContext().storage.files.list()).filter((file) => file.path.startsWith(FOLDER) && AUDIO.test(file.path));

export const addSound = async (file: File) => pluginContext().storage.files.put(FOLDER + file.name, file);
export const removeSound = async (path: string) => pluginContext().storage.files.remove(path);

interface Loop {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

interface Mixer {
  audio: AudioContext;
  master: GainNode;
  /** the decoded files by name */
  buffers: Map<string, AudioBuffer>;
  /** made-up stand-ins by name */
  standIns: Map<string, AudioBuffer>;
  echoes: Map<Reverb, ConvolverNode>;
  /** the zones' loops by name and echo */
  loops: Map<string, Loop>;
}

let mixer: Mixer | null = null;

/** a number from a name – the stand-in of the same name always sounds the same */
const hashOf = (name: string) => [...name].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7);

/**
 * A stand-in for a sound without a file: a loop of soft, deep rumbling noise for a zone (ambience, wind, hum …), a short
 * tone with a quick fall for a single sound – pitch and colour from the name.
 */
const standIn = (audio: AudioContext, name: string, loop: boolean) => {
  const hash = hashOf(name);
  const rate = audio.sampleRate;
  if (loop) {
    const buffer = audio.createBuffer(2, rate * 4, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      // brown noise, slowly swelling – two seconds of rise and fall, so the loop does not click
      let last = 0;
      const swell = 0.5 + ((hash >> 3) % 50) / 100;
      for (let index = 0; index < data.length; index++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        const wave = 0.75 + 0.25 * Math.sin((index / data.length) * Math.PI * 2 * swell * 2);
        data[index] = last * 3.2 * wave;
      }
      // ease the ends together
      const fade = Math.floor(rate * 0.05);
      for (let index = 0; index < fade; index++) {
        const share = index / fade;
        data[index] *= share;
        data[data.length - 1 - index] *= share;
      }
    }
    return buffer;
  }
  const length = 0.45;
  const buffer = audio.createBuffer(1, Math.floor(rate * length), rate);
  const data = buffer.getChannelData(0);
  const pitch = 160 + (hash % 640);
  const slide = ((hash >> 8) % 3) - 1;
  const rough = ((hash >> 12) % 4) / 10;
  for (let index = 0; index < data.length; index++) {
    const time = index / rate;
    const frequency = pitch * (1 + slide * time);
    const tone = Math.sin(2 * Math.PI * frequency * time) + 0.4 * Math.sin(4 * Math.PI * frequency * time);
    const envelope = Math.min(1, time * 200) * Math.exp(-time * 9);
    data[index] = (tone * (1 - rough) + (Math.random() * 2 - 1) * rough) * envelope * 0.4;
  }
  return buffer;
};

/** the echo of a room, hall or cave: noise that dies away over its time */
const echoOf = (audio: AudioContext, reverb: Reverb) => {
  const seconds = reverb === 'room' ? 0.6 : reverb === 'hall' ? 2 : 3.5;
  const buffer = audio.createBuffer(2, Math.floor(audio.sampleRate * seconds), audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++) {
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / data.length, reverb === 'cave' ? 1.6 : 2.6);
    }
  }
  const convolver = audio.createConvolver();
  convolver.buffer = buffer;
  return convolver;
};

/** starts the sound for a test run: the files are read and decoded (a missing or broken one plays its stand-in) */
export const startSounds = async () => {
  stopSounds();
  const audio = new AudioContext();
  const master = audio.createGain();
  master.connect(audio.destination);
  const made: Mixer = { audio, master, buffers: new Map(), standIns: new Map(), echoes: new Map(), loops: new Map() };
  mixer = made;
  const storage = pluginContext().storage.files;
  for (const file of await listSounds()) {
    try {
      const blob = await storage.get(file.path);
      if (blob && mixer === made) {
        made.buffers.set(soundName(file.path), await audio.decodeAudioData(await blob.arrayBuffer()));
      }
    } catch (error) {
      console.warn(error);
    }
  }
};

export const stopSounds = () => {
  if (!mixer) {
    return;
  }
  for (const loop of mixer.loops.values()) {
    loop.source.stop();
  }
  void mixer.audio.close();
  mixer = null;
};

const bufferOf = (current: Mixer, name: string, loop: boolean) =>
  current.buffers.get(name) ??
  current.standIns.get(`${loop}/${name}`) ??
  current.standIns.set(`${loop}/${name}`, standIn(current.audio, name, loop)).get(`${loop}/${name}`)!;

/** the way into the mix: straight, or half through the echo */
const outputOf = (current: Mixer, reverb: Reverb) => {
  if (reverb === 'none') {
    return current.master;
  }
  let echo = current.echoes.get(reverb);
  if (!echo) {
    echo = echoOf(current.audio, reverb);
    echo.connect(current.master);
    current.echoes.set(reverb, echo);
  }
  const split = current.audio.createGain();
  split.connect(current.master);
  split.connect(echo);
  return split;
};

/** plays a sound once (the action _Play sound_) */
export const playSound = (name: string, volume = 1, reverb: Reverb = 'none') => {
  const current = mixer;
  if (!current || !name) {
    return;
  }
  const source = current.audio.createBufferSource();
  source.buffer = bufferOf(current, name, false);
  const gain = current.audio.createGain();
  gain.gain.value = Math.max(0, volume);
  source.connect(gain).connect(outputOf(current, reverb));
  source.start();
};

/**
 * The zones the player is in now: their loops fade in, the others fade out (and stop once silent). Called every frame
 * of the test run.
 */
export const setZoneSounds = (zones: { name: string; volume: number; reverb: Reverb }[]) => {
  const current = mixer;
  if (!current) {
    return;
  }
  const now = current.audio.currentTime;
  const wanted = new Map(zones.filter((zone) => zone.name).map((zone) => [`${zone.reverb}/${zone.name}`, zone]));
  for (const [id, zone] of wanted) {
    let loop = current.loops.get(id);
    if (!loop) {
      const source = current.audio.createBufferSource();
      source.buffer = bufferOf(current, zone.name, true);
      source.loop = true;
      const gain = current.audio.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(outputOf(current, zone.reverb));
      source.start();
      loop = { source, gain };
      current.loops.set(id, loop);
    }
    loop.gain.gain.setTargetAtTime(Math.max(0, zone.volume) * 0.6, now, 0.4);
  }
  for (const [id, loop] of current.loops) {
    if (!wanted.has(id)) {
      loop.gain.gain.setTargetAtTime(0, now, 0.4);
      if (loop.gain.gain.value < 0.001) {
        loop.source.stop();
        current.loops.delete(id);
      }
    }
  }
};
