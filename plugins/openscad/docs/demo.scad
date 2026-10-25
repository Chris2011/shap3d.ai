// OpenSCAD direkt in Shap3D.ai – Maße in Millimetern
$fn = 96;

// das OpenSCAD-Logo: Kugel minus drei Zylinder
color("Gold") difference() {
  sphere(r = 50);
  for (axis = [[0, 0, 0], [90, 0, 0], [0, 90, 0]])
    rotate(axis) cylinder(h = 120, r = 27, center = true);
}

// ein Sockel mit abgerundeten Ecken
color("SteelBlue") translate([0, 0, -62])
  hull() for (x = [-45, 45], y = [-45, 45])
    translate([x, y, 0]) cylinder(h = 10, r = 10);
