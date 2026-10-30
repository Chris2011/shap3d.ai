<template>
  <div class="s3d-lv">
    <!-- how far the level is: every step ticks itself off from what the model holds -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">
        <span>{{ t('level.guide.heading') }}</span>
        <span class="s3d-lv-entry-id">{{ t('level.guide.progress', { done: doneCount, count: steps.length }) }}</span>
      </div>
      <div class="s3d-lv-guide-bar"><div :style="{ width: `${(doneCount / steps.length) * 100}%` }"></div></div>
      <p class="s3d-lv-hint">{{ t('level.guide.intro') }}</p>
    </section>

    <section class="s3d-lv-section">
      <div v-for="(step, index) in steps" :key="step.id" class="s3d-lv-guide-step" :class="{ open: index === current, done: step.done }">
        <button class="s3d-lv-guide-head" @click="current = index">
          <span class="s3d-lv-guide-mark">{{ step.done ? '✓' : index + 1 }}</span>
          <span class="s3d-lv-entry-name">{{ t(`level.guide.steps.${step.id}.title`) }}</span>
        </button>
        <div v-if="index === current" class="s3d-lv-guide-body">
          <p class="s3d-lv-hint">{{ t(`level.guide.steps.${step.id}.text`) }}</p>
          <ul v-if="step.checks" class="s3d-lv-guide-checks">
            <li v-for="check in step.checks" :key="check.label" :class="{ done: check.done }">
              {{ check.done ? '✓' : '○' }} {{ t(check.label) }}
            </li>
          </ul>
          <div class="s3d-lv-row">
            <button
              v-for="(action, at) in step.actions"
              :key="action.label"
              class="s3d-btn small"
              :class="{ primary: at === 0 && !step.done }"
              :disabled="action.disabled"
              :title="action.disabled && action.hint ? t(action.hint) : undefined"
              @click="action.run()"
            >
              {{ t(action.label) }}
            </button>
          </div>
          <p v-if="step.done" class="s3d-lv-hint">✓ {{ t(`level.guide.steps.${step.id}.done`) }}</p>
          <div class="s3d-lv-row s3d-lv-guide-nav">
            <button class="s3d-btn small" :disabled="index === 0" @click="current = index - 1">{{ t('level.guide.back') }}</button>
            <button class="s3d-btn small" :disabled="index === steps.length - 1" @click="current = index + 1">
              {{ t('level.guide.next') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { blockoutData } from './blockout';
import { checkLevel } from './checks';
import type { ObjectKind } from './kinds';
import { levelAtmosphere } from './lights';
import { BLOCKOUT_PANEL, BLOCK_TOOL_ID, EXPORTER, GUIDE_PANEL, MODE, PANEL, PLACE_TOOL_ID, PLAY_TOOL_ID } from './names';
import { shownNav, toggleNav } from './nav';
import { levelObjects, selectObjects, setActions, type LevelObject } from './objects';
import { pluginContext, t } from './runtime';
import { useLevelState } from './state';

/**
 * A guide through a first level, step by step (it lives in the level mode): the blockout, the start, enemies and their round,
 * the level's logic, light, the checks, the test run and the export. Each step says what to do, has buttons that
 * start it (a tool, a panel, a check) and ticks itself off once the model shows it is done.
 */

const context = pluginContext();
const editor = context.editor;
const state = useLevelState();

// the model is not reactive – the editor bumps these after changes and selections
const revision = computed(() => editor.ui.revision + editor.ui.selRev + state.revision);
const objects = computed(() => {
  void revision.value;
  return levelObjects();
});
const has = (kind: ObjectKind) => objects.value.some((object) => object.kind === kind);

/** sets the kind to place and takes the place tool */
/** into the level mode – the guide stays open (entering the mode would show the objects) */
const toMode = () => {
  if (context.modes.active() !== `level.${MODE}`) {
    context.modes.open(MODE);
    context.panels.open(GUIDE_PANEL);
  }
};

// the tool first: switching tools ends what the tool before had chosen
const place = (kind: ObjectKind) => {
  toMode();
  editor.setTool(PLACE_TOOL_ID);
  state.placing = kind;
  editor.redraw();
};
const draw = (kind: 'room' | 'corridor' | 'stairs') => {
  toMode();
  editor.setTool(BLOCK_TOOL_ID);
  state.block.kind = kind;
};
const panel = (id: string) => () => {
  context.modes.open(MODE);
  context.panels.open(id);
};

interface Step {
  id: string;
  done: boolean;
  /** the parts of the step, each ticked off by itself */
  checks?: { label: string; done: boolean }[];
  actions: { label: string; run: () => void; disabled?: boolean; hint?: string }[];
}

/** selects an object and opens the Level panel, where its properties and actions are */
const edit = (object: LevelObject | undefined) => {
  if (!object) {
    return;
  }
  context.modes.open(MODE);
  editor.setTool('select');
  selectObjects([object.instance]);
  context.panels.open(PANEL);
};

/** the newest of a kind – the one just placed – preferring those still without actions */
const newest = (kind: ObjectKind, withoutActions = false) => {
  const latestFirst = objects.value.filter((object) => object.kind === kind).reverse();
  return (withoutActions ? latestFirst.find((object) => !object.actions.length) : undefined) ?? latestFirst[0];
};

const steps = computed((): Step[] => {
  void revision.value;
  const atmosphere = levelAtmosphere();
  const nav = (void state.nav, shownNav());
  return [
    {
      id: 'blockout',
      done: blockoutData().pieces.length > 0,
      actions: [
        { label: 'level.guide.actions.room', run: () => draw('room') },
        { label: 'level.guide.actions.corridor', run: () => draw('corridor') },
        { label: 'level.guide.actions.generate', run: panel(BLOCKOUT_PANEL) },
      ],
    },
    {
      id: 'spawn',
      done: has('spawn'),
      actions: [{ label: 'level.guide.actions.spawn', run: () => place('spawn') }],
    },
    (() => {
      const paths = new Set(objects.value.filter((object) => object.kind === 'waypoint').map((object) => String(object.props.path)));
      const enemy = newest('enemy');
      return {
        id: 'enemies',
        done: has('enemy'),
        checks: [
          { label: 'level.guide.checks.enemy', done: has('enemy') },
          { label: 'level.guide.checks.waypoints', done: has('waypoint') },
          {
            label: 'level.guide.checks.path',
            done: objects.value.some((object) => object.kind === 'enemy' && !!object.props.path && paths.has(String(object.props.path))),
          },
        ],
        actions: [
          { label: 'level.guide.actions.enemy', run: () => place('enemy') },
          { label: 'level.guide.actions.waypoint', run: () => place('waypoint') },
          { label: 'level.guide.actions.path', run: () => edit(enemy), disabled: !enemy, hint: 'level.guide.needs.enemy' },
        ],
      };
    })(),
    (() => {
      const trigger = newest('trigger', true);
      return {
        id: 'logic',
        done: objects.value.some((object) => object.actions.length > 0),
        checks: [
          { label: 'level.guide.checks.trigger', done: has('trigger') },
          { label: 'level.guide.checks.action', done: objects.value.some((object) => object.actions.length > 0) },
        ],
        actions: [
          { label: 'level.guide.actions.trigger', run: () => place('trigger') },
          {
            label: 'level.guide.actions.message',
            run: () => trigger && setActions(trigger, [...trigger.actions, { do: 'message', value: t('level.guide.messageText') }]),
            disabled: !trigger,
            hint: 'level.guide.needs.trigger',
          },
          { label: 'level.guide.actions.editActions', run: () => edit(trigger), disabled: !trigger, hint: 'level.guide.needs.trigger' },
          { label: 'level.guide.actions.door', run: () => place('door') },
          { label: 'level.guide.actions.pickup', run: () => place('pickup') },
        ],
      };
    })(),
    {
      id: 'light',
      done: has('light') || atmosphere.daylight < 1 || atmosphere.fog,
      actions: [
        { label: 'level.guide.actions.light', run: () => place('light') },
        { label: 'level.guide.actions.atmosphere', run: panel(PANEL) },
      ],
    },
    {
      id: 'check',
      done: objects.value.length > 0 && !checkLevel(objects.value).length && !!nav && !nav.problems.length,
      checks: [
        { label: 'level.guide.checks.problems', done: objects.value.length > 0 && !checkLevel(objects.value).length },
        { label: 'level.guide.checks.reach', done: !!nav && !nav.problems.length },
      ],
      actions: [
        {
          label: 'level.guide.actions.check',
          run: () => {
            panel(PANEL)();
            toggleNav(true);
          },
        },
      ],
    },
    {
      id: 'play',
      done: state.guide.played,
      actions: [{ label: 'level.guide.actions.play', run: () => editor.setTool(PLAY_TOOL_ID) }],
    },
    {
      id: 'export',
      done: state.guide.exported,
      actions: [
        { label: 'level.guide.actions.glb', run: () => exportWith('export-glb') },
        { label: 'level.guide.actions.json', run: () => exportWith(`export-level.${EXPORTER}`) },
        { label: 'level.guide.actions.templates', run: panel(PANEL) },
      ],
    },
  ];
});

const exportWith = (command: string) => {
  state.guide.exported = true;
  context.commands.run(command);
};

const doneCount = computed(() => steps.value.filter((step) => step.done).length);

// opens at the first step not done yet – and moves on by itself when the open one gets done
const firstOpen = () =>
  Math.max(
    0,
    steps.value.findIndex((step) => !step.done),
  );
const current = ref(firstOpen());
// only when the open step itself gets done – opening a step that is done already (to place more) stays there
watch(
  () => [current.value, !!steps.value[current.value]?.done] as const,
  ([index, done], [indexBefore, doneBefore]) => {
    const next = steps.value.findIndex((step) => !step.done);
    if (index === indexBefore && done && !doneBefore && next >= 0) {
      current.value = next;
    }
  },
);
</script>
