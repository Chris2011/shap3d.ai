<template>
  <div class="s3d-an">
    <!-- how far it is: every step ticks itself off from what the model holds and what has been tried -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.guide.heading') }}</span>
        <span class="s3d-an-hint">{{ t('animation.guide.progress', { done: doneCount, count: counted }) }}</span>
      </div>
      <div class="s3d-an-progress"><div :style="{ width: `${(doneCount / counted) * 100}%` }"></div></div>
      <p class="s3d-an-hint">{{ t('animation.guide.intro') }}</p>
    </section>

    <section class="s3d-an-section">
      <div v-for="(step, index) in steps" :key="step.id" class="s3d-an-guide-step" :class="{ open: index === current, done: step.done }">
        <button class="s3d-an-guide-head" @click="current = index">
          <span class="s3d-an-guide-mark">{{ step.done ? '✓' : step.done === undefined ? '+' : index + 1 }}</span>
          <span class="s3d-an-entry-name">{{ t(`animation.guide.steps.${step.id}.title`) }}</span>
        </button>
        <div v-if="index === current" class="s3d-an-guide-body">
          <p class="s3d-an-hint s3d-an-guide-text">{{ t(`animation.guide.steps.${step.id}.text`) }}</p>
          <ul v-if="step.checks" class="s3d-an-guide-checks">
            <li v-for="check in step.checks" :key="check.label" :class="{ done: check.done }">
              {{ check.done ? '✓' : '○' }} {{ t(check.label) }}
            </li>
          </ul>
          <div class="s3d-an-row">
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
          <p v-if="step.done" class="s3d-an-hint s3d-an-guide-done">✓ {{ t(`animation.guide.steps.${step.id}.done`) }}</p>
          <div class="s3d-an-row between">
            <button class="s3d-btn" :disabled="index === 0" @click="current = index - 1">{{ t('animation.guide.back') }}</button>
            <button class="s3d-btn" :disabled="index === steps.length - 1" @click="current = index + 1">
              {{ t('animation.guide.next') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { currentScene } from './apply';
import { DEMOS } from './demos';
import { addCamera, keySelected, selectedInstances } from './keying';
import { GUIDE_PANEL, MODE, PANEL } from './names';
import { jumpTo, play, setFrame, setLookThrough } from './player';
import { pluginContext, t } from './runtime';
import { animatedNodes } from './scene';
import { useAnimationState } from './state';

/**
 * A guide through the plugin, step by step: something to try it on, a first key, a second one somewhere else,
 * playing, smoothing it in the graph editor, a camera, the film, and the demos. Each step says what to do and where,
 * has buttons that do it and ticks itself off once it has been done.
 */

const context = pluginContext();
const editor = context.editor;
const state = useAnimationState();
const current = ref(0);

const tick = () => {
  void editor.ui.revision;
  void editor.ui.selRev;
  void state.revision;
};

/** into the animation mode with the timeline – the guide stays open */
const toMode = () => {
  if (context.modes.active() !== `animation.${MODE}`) {
    context.modes.open(MODE);
  }
  state.timeline = true;
  context.panels.open(GUIDE_PANEL);
};

/** a box and a ball to try it on, the box selected */
const buildPractice = async () => {
  const root = pluginContext().editor.model.root;
  if ((root.instances.size || root.faces.size) && !(await pluginContext().editor.confirm(t('animation.guide.confirmReplace')))) {
    return;
  }
  const name = (key: string) => JSON.stringify(t(`animation.guide.practice.${key}`));
  context.script.run(`s3d.clear();
s3d.animateClear();
s3d.material('Box', '#4c6ef5'); // i18n-ignore – material names
s3d.material('Ball', '#f76707'); // i18n-ignore – material names
s3d.box([-0.5, -0.5, 0], 1, 1, 1, { name: ${name('box')}, material: 'Box' });
s3d.sphere([3, 0, 0.5], 0.5, { name: ${name('ball')}, material: 'Ball', segments: 16 });
s3d.camera([1.5, -12, 6], [1.5, 0, 0.3]);`);
  const box = [...editor.model.root.instances.values()].find((instance) => instance.name === t('animation.guide.practice.box'));
  if (box) {
    editor.select([{ kind: 'instance', id: box.id }], 'set');
  }
  toMode();
  setFrame(currentScene().start);
};

const select = () => {
  editor.setTool('select');
  const first = [...editor.model.root.instances.values()].find((instance) => !instance.definition.faceMe);
  if (first) {
    editor.select([{ kind: 'instance', id: first.id }], 'set');
  }
};

const openDemo = (id: string) => {
  const demo = DEMOS.find((entry) => entry.id === id);
  if (demo) {
    context.script.openInEditor('js', demo.code);
  }
};

interface Step {
  id: string;
  done?: boolean;
  checks?: { label: string; done: boolean }[];
  actions: { label: string; run: () => void; disabled?: boolean }[];
}

const steps = computed((): Step[] => {
  tick();
  const learned = state.learned;
  const scene = currentScene();
  const groups = [...editor.model.root.instances.values()].filter((instance) => !instance.definition.faceMe).length;
  const nodes = animatedNodes();
  const frames = (node: (typeof nodes)[number]) =>
    new Set(Object.values(node.animation.tracks).flatMap((track) => track?.keys.map((key) => key.frame) ?? []));
  const twoKeys = nodes.some((node) => frames(node).size >= 2);
  const selected = selectedInstances().length > 0;
  const middle = Math.round((scene.start + scene.end) / 2);
  return [
    { id: 'practice', done: groups > 0, actions: [{ label: 'animation.guide.actions.practice', run: buildPractice }] },
    {
      id: 'first',
      done: nodes.length > 0,
      checks: [
        { label: 'animation.guide.checks.selected', done: selected },
        { label: 'animation.guide.checks.atStart', done: Math.round(state.frame) === scene.start },
      ],
      actions: [
        { label: 'animation.guide.actions.select', run: select },
        { label: 'animation.guide.actions.toStart', run: () => jumpTo('start') },
        { label: 'animation.guide.actions.key', run: () => void keySelected(), disabled: !selected },
      ],
    },
    {
      id: 'second',
      done: twoKeys,
      checks: [{ label: 'animation.guide.checks.later', done: Math.round(state.frame) !== scene.start }],
      actions: [
        { label: 'animation.guide.actions.toMiddle', run: () => setFrame(middle) },
        { label: 'animation.guide.actions.move', run: () => editor.setTool('move') },
        { label: 'animation.guide.actions.key', run: () => void keySelected(), disabled: !selected },
      ],
    },
    { id: 'play', done: learned.played, actions: [{ label: 'animation.timeline.play', run: play }] },
    {
      id: 'graph',
      done: learned.graph,
      actions: [
        {
          label: 'animation.guide.actions.graph',
          run: () => {
            toMode();
            state.timelineView = 'graph';
            state.learned.graph = true;
          },
        },
      ],
    },
    {
      id: 'camera',
      done: scene.cameras.length > 0 && learned.camera,
      actions: [
        { label: 'animation.panel.addCamera', run: () => void addCamera() },
        { label: 'animation.timeline.lookThrough', run: () => setLookThrough(true), disabled: !scene.cameras.length },
      ],
    },
    { id: 'render', done: learned.rendered, actions: [{ label: 'animation.guide.actions.render', run: () => context.panels.open(PANEL) }] },
    { id: 'more', actions: DEMOS.map((demo) => ({ label: `animation.demos.${demo.id}.name`, run: () => openDemo(demo.id) })) },
  ];
});

const counted = computed(() => steps.value.filter((step) => step.done !== undefined).length);
const doneCount = computed(() => steps.value.filter((step) => step.done).length);
</script>
