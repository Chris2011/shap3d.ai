// The worker that runs OpenSCAD. Plain JavaScript on purpose: plugin.js is one file, so this text is
// shipped inside it (compileWorker.js?raw) and started from a Blob. Every compile gets a new instance –
// an OpenSCAD instance only runs once – and it is gone afterwards.

let modulePromise = null;
let setup = { libraryDir: '', fontDir: '', fontsConf: '', fonts: [], library: [] };

const makeDirectories = (fs, path) => {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) {
    current += '/' + part;
    try {
      fs.mkdir(current);
    } catch {
      /* exists */
    }
  }
};
const writeFile = (fs, path, data) => {
  makeDirectories(fs, path.slice(0, path.lastIndexOf('/')));
  fs.writeFile(path, data);
};

const createInstance = async (log) => {
  const module = await modulePromise;
  const openscad = await module.createOpenSCAD({
    noInitialRun: true,
    print: (line) => log.push(line),
    printErr: (line) => log.push(line),
    preRun: [
      (instanceModule) => {
        instanceModule.ENV.OPENSCADPATH = setup.libraryDir;
        instanceModule.ENV.FONTCONFIG_FILE = `${setup.fontDir}/fonts.conf`;
      },
    ],
  });
  const instance = openscad.getInstance();
  makeDirectories(instance.FS, setup.libraryDir);
  makeDirectories(instance.FS, setup.fontDir);
  instance.FS.writeFile(`${setup.fontDir}/fonts.conf`, setup.fontsConf);
  for (const { name, data } of setup.fonts) {
    instance.FS.writeFile(`${setup.fontDir}/${name}`, data);
  }
  for (const { path, data, font } of setup.library) {
    writeFile(instance.FS, `${setup.libraryDir}/${path}`, data);
    if (font) {
      instance.FS.writeFile(`${setup.fontDir}/${path.split('/').pop()}`, data);
    }
  }
  return instance;
};

/**
 * OFF text → typed arrays. Line based, because OpenSCAD appends a colour to every face
 * ("3 0 7 23 249 215 44" = triangle 0-7-23 in RGB 249/215/44; only with the Manifold kernel).
 */
const parseOff = (text) => {
  const rows = text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);
  let row = 0;
  const header = rows[row++]?.split(/\s+/);
  if (!header || !/^C?OFF$/.test(header[0])) {
    return null;
  }
  const counts = header.length > 1 ? header.slice(1) : (rows[row++] ?? '').split(/\s+/); // "OFF 8 6 0" or "OFF" + "8 6 0"
  const vertexCount = +counts[0];
  const faceCount = +counts[1];
  const positions = new Float64Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const values = rows[row++].split(/\s+/);
    positions[i * 3] = +values[0];
    positions[i * 3 + 1] = +values[1];
    positions[i * 3 + 2] = +values[2];
  }
  const faceSizes = new Int32Array(faceCount);
  const indices = [];
  const colors = new Int16Array(faceCount * 4).fill(-1); // red, green, blue, alpha; -1 = no colour
  for (let i = 0; i < faceCount; i++) {
    const values = rows[row++].split(/\s+/);
    const size = +values[0];
    faceSizes[i] = size;
    for (let k = 1; k <= size; k++) {
      indices.push(+values[k]);
    }
    if (values.length >= size + 4) {
      colors[i * 4] = +values[size + 1];
      colors[i * 4 + 1] = +values[size + 2];
      colors[i * 4 + 2] = +values[size + 3];
      colors[i * 4 + 3] = values.length > size + 4 ? +values[size + 4] : 255;
    }
  }
  return { positions, faceSizes, faceIndices: Int32Array.from(indices), colors };
};

const compile = async ({ id, code, fileName, backend }) => {
  const log = [];
  const instance = await createInstance(log);
  // the input sits in the library folder, so include/use/import() find the library files next to it
  const inputPath = `${setup.libraryDir}/${fileName}`;
  writeFile(instance.FS, inputPath, code);
  let exitCode;
  let aborted = null;
  try {
    exitCode = instance.callMain([inputPath, '-o', '/output.off', `--backend=${backend}`]);
  } catch (error) {
    exitCode = -1;
    aborted = error?.message ?? String(error);
  }
  let off = null;
  try {
    off = instance.FS.readFile('/output.off', { encoding: 'utf8' });
  } catch {
    /* no output */
  }
  const mesh = exitCode === 0 && off ? parseOff(off) : null;
  const transfer = mesh ? [mesh.positions.buffer, mesh.faceSizes.buffer, mesh.faceIndices.buffer, mesh.colors.buffer] : [];
  self.postMessage({ id, log, exitCode, aborted, hasOutput: !!off, mesh }, transfer);
};

self.addEventListener('message', async ({ data }) => {
  if (data.type === 'setup') {
    setup = data.setup;
  } else if (data.type === 'load') {
    modulePromise ??= import(data.url);
    try {
      await modulePromise;
      self.postMessage({ loaded: true });
    } catch (error) {
      self.postMessage({ loaded: false, error: error?.message ?? String(error) });
    }
  } else {
    try {
      await compile(data);
    } catch (error) {
      self.postMessage({ id: data.id, failed: error?.message ?? String(error) });
    }
  }
});
