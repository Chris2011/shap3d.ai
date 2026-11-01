// Animation for Shap3D.ai – keyframes over time, like Blender's, for making films of the model.
// - keys on groups and components (place, turn, scale, visibility, colour, opacity), material colours, cameras
//   (position, target, lens), the sun and lights; the I key and auto-keying
// - a timeline under the 3D view: playing, scrubbing, frame rate and range, a dope sheet and a graph editor with
//   constant, linear, Bézier and eased curves and handles to drag
// - paths (a group follows another group's edges), look-at, parents through the group hierarchy, cameras with shots
// - rendering at a fixed frame rate as a video (MediaRecorder) or a PNG sequence – the model is not changed
// Scripts: s3d.animate(), s3d.animateKeys(), s3d.animatePath(), s3d.animateLookAt(), s3d.animateCamera(), …
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dAnimGuide from './S3dAnimGuide.vue';
import S3dAnimPanel from './S3dAnimPanel.vue';
import S3dAnimRendering from './S3dAnimRendering.vue';
import S3dAnimTimeline from './S3dAnimTimeline.vue';
import { OBJECT_FORMAT, SCENE_FORMAT, validObjectAnimation, validSceneAnimation } from './data';
import { DEMOS } from './demos';
import { drawAnimation } from './drawing';
import { addCamera, keyCamera, keySelected, selectedInstances } from './keying';
import { GUIDE_PANEL, MODE, PANEL } from './names';
import { connect, jumpTo, setFrame, setLookThrough, togglePlay } from './player';
import { applyRecipe } from './recipes';
import { cancelRender, renderAnimation } from './render';
import { MESSAGES, useRuntime } from './runtime';
import {
  onScriptRequest,
  scriptAnimate,
  scriptCamera,
  scriptClear,
  scriptKeys,
  scriptLight,
  scriptLookAt,
  scriptMaterial,
  scriptPath,
  scriptPlay,
  scriptRender,
  scriptScene,
  scriptShot,
  scriptSun,
  takeScriptRequest,
} from './script';
import { useAnimationState } from './state';
import { injectStyles } from './styles';

/** a film strip with a diamond – the plugin's icon */
const ICON =
  '<rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M3 15h18M7 5v4M11 5v4M15 5v4M7 15v4M11 15v4M15 15v4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M12 9.6l2.4 2.4-2.4 2.4-2.4-2.4z" fill="currentColor"/>';

/** is the user typing into a field (the I key is a letter then)? */
const typing = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement | null;
  return (
    !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
  );
};

