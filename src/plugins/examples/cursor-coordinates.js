// Shap3D.ai example plugin: cursor coordinates and guide points.
// Shows: an overlay drawing, a toggle command, a custom tool with shortcut and own icon, events.

/** @type {import('../types').S3dPlugin} */
export default {
  id: 'cursor-coordinates',
  name: 'Koordinaten & Hilfspunkte',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'Zeigt unten links die Koordinaten des eingerasteten Punkts und bringt das Werkzeug „Hilfspunkt“ (Taste J) mit.',

  activate(context) {
    const { editor } = context;
    let visible = context.storage.get('visible', true);

    // coordinates of the point the current tool snaps to
    context.overlay.draw(overlay => {
      const point = visible && editor.mouse.inside ? editor.tool.inference?.point : null;
      if (!point) return;
      const text = `X ${editor.fmt(point.x)}   Y ${editor.fmt(point.y)}   Z ${editor.fmt(point.z)}`;
      const ctx = overlay.context;
      ctx.font = '600 12px system-ui, sans-serif';
      const width = ctx.measureText(text).width + 16;
      ctx.fillStyle = 'rgba(20, 28, 38, 0.82)';
      ctx.fillRect(12, overlay.viewer.height - 40, width, 24);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 20, overlay.viewer.height - 28);
    });

    context.commands.register({
      id: 'toggle',
      label: 'Cursor-Koordinaten anzeigen',
      group: 'Ansicht',
      keywords: 'koordinaten position xyz cursor',
      checked: () => visible,
      run: () => { visible = !visible; context.storage.set('visible', visible); editor.redraw(); },
    });

    context.icons.register('guide-point', '<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="2.6" fill="#d0312d"/>');

    // a tool: click to drop a guide point (one undo step per point)
    class GuidePointTool extends context.classes.PointTool {
      id = 'guide-point';
      name = 'Hilfspunkt';
      cursor = 'crosshair';
      status() { return 'Klicken, um einen Hilfspunkt zu setzen (rastet an Punkten, Kanten und Flächen ein).'; }
      onMove(pointer) { this.pick(pointer, null); }
      onDown(pointer) {
        const point = this.pick(pointer, null).point.clone();
        editor.commit('Hilfspunkt', () => editor.model.guides.push({ id: context.newId(), kind: 'point', point }));
        editor.toast(`Hilfspunkt bei ${editor.fmt(point.x)}; ${editor.fmt(point.y)}; ${editor.fmt(point.z)}`);
      }
      draw(overlay) { this.drawInference(overlay); }
    }
    context.tools.register({ id: 'guide-point', name: 'Hilfspunkt', icon: 'guide-point', key: 'j', create: target => new GuidePointTool(target) });

    context.events.onNewModel(() => context.ui.toast('Neues Modell – Hilfspunkte setzen mit Taste J'));
  },
};
