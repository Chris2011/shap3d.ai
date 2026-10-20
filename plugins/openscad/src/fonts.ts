/** the file library is written here in every instance; it is also OpenSCAD's library path (OPENSCADPATH) */
export const LIBRARY_DIR = '/library';
/** fonts for text(): the bundled Liberation fonts and the library's .ttf/.otf files */
export const FONT_DIR = '/fonts';

/**
 * Fontconfig setup: the bundled TypoPRO build of the Liberation fonts is called "TypoPRO Liberation …";
 * OpenSCAD's default font and most scripts ask for "Liberation Sans" – aliases map the names.
 */
export const FONTS_CONF = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>/tmp/fontconfig</cachedir>
${['Sans', 'Serif', 'Mono'].map((kind) => `  <alias binding="same"><family>Liberation ${kind}</family><prefer><family>TypoPRO Liberation ${kind}</family></prefer></alias>`).join('\n')}
  <alias><family>sans-serif</family><prefer><family>TypoPRO Liberation Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>TypoPRO Liberation Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>TypoPRO Liberation Mono</family></prefer></alias>
</fontconfig>
`;

export const isFont = (path: string) => /\.(ttf|otf)$/i.test(path);
export const isScad = (path: string) => /\.scad$/i.test(path);