const plugin: S3dPlugin = {
  id: 'animation',
  name: 'animation.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'animation.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    const state = useAnimationState();
    context.onDispose(injectStyles());
    context.icons.register('animation', ICON);

    // the formats of the animation, so other plugins can read and write it without this one
    context.data.formats.register({ ...OBJECT_FORMAT, label: 'animation.plugin.name', validate: validObjectAnimation });
    context.data.formats.register({ ...SCENE_FORMAT, label: 'animation.plugin.name', validate: validSceneAnimation });

    context.panels.register({
      id: PANEL,
      label: 'animation.panel.title',
      icon: 'animation',
      width: 320,
      component: S3dAnimPanel,
      tile: 'last',
    });
    context.panels.register({
      id: GUIDE_PANEL,
      label: 'animation.guide.title',
      icon: 'animation',
      width: 320,
      component: S3dAnimGuide,
      tile: 'last',
    });
    context.ui.addWindow(S3dAnimTimeline);
    context.ui.addWindow(S3dAnimRendering);

    // the animation mode: the 3D view with the timeline, the tools that move things and only the panels it needs
    context.modes.register({
      id: MODE,
      label: 'animation.mode',
      icon: 'animation',
      tools: ['select', 'move', 'rotate', 'scale', 'line', 'arc2', 'eraser', 'orbit', 'pan', 'zoom', 'tape'],
      panels: [`animation.${GUIDE_PANEL}`, `animation.${PANEL}`, 'entityinfo', 'outliner'],
      // the first time the guide, then the Animation panel
      enter: () => {
        state.timeline = true;
        const seen = context.storage.get('guideSeen', false);
        context.panels.open(seen ? PANEL : GUIDE_PANEL);
        context.storage.set('guideSeen', true);
      },
      leave: () => {
        state.timeline = false;
      },
    });
    context.overlay.draw((overlay) => drawAnimation(overlay));
    context.onDispose(connect());
    context.onDispose(cancelRender);

    // I keys the selected groups – or the camera when nothing is selected (only while something is animated or in the mode)
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || typing(event) || context.editor.ui.dialog || context.workspaces.active()) {
        return;
      }
      if (event.key.toLowerCase() !== 'i' || event.shiftKey) {
        return;
      }
      if (context.editor.tool.busy()) {
        return;
      }
      event.preventDefault();
      if (!keySelected()) {
        keyCamera();
      }
    };
    window.addEventListener('keydown', onKey);
    context.onDispose(() => window.removeEventListener('keydown', onKey));

    // what a script asked for once it is done: a frame, playing, the camera, a render
    onScriptRequest(() => {
      const request = takeScriptRequest();
      if (request.frame !== undefined) {
        setFrame(request.frame, { camera: request.lookThrough ?? state.lookThrough });
      }
      if (request.lookThrough !== undefined) {
        setLookThrough(request.lookThrough);
      }
      if (request.play) {
        togglePlay();
      }
      if (request.render) {
        const editor = context.editor;
        void renderAnimation({
          kind: request.render,
          width: request.width ?? editor.viewer.width,
          height: request.height ?? editor.viewer.height,
          overlay: true,
        });
      }
    });

    for (const demo of DEMOS) {
      context.script.addExample({
        id: demo.id,
        name: `animation.demos.${demo.id}.name`,
        description: `animation.demos.${demo.id}.description`,
        code: demo.code,
      });
    }
    const extend = (name: string, implementation: Parameters<typeof context.script.extend>[1], signature: string, example: string) =>
      context.script.extend(name, implementation, {
        category: 'Plugins',
        signature,
        description: `animation.script.${name}`,
        example,
      });
    extend(
      'animate',
      scriptAnimate,
      's3d.animate(group, { frame, at: [x, y, z], rotate: [rx, ry, rz], scale, visible, color, opacity, interp, here, pivot })',
      'const box = s3d.box([0, 0, 0], 1, 1, 1);\ns3d.animate(box, { frame: 1, at: [0.5, 0.5, 0.5] });\ns3d.animate(box, { frame: 48, at: [4, 0.5, 0.5], rotate: [0, 0, 180] });',
    );
    extend(
      'animateKeys',
      scriptKeys,
      "s3d.animateKeys(group | 'sun' | { camera } | { light } | { material }, channel, [[frame, value, interp?], …], { interp, cycle })",
      "s3d.animateKeys(wheel, 'ry', [[1, 0], [25, 360]], { interp: 'linear', cycle: true });",
    );
    extend(
      'animatePath',
      scriptPath,
      "s3d.animatePath(group, pathGroup, { from, to, follow, axis: '+x' | '-x' | '+y' | '-y', interp })",
      "const road = s3d.group('Road', () => s3d.polyline([[0, 0, 0], [5, 2, 0], [10, 0, 0]]));\ns3d.animatePath(car, road, { from: 1, to: 96 });",
    );
    extend(
      'animateLookAt',
      scriptLookAt,
      's3d.animateLookAt(group, target | null, { axis })',
      "s3d.animateLookAt(head, ball, { axis: '-y' });",
    );
    extend(
      'animateCamera',
      scriptCamera,
      's3d.animateCamera({ name, frame, position, target, lens, lookAt, path, follow, interp })',
      "s3d.animateCamera({ name: 'Wide', frame: 1, position: [-8, -8, 5], target: [0, 0, 1], lens: 35 });",
    );
    extend('animateShot', scriptShot, 's3d.animateShot({ frame, camera, name })', "s3d.animateShot({ frame: 49, camera: 'Close-up' });");
    extend(
      'animateSun',
      scriptSun,
      's3d.animateSun({ frame, hour, daylight, interp })',
      's3d.animateSun({ frame: 1, hour: 7 });\ns3d.animateSun({ frame: 120, hour: 19 });',
    );
    extend(
      'animateLight',
      scriptLight,
      "s3d.animateLight({ name, kind: 'point' | 'spot', frame, position, target, intensity, color, range, angle, shadow })",
      "s3d.animateLight({ name: 'Lamp', frame: 1, position: [0, 0, 3], intensity: 0 });\ns3d.animateLight({ name: 'Lamp', frame: 24, intensity: 2 });",
    );
    extend(
      'animateMaterial',
      scriptMaterial,
      's3d.animateMaterial(name, { frame, color, opacity, interp })',
      "s3d.animateMaterial('Glas', { frame: 1, opacity: 0.1 });\ns3d.animateMaterial('Glas', { frame: 48, opacity: 0.8 });",
    );
    extend('animateScene', scriptScene, 's3d.animateScene({ fps, start, end })', 's3d.animateScene({ fps: 30, start: 1, end: 150 });');
    extend(
      'animatePlay',
      scriptPlay,
      's3d.animatePlay({ frame, play, lookThrough })',
      's3d.animatePlay({ frame: 1, play: true, lookThrough: true });',
    );
    extend(
      'animateRender',
      scriptRender,
      "s3d.animateRender({ kind: 'video' | 'png', width, height })",
      "s3d.animateRender({ kind: 'video', width: 1280, height: 720 });",
    );
    extend('animateClear', scriptClear, 's3d.animateClear(group?)', 's3d.animateClear();');

    const keywords = 'animation keyframe timeline film video movie camera blender animieren schlüsselbild zeitleiste'; // i18n-ignore – search words
    context.commands.register({
      id: 'play',
      label: 'animation.commands.play',
      icon: 'animation',
      keywords,
      run: () => togglePlay(),
    });
    context.commands.register({ id: 'start', label: 'animation.commands.start', icon: 'animation', run: () => jumpTo('start') });
    context.commands.register({
      id: 'timeline',
      label: 'animation.commands.timeline',
      icon: 'animation',
      keywords,
      checked: () => state.timeline,
      run: () => {
        state.timeline = !state.timeline;
      },
    });
    context.commands.register({
      id: 'open',
      label: 'animation.commands.open',
      icon: 'animation',
      keywords,
      run: () => context.panels.open(PANEL),
    });
    context.commands.register({
      id: 'guide',
      label: 'animation.commands.guide',
      icon: 'animation',
      keywords: 'guide tutorial help how animation anleitung hilfe', // i18n-ignore – search words
      run: () => context.panels.open(GUIDE_PANEL),
    });
    context.commands.register({
      id: 'key',
      label: 'animation.commands.key',
      icon: 'animation',
      shortcut: 'I',
      run: () => {
        if (!keySelected()) {
          keyCamera();
        }
      },
    });
    context.commands.register({
      id: 'autokey',
      label: 'animation.commands.autoKey',
      icon: 'animation',
      checked: () => state.autoKey,
      run: () => {
        state.autoKey = !state.autoKey;
      },
    });
    context.commands.register({ id: 'camera', label: 'animation.commands.camera', icon: 'animation', run: () => void addCamera() });
    context.commands.register({
      id: 'look',
      label: 'animation.commands.lookThrough',
      icon: 'animation',
      checked: () => state.lookThrough,
      run: () => setLookThrough(!state.lookThrough),
    });
    context.commands.register({
      id: 'render',
      label: 'animation.commands.render',
      icon: 'animation',
      keywords,
      run: () => void renderAnimation({ kind: 'video', width: 1280, height: 720, overlay: true }),
    });
    // shows the frame a screenshot asked for, the timeline and the panel – for the README pictures
    context.commands.register({
      id: 'shot',
      label: 'animation.commands.shot',
      icon: 'animation',
      run: () => {
        state.timeline = true;
        context.panels.open(PANEL);
        // a camera the script looks through wins over the screenshot's own
        setFrame(state.frame, { camera: state.lookThrough });
      },
    });

    // groups selected: key them or give them a ready-made movement from the context menu
    const groupsSelected = () => selectedInstances().length > 0;
    context.ui.addContextMenuEntry({ label: 'animation.commands.key', when: groupsSelected, run: () => void keySelected() });
    context.ui.addContextMenuEntry({
      label: 'animation.recipes.spin.name',
      when: groupsSelected,
      run: () => applyRecipe('spin', selectedInstances()),
    });
  },
};

export default plugin;
