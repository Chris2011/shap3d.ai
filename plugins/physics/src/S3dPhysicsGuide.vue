<template>
  <div class="s3d-ph">
    <!-- how far it is: every step ticks itself off from what the model holds and what has been tried -->
    <section class="s3d-ph-section">
      <div class="s3d-ph-heading">
        <span>{{ t('physics.guide.heading') }}</span>
        <span class="s3d-ph-time">{{ t('physics.guide.progress', { done: doneCount, count: counted }) }}</span>
      </div>
      <div class="s3d-ph-guide-bar"><div :style="{ width: `${(doneCount / counted) * 100}%` }"></div></div>
      <p class="s3d-ph-hint">{{ t('physics.guide.intro') }}</p>
    </section>

    <section class="s3d-ph-section">
      <div v-for="(step, index) in steps" :key="step.id" class="s3d-ph-guide-step" :class="{ open: index === current, done: step.done }">
        <button class="s3d-ph-guide-head" @click="current = index">
          <span class="s3d-ph-guide-mark">{{ step.done ? '✓' : index + 1 }}</span>
          <span class="s3d-ph-entry-name">{{ t(`physics.guide.steps.${step.id}.title`) }}</span>
        </button>
        <div v-if="index === current" class="s3d-ph-guide-body">
          <p class="s3d-ph-hint s3d-ph-guide-text">{{ t(`physics.guide.steps.${step.id}.text`) }}</p>
          <ul v-if="step.checks" class="s3d-ph-guide-checks">
            <li v-for="check in step.checks" :key="check.label" :class="{ done: check.done }">
              {{ check.done ? '✓' : '○' }} {{ t(check.label) }}
            </li>
          </ul>
          <div class="s3d-ph-row">
            <button
              v-for="(action, at) in step.actions"
              :key="action.label"
              class="s3d-btn"
              :class="{ primary: at === 0 && !step.done }"
              :disabled="action.disabled"
              @click="action.run()"
            >
              {{ t(action.label) }}
            </button>
          </div>
          <p v-if="step.done" class="s3d-ph-hint s3d-ph-guide-done">✓ {{ t(`physics.guide.steps.${step.id}.done`) }}</p>
          <div class="s3d-ph-row s3d-ph-guide-nav">
            <button class="s3d-btn" :disabled="index === 0" @click="current = index - 1">{{ t('physics.guide.back') }}</button>
            <button class="s3d-btn" :disabled="index === steps.length - 1" @click="current = index + 1">
              {{ t('physics.guide.next') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { isRegion } from './data';
import { DEMOS } from './demos';
import { markSelected, selectedInstances } from './edit';
import { GUIDE_PANEL, JOINT_TOOL_ID, MODE, PANEL, PULL_TOOL_ID } from './names';
import { physicsInstances } from './scene';
import { keepPositions, pauseSim, resetSim, startSim, stepSim } from './sim';
import { setJointKind } from './tools';
import { pluginContext, t } from './runtime';
import { learn, usePhysicsState } from './state';

/**
 * A guide through the plugin, step by step: something to try it on, bodies, start and the controls, pulling, a
 * hinge, a motor, keeping the places, and the demos. Each step says what to do and where, has buttons that do it
 * (or take the tool for it) and ticks itself off once it has been done.
 */

const context = pluginContext();
const editor = context.editor;
const state = usePhysicsState();
const current = ref(0);

// the model is not reactive – the editor bumps these after changes and selections
const bodies = computed(() => {
  void editor.ui.revision;
  void editor.ui.selRev;
  void state.revision;
  return physicsInstances().filter((entry) => !isRegion(entry.data.type));
});

/** into the physics mode – the guide stays open */
const toMode = () => {
  if (context.modes.active() !== `physics.${MODE}`) {
    context.modes.open(MODE);
  }
  context.panels.open(GUIDE_PANEL);
};
const tool = (id: string) => {
  toMode();
  editor.setTool(id);
};

/** a few plain groups to try it on: three crates, a ball above them and a standing board for a door */
const buildPractice = () => {
  resetSim();
  const name = (key: string) => JSON.stringify(t(`physics.guide.practice.${key}`));
  context.script.run(`s3d.clear();
s3d.material('Crate', '#c08a4a'); // i18n-ignore – material names
s3d.material('Ball', '#d6336c'); // i18n-ignore – material names
s3d.material('Door', '#8d6e63'); // i18n-ignore – material names
for (let index = 0; index < 3; index++) {
  s3d.box([index * 0.2 - 0.2, 0, index * 0.5], 0.5, 0.5, 0.5, { name: ${name('crate')} + ' ' + (index + 1), material: 'Crate' });
}
s3d.sphere([0.3, 0.25, 2.5], 0.25, { name: ${name('ball')}, material: 'Ball', segments: 16 });
s3d.box([1.5, 0, 0.05], 0.05, 1, 2, { name: ${name('door')}, material: 'Door' });
s3d.camera([3.2, -6.5, 3.8], [1.6, 0.3, 0.9]);`);
  editor.select([], 'set');
  state.revision++;
};

/** every group at the top selected */
const selectAll = () => {
  editor.setTool('select');
  editor.select(
    [...editor.model.root.instances.values()].map((instance) => ({ kind: 'instance' as const, id: instance.id })),
    'set',
  );
};

/** the first body with a joint selected, the Physics panel open – its joints are listed there */
const editJoint = () => {
  const body = bodies.value.find((entry) => entry.data.joints?.length);
  toMode();
  editor.setTool('select');
  if (body) {
    editor.select([{ kind: 'instance', id: body.instance.id }], 'set');
  }
  context.panels.open(PANEL);
};

const openDemo = (id: string) => {
  const demo = DEMOS.find((entry) => entry.id === id);
  if (demo) {
    context.script.openInEditor('js', demo.code);
  }
};

interface Step {
  id: string;
  /** undefined: a step to read, not to tick off */
  done?: boolean;
  checks?: { label: string; done: boolean }[];
  actions: { label: string; run: () => void; disabled?: boolean }[];
}

const steps = computed((): Step[] => {
  const learned = state.learned;
  const running = state.status !== 'stopped';
  // the scale figure of a new model does not count
  const groups =
    (void editor.ui.revision, [...editor.model.root.instances.values()].filter((instance) => !instance.definition.faceMe).length);
  const joints = bodies.value.flatMap((entry) => entry.data.joints ?? []);
  return [
    {
      id: 'practice',
      done: groups > 0,
      actions: [{ label: 'physics.guide.actions.practice', run: buildPractice }],
    },
    {
      id: 'bodies',
      done: bodies.value.some((entry) => entry.data.type === 'dynamic'),
      checks: [{ label: 'physics.guide.checks.selected', done: (void editor.ui.selRev, selectedInstances().length > 0) }],
      actions: [
        { label: 'physics.guide.actions.selectAll', run: selectAll },
        { label: 'physics.guide.actions.dynamic', run: () => markSelected('dynamic') },
      ],
    },
    {
      id: 'start',
      done: learned.started,
      actions: [{ label: 'physics.panel.start', run: () => void startSim() }],
    },
    {
      id: 'controls',
      done: learned.stepped && learned.reset,
      checks: [
        { label: 'physics.guide.checks.stepped', done: learned.stepped },
        { label: 'physics.guide.checks.reset', done: learned.reset },
      ],
      actions: [
        { label: 'physics.panel.pause', run: pauseSim, disabled: state.status !== 'running' },
        { label: 'physics.panel.step', run: () => void stepSim() },
        {
          label: 'physics.panel.reset',
          run: () => {
            resetSim();
            learn('reset');
          },
          disabled: !running,
        },
      ],
    },
    {
      id: 'pull',
      done: learned.pulled,
      actions: [{ label: 'physics.tools.pull', run: () => tool(PULL_TOOL_ID) }],
    },
    {
      id: 'joint',
      done: joints.length > 0,
      actions: [
        {
          label: 'physics.guide.actions.hinge',
          run: () => {
            setJointKind('hinge', true);
            tool(JOINT_TOOL_ID);
          },
        },
      ],
    },
    {
      id: 'motor',
      done: joints.some((joint) => joint.motor || joint.program?.length),
      actions: [{ label: 'physics.guide.actions.editJoint', run: editJoint, disabled: !joints.length }],
    },
    {
      id: 'keep',
      done: learned.kept,
      actions: [
        { label: 'physics.panel.start', run: () => void startSim(), disabled: state.status === 'running' },
        { label: 'physics.panel.keep', run: keepPositions, disabled: !running },
      ],
    },
    {
      id: 'more',
      actions: ['robot', 'crane', 'tunnel', 'water'].map((id) => ({ label: `physics.demos.${id}.name`, run: () => openDemo(id) })),
    },
  ];
});

const counted = computed(() => steps.value.filter((step) => step.done !== undefined).length);
const doneCount = computed(() => steps.value.filter((step) => step.done).length);
</script>
