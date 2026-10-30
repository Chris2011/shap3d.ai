// Demo for the facade screenshot (npm run screenshots): three town houses – boxes whose walls get windows, frames,
// sills, shutters, balconies and shops on the ground floor (s3d.facade on a group).
s3d.clear();
s3d.editor.model.name = 'Facades';
s3d.material('Putz gelb', '#e3cf9a');
s3d.material('Putz weiß', '#ece8df');
s3d.material('Klinker', '#a65f45');
s3d.material('Pflaster', '#9a9890');
s3d.rect([-4, -8, 0], 40, 22).reverse().material('Pflaster');

const corner = s3d.box([0, 0, 0], 10, 10, 13.2, { material: 'Putz gelb' });
s3d.facade({ on: corner, shutters: 0.6, balconies: 0, lit: 0.15, seed: 2 });

const middle = s3d.box([11, 0, 0], 9, 10, 16.2, { material: 'Klinker' });
s3d.facade({ on: middle, windowWidth: 1.4, spacing: 1, balconies: 0.6, shutters: 0, lit: 0.3, seed: 5 });

const modern = s3d.box([21, 0, 0], 11, 10, 19.8, { material: 'Putz weiß' });
s3d.facade({ on: modern, floorHeight: 3.2, windowWidth: 2.4, windowHeight: 2, spacing: 0.6, sill: 0.4, balconies: 0.35, shutters: 0, gaps: 0, lit: 0.2, seed: 9 });

// the panel shows the walls of the selected group as the target
s3d.editor.select([{ kind: 'instance', id: modern.inst.id }]);
