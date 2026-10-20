/**
 * Examples for the script editor (Load example… › OpenSCAD). Name and description are message
 * keys; the code is OpenSCAD and stays as it is in every language.
 */
export const EXAMPLES = [
  {
    id: 'difference',
    name: 'openscad.examples.difference.name',
    description: 'openscad.examples.difference.description',
    code: `// sizes in millimetres (setting in the "OpenSCAD" panel)
difference() {
  cube(40, center = true);
  sphere(r = 26, $fn = 64);
}
translate([0, 0, 20]) cylinder(h = 30, r = 4, $fn = 32);
`,
  },
  {
    id: 'vase',
    name: 'openscad.examples.vase.name',
    description: 'openscad.examples.vase.description',
    code: `$fn = 72;
wall = 2;
profile = [[0, 0], [30, 0], [36, 40], [24, 90], [28, 120], [26, 120], [22, 90], [34, 40], [28, 2], [0, 2]];

rotate_extrude() polygon(profile);
`,
  },
  {
    id: 'modules',
    name: 'openscad.examples.modules.name',
    description: 'openscad.examples.modules.description',
    code: `// parameters
width = 800; depth = 300; height = 1200;
shelves = 5; thickness = 18;

module board(l, d, t) cube([l, d, t]);

// sides
for (x = [0, width - thickness]) translate([x, 0, 0]) cube([thickness, depth, height]);
// shelves
for (i = [0 : shelves - 1])
  translate([thickness, 0, i * (height - thickness) / (shelves - 1)])
    board(width - 2 * thickness, depth, thickness);
echo("Space between shelves (mm):", (height - thickness) / (shelves - 1) - thickness);
`,
  },
  {
    id: 'hull',
    name: 'openscad.examples.hull.name',
    description: 'openscad.examples.hull.description',
    code: `$fn = 48;
r = 8;
hull() for (x = [0, 80], y = [0, 50]) translate([x, y, 0]) cylinder(h = 6, r = r);
`,
  },
];
