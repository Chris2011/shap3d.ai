// Shap3D.ai example plugin: a grid of boxes.
// Shows: a command, a script extension (s3d.boxGrid) and a panel built with plain DOM.

/** @type {import('../types').S3dPlugin} */
export default {
  id: 'grid-generator',
  name: 'Würfelraster',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'Erzeugt ein Raster aus Quadern – als Befehl, als Panel und als Skriptbefehl s3d.boxGrid().',

  activate(context) {
    const settings = context.storage.get('settings', { columns: 4, rows: 3, size: 0.5, gap: 0.25 });

    // s3d.boxGrid(columns, rows, size, gap) – usable from the script editor and the AI
    context.script.extend('boxGrid', (api, columns = 4, rows = 3, size = 0.5, gap = 0.25) => {
      const edge = api.length(size), spacing = edge + api.length(gap);
      return api.group('Würfelraster', () => {
        for (let column = 0; column < columns; column++) {
          for (let row = 0; row < rows; row++) api.box([column * spacing, row * spacing, 0], edge, edge, edge);
        }
      });
    }, {
      signature: 's3d.boxGrid(spalten, reihen, kante, abstand)',
      description: 'Raster aus Quadern als eine Gruppe.',
      example: "s3d.boxGrid(5, 3, '40cm', '20cm');",
    });

    const build = ({ columns, rows, size, gap }) => {
      const result = context.script.run(`s3d.boxGrid(${columns}, ${rows}, ${size}, ${gap});`);
      context.ui.toast(result.ok ? `${columns * rows} Quader erzeugt` : `Fehler: ${result.error}`);
    };

    context.commands.register({
      id: 'create',
      label: 'Würfelraster erzeugen…',
      icon: 'grid-cubes',
      keywords: 'raster grid würfel quader array',
      run: async () => {
        const answer = await context.ui.prompt('Spalten × Reihen (z. B. 4x3)', `${settings.columns}x${settings.rows}`);
        const match = answer && /^(\d+)\s*[x×*]\s*(\d+)$/i.exec(answer.trim());
        if (!match) return;
        Object.assign(settings, { columns: +match[1], rows: +match[2] });
        context.storage.set('settings', settings);
        build(settings);
      },
    });

    context.icons.register('grid-cubes', '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" stroke-width="1.6"/>');

    context.panels.register({
      id: 'panel',
      label: 'Würfelraster',
      icon: 'grid-cubes',
      mount(element) {
        element.innerHTML = `
          <p style="margin:0 0 .5rem;font-size:.75rem;opacity:.75">Raster aus Quadern als Gruppe am Ursprung.</p>
          ${['columns:Spalten', 'rows:Reihen', 'size:Kante (m)', 'gap:Abstand (m)'].map(field => {
            const [key, label] = field.split(':');
            return `<label style="display:flex;align-items:center;gap:.5rem;margin:.375rem 0">
              <span style="flex:1">${label}</span>
              <input class="s3d-input" style="width:5rem" type="number" step="any" min="0" data-key="${key}" value="${settings[key]}">
            </label>`;
          }).join('')}
          <button class="s3d-btn" style="margin-top:.5rem">Erzeugen</button>`;
        const read = () => { for (const input of element.querySelectorAll('input')) settings[input.dataset.key] = Math.max(0, +input.value || 0); };
        element.querySelector('button').addEventListener('click', () => { read(); context.storage.set('settings', settings); build(settings); });
      },
    });
  },
};
