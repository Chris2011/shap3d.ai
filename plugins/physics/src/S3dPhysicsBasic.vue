<template>
  <!-- the simple view: start and stop, what a selected object does, what it is made of and what holds it – no numbers -->
  <section class="s3d-ph-section">
    <div class="s3d-ph-row">
      <button class="s3d-btn primary s3d-ph-big" :disabled="state.status === 'loading'" @click="toggle">
        {{
          state.status === 'running'
            ? t('physics.panel.pause')
            : state.status === 'paused'
              ? t('physics.panel.resume')
              : t('physics.panel.start')
        }}
      </button>
      <button class="s3d-btn" :disabled="state.status === 'stopped'" :title="t('physics.panel.resetHint')" @click="reset">
        {{ t('physics.panel.reset') }}
      </button>
      <button class="s3d-btn" :disabled="state.status === 'stopped'" :title="t('physics.panel.keepHint')" @click="keepPositions">
        {{ t('physics.panel.keep') }}
      </button>
    </div>
    <p class="s3d-ph-hint">{{ statusText }}</p>
    <div class="s3d-ph-row">
      <label class="s3d-ph-check"
        ><input type="checkbox" :checked="settings.speed < 1" @change="changeSettings({ speed: checked($event) ? 0.25 : 1 })" />{{
          t('physics.basic.slowMotion')
        }}</label
      >
      <button class="s3d-btn" :title="t('physics.tools.pullStatus')" @click="editor.setTool(PULL_TOOL_ID)">
        {{ t('physics.tools.pull') }}
      </button>
    </div>
    <S3dPhysicsTimeline />
  </section>

  <!-- nothing (usable) selected -->
  <section v-if="!instances.length" class="s3d-ph-section">
    <template v-if="loose">
      <p class="s3d-ph-warning">{{ t('physics.basic.loose') }}</p>
      <div class="s3d-ph-row">
        <button class="s3d-btn primary" @click="makeGroup">{{ t('physics.basic.makeGroup') }}</button>
      </div>
    </template>
    <p v-else class="s3d-ph-hint">{{ t('physics.basic.nothing') }}</p>
    <p class="s3d-ph-hint">{{ t('physics.basic.bodyCount', { count: bodyCount }) }}</p>
  </section>

  <template v-else>
    <section class="s3d-ph-section">
      <div class="s3d-ph-heading">
        <span class="s3d-ph-name">{{
          instances.length === 1 ? nameOf(instances[0]) : t('physics.basic.selected', { count: instances.length })
        }}</span>
      </div>
      <div class="s3d-ph-subheading">{{ t('physics.basic.what') }}</div>
      <div class="s3d-ph-choices">
        <button
          v-for="choice in CHOICES"
          :key="choice"
          class="s3d-ph-choice"
          :class="{ active: allAre(choice) }"
          @click="markSelected(choice)"
        >
          <strong>{{ t(`physics.basic.kinds.${choice}`) }}</strong>
          <span>{{ t(`physics.basic.kindHints.${choice}`) }}</span>
        </button>
      </div>
      <p v-if="otherKind" class="s3d-ph-hint">{{ t('physics.basic.otherKind') }}</p>
    </section>

    <section v-if="allAre('dynamic') || allAre('static')" class="s3d-ph-section">
      <div class="s3d-ph-subheading">{{ t('physics.basic.madeOf') }}</div>
      <div class="s3d-ph-choices">
        <button
          v-for="name in MATERIAL_NAMES"
          :key="name"
          class="s3d-ph-choice small"
          :class="{ active: materialOfAll === name }"
          @click="changeSelected({ material: name, density: undefined, friction: undefined, bounce: undefined, mass: undefined })"
        >
          <span class="s3d-ph-swatch" :style="{ background: MATERIALS[name].colour }" />
          <strong>{{ t(`physics.materials.${name}`) }}</strong>
          <span>{{ t(`physics.basic.materialHints.${name}`) }}</span>
        </button>
      </div>
    </section>

    <!-- a push at the start: a direction seen from the camera -->
    <section v-if="allAre('dynamic')" class="s3d-ph-section">
      <div class="s3d-ph-subheading">{{ t('physics.basic.push') }}</div>
      <div class="s3d-ph-row">
        <button
          v-for="direction in PUSHES"
          :key="direction"
          class="s3d-btn"
          :class="{ primary: direction === 'none' && !pushed }"
          @click="push(direction)"
        >
          {{ t(`physics.basic.pushes.${direction}`) }}
        </button>
      </div>
      <label class="s3d-ph-check"><input v-model="strong" type="checkbox" />{{ t('physics.basic.strong') }}</label>
      <p class="s3d-ph-hint">{{ t(pushed ? 'physics.basic.pushed' : 'physics.basic.pushHint') }}</p>
    </section>

    <!-- what holds it: one object at a time -->
    <section v-if="single && single.data?.type === 'dynamic'" class="s3d-ph-section">
      <div class="s3d-ph-subheading">{{ t('physics.basic.attach') }}</div>
      <div v-for="(joint, index) in single.data.joints ?? []" :key="index" class="s3d-ph-basic-joint">
        <span class="s3d-ph-entry-name">{{
          t('physics.basic.jointTo', { kind: t(`physics.joints.${joint.kind}`), to: partnerName(joint.to) })
        }}</span>
        <label v-if="joint.kind === 'hinge'" class="s3d-ph-check"
          ><input type="checkbox" :checked="!!joint.motor" @change="setMotor(index, checked($event))" />{{
            t('physics.basic.motor')
          }}</label
        >
        <button class="s3d-btn" @click="removeJoint(index)">{{ t('physics.basic.remove') }}</button>
      </div>
      <p v-if="!single.data.joints?.length" class="s3d-ph-hint">{{ t('physics.basic.attachHint') }}</p>
      <div class="s3d-ph-row">
        <button v-for="kind in ATTACH" :key="kind" class="s3d-btn" :class="{ primary: placing === kind }" @click="attach(kind)">
          {{ t(`physics.basic.attachKinds.${kind}`) }}
        </button>
      </div>
      <p v-if="placing" class="s3d-ph-hint s3d-ph-guide-text s3d-ph-basic-steps">
        {{ t(placing === 'hinge' ? 'physics.basic.attachStepsHinge' : 'physics.basic.attachSteps') }}
      </p>
    </section>
  </template>

  <section class="s3d-ph-section">
    <p class="s3d-ph-hint">{{ t('physics.basic.more') }}</p>
    <div class="s3d-ph-row">
      <button class="s3d-btn" @click="emit('advanced')">{{ t('physics.basic.toAdvanced') }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dPhysicsTimeline from './S3dPhysicsTimeline.vue';
import type { Instance } from '../../../src/core/model';
import { MATERIALS, bodyData, isRegion, settingsOf, type BodyData, type JointData, type JointKind } from './data';
import { changeJoint, changeSelected, changeSettings, markSelected, selectedInstances } from './edit';
import { JOINT_TOOL_ID, PULL_TOOL_ID } from './names';
import { findInstance, physicsInstances } from './scene';
import { keepPositions, pauseSim, resetSim, startSim } from './sim';
import { currentJointKind, setJointKind } from './tools';
import { pluginContext, t, THREE } from './runtime';
import { learn, usePhysicsState } from './state';

const emit = defineEmits<{ advanced: [] }>();

/** what an object can do in the simple view – the other kinds and the regions are in the advanced one */
const CHOICES = ['dynamic', 'static', 'off'] as const;
const ATTACH: JointKind[] = ['hinge', 'rope', 'spring', 'fixed'];
/** pushes at the start, seen from the camera */
const PUSHES = ['none', 'up', 'away', 'left', 'right', 'spin'] as const;
const MATERIAL_NAMES = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];

