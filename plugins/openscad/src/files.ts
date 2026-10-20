import type { CodeGroup, CodeScene, PluginContext } from '../../../src/plugins/types';
import type { Entities } from '../../../src/core/model';
import type { Engine } from './engine';
import { t } from './i18n';
import type { ConsoleLine } from './off';
import { addToModel } from './scripting';
import { scaleOf, unitLabel, type Settings } from './settings';

/** "“name” imported – 120 facets, 2 warnings" */
const resultToast = (kind: 'imported' | 'opened', name: string, facets: number, lines: ConsoleLine[]) => {
  const warnings = lines.filter((line) => line.kind !== 'log').length;
  return warnings
    ? t(`openscad.toast.${kind}Warnings`, { name, facets, count: warnings })
    : t(`openscad.toast.${kind}`, { name, count: facets });
};

/** .scad and font files in, the model as .scad out, and "Open as code ▸ OpenSCAD" / "Convert to…" */
export const registerFiles = (context: PluginContext, engine: Engine, settings: Settings) => {
  const { editor } = context;

  context.files.registerImporter({
    extensions: ['scad'],
    label: 'OpenSCAD',
    import: async (file) => {
      const { mesh, lines } = engine.compile(await engine.instanceAsync(), await file.text(), file.name);
      addToModel(context, settings, mesh, file.name.replace(/\.scad$/i, ''));
      editor.zoomExtents();
      context.ui.toast(resultToast('imported', file.name, mesh.faces.length, lines));
    },
  });

  context.files.registerImporter({
    extensions: ['ttf', 'otf'],
    label: 'openscad.fontImporter',
    import: async (file) => {
      await engine.addToLibrary([file]);
      context.ui.toast(t('openscad.toast.fontAdded', { name: file.name }));
    },
  });

  context.files.registerExporter({
    id: 'scad',
    label: 'OpenSCAD (.scad)',
    mimeType: 'text/plain;charset=utf-8',
    fileName: (target) => `${target.model.name || t('openscad.export.untitled')}.scad`,
    export: (target) => {
      const { THREE } = context;
      const scale = scaleOf(settings);
      const points: number[][] = [];
      const pointIndex = new Map<string, number>();
      const faces: number[][] = [];
      const indexOf = (point: InstanceType<typeof THREE.Vector3>) => {
        const coordinates = [point.x, point.y, point.z].map((value) => +(value / scale).toFixed(4));
        const key = coordinates.join(',');
        if (!pointIndex.has(key)) {
          pointIndex.set(key, points.length);
          points.push(coordinates);
        }
        return pointIndex.get(key)!;
      };
      const walk = (entities: Entities, matrix: InstanceType<typeof THREE.Matrix4>) => {
        for (const face of entities.faces.values()) {
          if (face.hidden) {
            continue;
          }
          const ids = [...face.outer, ...face.holes.flat()];
          const triangles = entities.faceTriangles(face);
          for (let i = 0; i < triangles.length; i += 3) {
            const corners = [0, 1, 2].map((k) =>
              indexOf(
                entities
                  .positionOf(ids[triangles[i + k]])
                  .clone()
                  .applyMatrix4(matrix),
              ),
            );
            if (new Set(corners).size === 3) {
              faces.push(corners.reverse());
            } // OpenSCAD wants clockwise seen from outside
          }
        }
        for (const instance of entities.instances.values()) {
          if (!instance.hidden) {
            walk(instance.definition.entities, matrix.clone().multiply(instance.matrix));
          }
        }
      };
      walk(target.model.root, new THREE.Matrix4());
      if (!faces.length) {
        throw new Error(t('openscad.errors.noFaces'));
      }
      const header = t('openscad.export.header', {
        name: target.model.name || t('openscad.export.untitled'),
        unit: unitLabel(settings.unit),
      });
      return (
        `// ${header}\n` +
        `polyhedron(\n  points = [\n    ${points.map((point) => `[${point.join(', ')}]`).join(',\n    ')}\n  ],\n` +
        `  faces = [\n    ${faces.map((face) => `[${face.join(', ')}]`).join(',\n    ')}\n  ]\n);\n`
      );
    },
  });

  /** '#d8b07a' + opacity → OpenSCAD's color([r, g, b, a]) */
  const scadColor = ({ color, opacity }: { color: string; opacity: number }) => {
    const hex = new context.THREE.Color(color).getHex(); // sRGB, as written in the material
    const channels = [hex >> 16, (hex >> 8) & 255, hex & 255].map((channel) => +(channel / 255).toFixed(3));
    return `[${channels.join(', ')}${opacity < 1 ? `, ${opacity}` : ''}]`;
  };

  context.code.registerFormat({
    id: 'openscad',
    label: 'OpenSCAD',
    generate: (scene: CodeScene) => {
      const scale = scaleOf(settings);
      const out = [`// ${t('openscad.code.header', { source: t(scene.title), unit: unitLabel(settings.unit) })}`];
      let skippedLines = 0;
      const write = (group: CodeGroup, inherited: string | undefined, indent: string) => {
        // one polyhedron per material – OpenSCAD colours whole objects, not single faces
        const buckets = new Map<string | undefined, CodeGroup['faces']>();
        for (const face of group.faces) {
          const material = face.material ?? group.material ?? inherited;
          if (!buckets.has(material)) {
            buckets.set(material, []);
          }
          buckets.get(material)!.push(face);
        }
        for (const [material, faces] of buckets) {
          const points: number[][] = [];
          const pointIndex = new Map<number, number>();
          const indexOf = (index: number) => {
            if (!pointIndex.has(index)) {
              pointIndex.set(index, points.length);
              points.push(group.points[index].map((value) => +(value / scale).toFixed(4)));
            }
            return pointIndex.get(index)!;
          };
          // OpenSCAD wants the corners clockwise seen from outside; faces with holes go in as triangles
          const polygons = faces.flatMap((face) =>
            (face.holes.length ? face.triangles : [face.outer]).map((polygon) => polygon.map(indexOf).reverse()),
          );
          const color = material && scene.materials[material] ? `color(${scadColor(scene.materials[material])}) ` : '';
          if (material) {
            out.push(`${indent}// ${t('openscad.code.material', { name: material })}`);
          }
          out.push(`${indent}${color}polyhedron(`, `${indent}  points = [`);
          for (let i = 0; i < points.length; i += 4) {
            const row = points.slice(i, i + 4).map((point) => `[${point.join(', ')}]`);
            out.push(`${indent}    ${row.join(', ')}${i + 4 < points.length ? ',' : ''}`);
          }
          out.push(`${indent}  ],`, `${indent}  faces = [`);
          for (let i = 0; i < polygons.length; i += 6) {
            const row = polygons.slice(i, i + 6).map((polygon) => `[${polygon.join(', ')}]`);
            out.push(`${indent}    ${row.join(', ')}${i + 6 < polygons.length ? ',' : ''}`);
          }
          out.push(`${indent}  ]`, `${indent});`);
        }
        skippedLines += group.lines.length;
        for (const child of group.children) {
          out.push('', `${indent}// ${t('openscad.code.group', { name: child.name })}`, `${indent}union() {`);
          write(child, child.material ?? group.material ?? inherited, indent + '  ');
          out.push(`${indent}}`);
        }
      };
      write(scene.root, undefined, '');
      if (skippedLines) {
        out.push('', `// ${t('openscad.code.skippedEdges', { count: skippedLines })}`);
      }
      return out.join('\n') + '\n';
    },
    evaluate: async (code, sandbox) => {
      const { mesh } = engine.compile(await engine.instanceAsync(), code);
      for (const [name, material] of Object.entries(mesh.materials)) {
        if (!sandbox.model.materials.some((existing) => existing.name === name)) {
          sandbox.model.materials.push({ name, color: material.color, opacity: material.opacity ?? 1 });
        }
      }
      context.meshes.build(sandbox.entities, mesh, { scale: scaleOf(settings), smooth: 25 });
    },
  });

  /** opens a .scad file from the library as a model (relative include/use/import from its folder work) */
  const openFromLibrary = async (path: string) => {
    try {
      const code = new TextDecoder().decode(engine.library.get(path));
      const { mesh, lines } = engine.compile(await engine.instanceAsync(), code, path);
      addToModel(
        context,
        settings,
        mesh,
        path
          .split('/')
          .pop()!
          .replace(/\.scad$/i, ''),
      );
      editor.zoomExtents();
      context.ui.toast(resultToast('opened', path, mesh.faces.length, lines));
    } catch (error) {
      context.ui.toast(t('openscad.toast.failed', { name: path, error: (error as Error)?.message ?? error }));
    }
  };
  return { openFromLibrary };
};
