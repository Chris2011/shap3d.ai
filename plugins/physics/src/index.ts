// Physics for Shap3D.ai – the model's groups and components as rigid bodies, simulated with Rapier (WebAssembly).
// - bodies: dynamic (falls, bounces, slides, collides), static, kinematic (moves on its own: a lift, a turntable)
//   – material, mass, shape, start speed, forces, thrust, lift and drag as plugin data on the instance
// - joints: hinges and sliders with limits and motors (a position, a speed or a program over time – a robot arm),
//   ball joints, fixed joints, ropes and springs
// - regions: water (buoyancy, current), a liquid of drops and a wind tunnel that shows the flow around objects
// - start, pause, step, reset – the model is not changed (display.place shows the bodies where they are) until the
//   places are kept on purpose; a pull tool to drag bodies while it runs, a joint tool, a panel
// Scripts: s3d.physicsBody(), s3d.physicsJoint(), s3d.physicsSettings(), s3d.physicsStart(), s3d.physicsBodies().
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dPhysicsGuide from './S3dPhysicsGuide.vue';
import S3dPhysicsPanel from './S3dPhysicsPanel.vue';
import { BODY_FORMAT, validBodyData } from './data';
import { drawPhysics } from './drawing';
import { markSelected } from './edit';
import { GUIDE_PANEL, JOINT_TOOL_ID, MODE, PANEL, PULL_TOOL_ID } from './names';
import { loadRapier } from './rapier';
import { scriptBodies, scriptBody, scriptJoint, scriptRemove, scriptSettings, scriptStart, whenStarted } from './script';
import { currentSim, keepPositions, pauseSim, resetSim, startSim, stepSim } from './sim';
import { modelFingerprint } from './scene';
import { stopRecording } from './recorder';
import { createJointTool, createPullTool } from './tools';
import { MESSAGES, useRuntime } from './runtime';
import { learn, usePhysicsState } from './state';
import { injectStyles } from './styles';
import { DEMOS } from './demos';

/** an apple falling past a hinge – the plugin's icon */
const ICON =
  '<circle cx="9" cy="15" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 10.5c0-1.5.6-2.6 1.8-3.3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M17 3v5M15 6l2 2 2-2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 20h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';

/** the pull tool: a hand pulling on a line */
const PULL_ICON =
  '<path d="M4 20l8-8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/><rect x="12" y="4" width="8" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/>';

/** the joint tool: two links and a hinge */
const JOINT_ICON =
  '<path d="M4 19l7-7M13 11l7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="11.5" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/>';