const context = pluginContext();
const editor = context.editor;
const state = usePhysicsState();

const checked = (event: Event) => (event.target as HTMLInputElement).checked;
const nameOf = (instance: Instance) => instance.name || instance.definition.name;

// the model is not reactive – the editor bumps these after changes and selections
const revision = computed(() => editor.ui.revision + editor.ui.selRev + state.revision);
const settings = computed(() => (void revision.value, settingsOf()));
const instances = computed(() => (void revision.value, selectedInstances()));
const entries = computed(() => instances.value.map((instance) => ({ instance, data: bodyData(instance) })));
const single = computed(() => (entries.value.length === 1 ? entries.value[0] : null));
/** faces or edges selected, but no group: physics needs a group */
const loose = computed(() => (void revision.value, [...editor.selection.values()].some((ref) => ref.kind !== 'instance')));
const bodyCount = computed(() => (void revision.value, physicsInstances().filter((entry) => !isRegion(entry.data.type)).length));

const allAre = (type: BodyData['type']) => entries.value.length > 0 && entries.value.every((entry) => entry.data?.type === type);
/** a kind the simple view does not offer (kinematic, water …) – it says where to change it */
const otherKind = computed(() => entries.value.some((entry) => entry.data && !(CHOICES as readonly string[]).includes(entry.data.type)));
const materialOfAll = computed(() => {
  const names = new Set(entries.value.map((entry) => entry.data?.material ?? 'wood'));
  return names.size === 1 ? [...names][0] : null;
});

const statusText = computed(() => {
  const time = state.time.toFixed(1);
  switch (state.status) {
    case 'loading':
      return t('physics.panel.loading');
    case 'running':
      return t('physics.basic.status.running', { time });
    case 'paused':
      return t('physics.basic.status.paused', { time });
    default:
      return state.error || t('physics.basic.status.ready');
  }
});

/** the joint the joint tool is setting up now (its steps are shown) */
const placing = computed(() => (editor.ui.tool === JOINT_TOOL_ID ? (void state.revision, currentJointKind()) : null));

const partnerName = (to: JointData['to']) => {
  if (to === 'world') {
    return t('physics.panel.toWorld');
  }
  if (to === undefined || to === 'parent') {
    return t('physics.panel.toParent');
  }
  const other = findInstance(to)?.instance;
  return other ? nameOf(other) : '?';
};

const toggle = () => {
  if (state.status === 'running') {
    pauseSim();
  } else {
    void startSim();
  }
};
const reset = () => {
  resetSim();
  learn('reset');
};
const makeGroup = () => context.commands.run('makeGroup');

const attach = (kind: JointKind) => {
  setJointKind(kind, kind === 'hinge');
  editor.setTool(JOINT_TOOL_ID);
  state.revision++;
};
/** a motor that turns the hinge on and on – speeds, targets and programs are in the advanced view */
const setMotor = (index: number, on: boolean) => {
  if (single.value) {
    resetSim();
    changeJoint(single.value.instance, index, { motor: on ? { mode: 'speed', value: 90 } : undefined });
  }
};
const strong = ref(false);
/** some selected body starts moving or turning */
const pushed = computed(() => entries.value.some((entry) => entry.data?.velocity || entry.data?.spin));

/** gives the selected bodies a start speed (or turn) in a direction seen from the camera – one undo step */
const push = (direction: (typeof PUSHES)[number]) => {
  if (direction === 'none') {
    changeSelected({ velocity: undefined, spin: undefined });
    return;
  }
  if (direction === 'spin') {
    changeSelected({ velocity: undefined, spin: [0, 0, strong.value ? 720 : 240] });
    return;
  }
  const speed = strong.value ? 8 : 3;
  const camera = editor.viewer.rig.camera;
  // the camera's way into the view and to its right, flat on the ground
  const away = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate().setZ(0);
  if (away.lengthSq() < 1e-6) {
    away.set(0, 1, 0);
  }
  away.normalize();
  const right = new THREE.Vector3(away.y, -away.x, 0);
  const way = { up: new THREE.Vector3(0, 0, 1), away, left: right.clone().negate(), right }[direction].multiplyScalar(speed);
  changeSelected({ spin: undefined, velocity: way.toArray().map((value) => Math.round(value * 100) / 100) as [number, number, number] });
};

const removeJoint = (index: number) => {
  if (single.value) {
    resetSim();
    changeJoint(single.value.instance, index, null);
  }
};
</script>