const plugin: S3dPlugin = {
  id: 'physics',
  name: 'physics.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'physics.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());
    context.icons.register('physics', ICON);
    context.icons.register('physics-pull', PULL_ICON);
    context.icons.register('physics-joint', JOINT_ICON);

    // the format of physics bodies, so other plugins can read and write them without this one
    context.data.formats.register({ ...BODY_FORMAT, label: 'physics.plugin.name', validate: validBodyData });

    context.panels.register({
      id: PANEL,
      label: 'physics.panel.title',
      icon: 'physics',
      width: 320,
      component: S3dPhysicsPanel,
      tile: 'last',
      inMode: true,
    });
    context.panels.register({
      id: GUIDE_PANEL,
      label: 'physics.guide.title',
      icon: 'physics',
      width: 320,
      component: S3dPhysicsGuide,
      tile: 'last',
      inMode: true,
    });
    // the physics mode: the 3D view with the physics tools in the toolbar and only the panels it needs
    context.modes.register({
      id: MODE,
      label: 'physics.mode',
      icon: 'physics',
      tools: ['select', PULL_TOOL_ID, JOINT_TOOL_ID, 'move', 'rotate', 'scale', 'eraser', 'orbit', 'pan', 'tape'],
      panels: [`physics.${GUIDE_PANEL}`, `physics.${PANEL}`, 'entityinfo', 'outliner'],
      // the first time the guide, then the Physics panel
      enter: () => {
        const seen = context.storage.get('guideSeen', false);
        context.panels.open(seen ? PANEL : GUIDE_PANEL);
        context.storage.set('guideSeen', true);
      },
    });
    context.tools.register({ id: 'pull', name: 'physics.tools.pull', icon: 'physics-pull', create: (editor) => createPullTool(editor) });
    context.tools.register({
      id: 'joint',
      name: 'physics.tools.joint',
      icon: 'physics-joint',
      create: (editor) => createJointTool(editor),
    });
    context.overlay.draw((overlay) => drawPhysics(overlay));

    // a change of the model while it runs: back to the start (the bodies are built from the model) – the settings
    // are not part of it, a running simulation takes them over at once
    context.vue.watch(
      () => context.editor.ui.revision,
      () => {
        const sim = currentSim();
        if (sim && modelFingerprint() !== sim.fingerprint) {
          resetSim();
        }
      },
    );
    context.events.onNewModel(() => resetSim());
    context.onDispose(resetSim);
    context.onDispose(stopRecording);
    // scripts that use the physics functions get Rapier loaded before they run
    context.script.beforeRun(async (code) => {
      if (code.includes('physics')) {
        await loadRapier();
      }
    });

    for (const demo of DEMOS) {
      context.script.addExample({
        id: demo.id,
        name: `physics.demos.${demo.id}.name`,
        description: `physics.demos.${demo.id}.description`,
        code: demo.code,
      });
    }
    context.script.extend('physicsBody', scriptBody, {
      category: 'Plugins',
      signature:
        "s3d.physicsBody(group, { type: 'dynamic' | 'static' | 'kinematic' | 'off' | 'water' | 'liquid' | 'tunnel', material, mass, density, friction, bounce, shape, velocity, spin, period, force, thrust, lift, drag, spacing, viscosity, resolution })",
      description: 'physics.script.body',
      example: "const ball = s3d.sphere([0, 0, 3], 0.3);\ns3d.physicsBody(ball, { material: 'rubber', velocity: [2, 0, 0] });",
    });
    context.script.extend('physicsJoint', scriptJoint, {
      category: 'Plugins',
      signature:
        "s3d.physicsJoint(group, { kind: 'hinge' | 'slider' | 'ball' | 'fixed' | 'rope' | 'spring', to: group | 'world' | 'parent', at: [x, y, z], axis, toAt, length, min, max, motor: { mode, value, strength }, program: [[t, value], …], stiffness, damping })",
      description: 'physics.script.joint',
      example: "s3d.physicsJoint(door, { kind: 'hinge', to: 'world', at: [0, 0, 0], axis: [0, 0, 1], min: 0, max: 110 });",
    });
    context.script.extend('physicsSettings', scriptSettings, {
      category: 'Plugins',
      signature: 's3d.physicsSettings({ gravity, wind: [x, y, z], air, ground, speed })',
      description: 'physics.script.settings',
      example: 's3d.physicsSettings({ gravity: 1.62, air: false }); // on the moon',
    });
    context.script.extend('physicsStart', scriptStart, {
      category: 'Plugins',
      signature: 's3d.physicsStart({ at, pause })',
      description: 'physics.script.start',
      example: 's3d.physicsStart({ at: 1.5 });',
    });
    context.script.extend('physicsBodies', scriptBodies, {
      category: 'Plugins',
      signature: 's3d.physicsBodies()',
      description: 'physics.script.bodies',
      example: 's3d.physicsBodies().forEach((body) => console.log(body.name, body.type));',
    });
    context.script.extend('physicsRemove', scriptRemove, {
      category: 'Plugins',
      signature: 's3d.physicsRemove(group)',
      description: 'physics.script.remove',
      example: "s3d.physicsRemove('Crate 1');",
    });

    const keywords = 'physics simulation gravity fall bounce collision rigid body physik schwerkraft fallen'; // i18n-ignore – search words
    context.commands.register({
      id: 'start',
      label: 'physics.commands.start',
      icon: 'physics',
      keywords,
      run: async () => {
        if (usePhysicsState().status === 'running') {
          pauseSim();
        } else {
          await startSim();
        }
      },
    });
    context.commands.register({
      id: 'reset',
      label: 'physics.commands.reset',
      icon: 'physics',
      run: () => {
        resetSim();
        learn('reset');
      },
    });
    context.commands.register({
      id: 'guide',
      label: 'physics.commands.guide',
      icon: 'physics',
      keywords: 'guide tutorial help how physics anleitung hilfe physik', // i18n-ignore – search words
      run: () => {
        context.modes.open(MODE);
        context.panels.open(GUIDE_PANEL);
      },
    });
    context.commands.register({ id: 'step', label: 'physics.commands.step', icon: 'physics', run: () => stepSim() });
    context.commands.register({ id: 'keep', label: 'physics.commands.keep', icon: 'physics', run: () => keepPositions() });
    // waits for a start a script asked for, then pauses – so a screenshot shows one moment
    context.commands.register({
      id: 'pause',
      label: 'physics.commands.pause',
      icon: 'physics',
      run: async () => {
        await whenStarted();
        pauseSim();
      },
    });
    context.commands.register({
      id: 'open',
      label: 'physics.commands.open',
      icon: 'physics',
      keywords,
      run: () => {
        context.modes.open(MODE);
        context.panels.open(PANEL);
      },
    });
    context.commands.register({
      id: 'dynamic',
      label: 'physics.commands.dynamic',
      icon: 'physics',
      run: () => markSelected('dynamic'),
    });
    context.commands.register({ id: 'static', label: 'physics.commands.static', icon: 'physics', run: () => markSelected('static') });
    context.commands.register({ id: 'none', label: 'physics.commands.none', icon: 'physics', run: () => markSelected(null) });
    context.commands.register({
      id: 'pull',
      label: 'physics.commands.pull',
      icon: 'physics-pull',
      run: (editor) => editor.setTool(PULL_TOOL_ID),
    });
    context.commands.register({
      id: 'joint',
      label: 'physics.commands.joint',
      icon: 'physics-joint',
      run: (editor) => editor.setTool(JOINT_TOOL_ID),
    });
    // groups and components selected: make them bodies from the context menu
    const groupsSelected = () => [...context.editor.selection.values()].some((ref) => ref.kind === 'instance');
    context.ui.addContextMenuEntry({ label: 'physics.commands.dynamic', when: groupsSelected, run: () => markSelected('dynamic') });
    context.ui.addContextMenuEntry({ label: 'physics.commands.static', when: groupsSelected, run: () => markSelected('static') });
  },
};

export default plugin;
