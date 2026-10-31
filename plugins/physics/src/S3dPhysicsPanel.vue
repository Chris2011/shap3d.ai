<template>
  <div class="s3d-ph">
    <div class="s3d-ph-row s3d-ph-top">
      <div class="s3d-ph-switch" role="tablist">
        <button role="tab" :aria-selected="!advanced" :class="{ active: !advanced }" @click="advanced = false">
          {{ t('physics.basic.simple') }}
        </button>
        <button role="tab" :aria-selected="advanced" :class="{ active: advanced }" @click="advanced = true">
          {{ t('physics.basic.advanced') }}
        </button>
      </div>
      <button class="s3d-ph-guide-link" @click="openGuide">{{ t('physics.guide.open') }}</button>
    </div>
    <S3dPhysicsBasic v-if="!advanced" @advanced="advanced = true" />
    <template v-else>
      <!-- the simulation: start, pause, a step, back to the start, keep the places -->
      <section class="s3d-ph-section">
        <div class="s3d-ph-heading">
          <span>{{ t('physics.panel.simulation') }}</span>
          <span class="s3d-ph-time">{{ t('physics.panel.time', { time: state.time.toFixed(2) }) }}</span>
        </div>
        <div class="s3d-ph-row">
          <button class="s3d-btn primary" :disabled="state.status === 'loading'" @click="toggle">
            {{
              state.status === 'running'
                ? t('physics.panel.pause')
                : state.status === 'paused'
                  ? t('physics.panel.resume')
                  : t('physics.panel.start')
            }}
          </button>
          <button class="s3d-btn" :disabled="state.status === 'loading'" :title="t('physics.panel.stepHint')" @click="stepSim">
            {{ t('physics.panel.step') }}
          </button>
          <button class="s3d-btn" :disabled="state.status === 'stopped'" :title="t('physics.panel.resetHint')" @click="reset">
            {{ t('physics.panel.reset') }}
          </button>
          <button class="s3d-btn" :disabled="state.status === 'stopped'" :title="t('physics.panel.keepHint')" @click="keepPositions">
            {{ t('physics.panel.keep') }}
          </button>
        </div>
        <p v-if="state.status === 'loading'" class="s3d-ph-hint">{{ t('physics.panel.loading') }}</p>
        <p v-else-if="state.error" class="s3d-ph-warning">{{ state.error }}</p>
        <p v-else-if="state.status !== 'stopped'" class="s3d-ph-hint">
          {{ t('physics.panel.counts', { bodies: state.counts.bodies, joints: state.counts.joints }) }}
          <template v-if="state.counts.particles"> · {{ t('physics.panel.drops', { count: state.counts.particles }) }}</template>
        </p>
        <p v-else class="s3d-ph-hint">{{ t('physics.panel.startHint') }}</p>
        <S3dPhysicsTimeline />
        <div class="s3d-ph-grid">
          <label class="s3d-ph-field">
            <span>{{ t('physics.settings.gravity') }}</span>
            <input
              class="s3d-input"
              type="number"
              step="any"
              :value="settings.gravity"
              @change="changeSettings({ gravity: number($event) ?? 9.81 })"
            />
          </label>
          <label class="s3d-ph-field">
            <span>{{ t('physics.settings.speed') }}</span>
            <select class="s3d-input" :value="settings.speed" @change="changeSettings({ speed: number($event) ?? 1 })">
              <option v-for="speed in SPEEDS" :key="speed" :value="speed">{{ speed }}×</option>
            </select>
          </label>
        </div>
        <S3dPhysicsVec
          :label="t('physics.settings.wind')"
          :model-value="settings.wind"
          @change="(wind) => changeSettings({ wind: wind ?? [0, 0, 0] })"
        />
        <div class="s3d-ph-row">
          <label class="s3d-ph-check"
            ><input type="checkbox" :checked="settings.air" @change="changeSettings({ air: checked($event) })" />{{
              t('physics.settings.air')
            }}</label
          >
          <label class="s3d-ph-check"
            ><input type="checkbox" :checked="settings.ground" @change="changeSettings({ ground: checked($event) })" />{{
              t('physics.settings.ground')
            }}</label
          >
        </div>
        <div class="s3d-ph-row">
          <span class="s3d-ph-small">{{ t('physics.panel.show') }}</span>
          <label v-for="name in ['joints', 'forces', 'trails', 'flow'] as const" :key="name" class="s3d-ph-check"
            ><input v-model="state.show[name]" type="checkbox" @change="redraw" />{{ t(`physics.panel.shows.${name}`) }}</label
          >
        </div>
        <div class="s3d-ph-row">
          <button class="s3d-btn" @click="useTool(PULL_TOOL_ID)">{{ t('physics.tools.pull') }}</button>
        </div>
      </section>

      <!-- the selected group -->
      <section v-if="current" class="s3d-ph-section">
        <div class="s3d-ph-heading">
          <span class="s3d-ph-name">{{ current.instance.name || current.instance.definition.name }}</span>
        </div>
        <label class="s3d-ph-field">
          <span>{{ t('physics.panel.type') }}</span>
          <select class="s3d-input" :value="current.data?.type ?? ''" @change="setType(text($event))">
            <option value="">{{ t('physics.types.none') }}</option>
            <optgroup :label="t('physics.panel.bodies')">
              <option v-for="type in BODY_TYPES" :key="type" :value="type">{{ t(`physics.types.${type}`) }}</option>
            </optgroup>
            <optgroup :label="t('physics.panel.regions')">
              <option v-for="type in REGION_TYPES" :key="type" :value="type">{{ t(`physics.types.${type}`) }}</option>
            </optgroup>
          </select>
        </label>
        <p class="s3d-ph-hint">{{ t(`physics.typeHints.${current.data?.type ?? 'none'}`) }}</p>

        <template v-if="current.data && isBody(current.data.type)">
          <div class="s3d-ph-grid">
            <label class="s3d-ph-field">
              <span>{{ t('physics.panel.material') }}</span>
              <select
                class="s3d-input"
                :value="current.data.material ?? 'wood'"
                @change="change({ material: text($event) as BodyData['material'] })"
              >
                <option v-for="name in MATERIAL_NAMES" :key="name" :value="name">{{ t(`physics.materials.${name}`) }}</option>
                <option value="custom">{{ t('physics.materials.custom') }}</option>
              </select>
            </label>
            <label class="s3d-ph-field">
              <span>{{ t('physics.panel.shape') }}</span>
              <select class="s3d-input" :value="current.data.shape ?? 'auto'" @change="change({ shape: text($event) as ShapeKind })">
                <option v-for="shape in SHAPES" :key="shape" :value="shape">{{ t(`physics.shapes.${shape}`) }}</option>
              </select>
            </label>
            <label v-if="current.data.type === 'dynamic'" class="s3d-ph-field">
              <span>{{ t('physics.panel.mass') }}</span>
              <input
                class="s3d-input"
                type="number"
                step="any"
                min="0"
                :placeholder="t('physics.panel.fromDensity')"
                :value="current.data.mass ?? ''"
                @change="change({ mass: number($event) })"
              />
            </label>
            <template v-if="current.data.material === 'custom'">
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.density') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="any"
                  :value="current.data.density ?? ''"
                  @change="change({ density: number($event) })"
                />
              </label>
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.friction') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="0.05"
                  :value="current.data.friction ?? ''"
                  @change="change({ friction: number($event) })"
                />
              </label>
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.bounce') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="0.05"
                  :value="current.data.bounce ?? ''"
                  @change="change({ bounce: number($event) })"
                />
              </label>
            </template>
          </div>
          <template v-if="current.data.type === 'dynamic' || current.data.type === 'kinematic'">
            <S3dPhysicsVec
              :label="t(current.data.type === 'dynamic' ? 'physics.panel.startVelocity' : 'physics.panel.velocity')"
              :model-value="current.data.velocity"
              @change="(value) => change({ velocity: value })"
            />
            <S3dPhysicsVec
              :label="t(current.data.type === 'dynamic' ? 'physics.panel.startSpin' : 'physics.panel.spin')"
              :model-value="current.data.spin"
              @change="(value) => change({ spin: value })"
            />
          </template>
          <label v-if="current.data.type === 'kinematic'" class="s3d-ph-field">
            <span>{{ t('physics.panel.period') }}</span>
            <input
              class="s3d-input"
              type="number"
              step="any"
              min="0"
              :value="current.data.period ?? ''"
              @change="change({ period: number($event) })"
            />
          </label>
          <template v-if="current.data.type === 'dynamic'">
            <div class="s3d-ph-subheading">{{ t('physics.panel.forces') }}</div>
            <S3dPhysicsVec
              :label="t('physics.panel.force')"
              :model-value="current.data.force"
              @change="(value) => change({ force: value })"
            />
            <S3dPhysicsVec
              :label="t('physics.panel.thrust')"
              :model-value="current.data.thrust"
              @change="(value) => change({ thrust: value })"
            />
            <div class="s3d-ph-grid">
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.lift') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="any"
                  min="0"
                  :value="current.data.lift ?? ''"
                  @change="change({ lift: number($event) })"
                />
              </label>
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.drag') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="any"
                  min="0"
                  :placeholder="t('physics.panel.auto')"
                  :value="current.data.drag ?? ''"
                  @change="change({ drag: number($event) })"
                />
              </label>
            </div>
          </template>

          <!-- joints -->
          <div class="s3d-ph-subheading">{{ t('physics.panel.joints') }}</div>
          <div v-for="(joint, index) in current.data.joints ?? []" :key="index" class="s3d-ph-joint">
            <div class="s3d-ph-grid">
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.jointKind') }}</span>
                <select class="s3d-input" :value="joint.kind" @change="changeJointAt(index, { kind: text($event) as JointKind })">
                  <option v-for="kind in JOINT_KINDS" :key="kind" :value="kind">{{ t(`physics.joints.${kind}`) }}</option>
                </select>
              </label>
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.jointTo') }}</span>
                <select
                  class="s3d-input"
                  :value="String(joint.to ?? 'parent')"
                  @change="changeJointAt(index, { to: partner(text($event)) })"
                >
                  <option value="parent">{{ t('physics.panel.toParent') }}</option>
                  <option value="world">{{ t('physics.panel.toWorld') }}</option>
                  <option v-for="other in partners" :key="other.id" :value="String(other.id)">{{ other.name }}</option>
                </select>
              </label>
            </div>
            <S3dPhysicsVec
              :label="t('physics.panel.anchor')"
              :model-value="joint.at"
              @change="(value) => changeJointAt(index, { at: value ?? [0, 0, 0] })"
            />
            <S3dPhysicsVec
              v-if="joint.kind === 'hinge' || joint.kind === 'slider'"
              :label="t('physics.panel.axis')"
              :model-value="joint.axis ?? [0, 0, 1]"
              @change="(value) => changeJointAt(index, { axis: value })"
            />
            <S3dPhysicsVec
              v-if="joint.kind === 'rope' || joint.kind === 'spring'"
              :label="t('physics.panel.otherEnd')"
              :model-value="joint.toAt"
              @change="(value) => changeJointAt(index, { toAt: value })"
            />
            <div class="s3d-ph-grid">
              <template v-if="joint.kind === 'hinge' || joint.kind === 'slider'">
                <label class="s3d-ph-field">
                  <span>{{ t(joint.kind === 'hinge' ? 'physics.panel.minAngle' : 'physics.panel.minWay') }}</span>
                  <input
                    class="s3d-input"
                    type="number"
                    step="any"
                    :value="joint.min ?? ''"
                    @change="changeJointAt(index, { min: number($event) })"
                  />
                </label>
                <label class="s3d-ph-field">
                  <span>{{ t(joint.kind === 'hinge' ? 'physics.panel.maxAngle' : 'physics.panel.maxWay') }}</span>
                  <input
                    class="s3d-input"
                    type="number"
                    step="any"
                    :value="joint.max ?? ''"
                    @change="changeJointAt(index, { max: number($event) })"
                  />
                </label>
                <label class="s3d-ph-field">
                  <span>{{ t('physics.panel.motor') }}</span>
                  <select class="s3d-input" :value="joint.motor?.mode ?? ''" @change="setMotorMode(index, joint, text($event))">
                    <option value="">{{ t('physics.motor.off') }}</option>
                    <option value="position">{{ t('physics.motor.position') }}</option>
                    <option value="speed">{{ t('physics.motor.speed') }}</option>
                  </select>
                </label>
                <label v-if="joint.motor" class="s3d-ph-field">
                  <span>{{ t(joint.motor.mode === 'speed' ? 'physics.motor.speedValue' : 'physics.motor.target') }}</span>
                  <input
                    class="s3d-input"
                    type="number"
                    step="any"
                    :value="joint.motor.value"
                    @change="changeJointAt(index, { motor: { ...joint.motor, value: number($event) ?? 0 } })"
                  />
                </label>
                <label v-if="joint.motor" class="s3d-ph-field">
                  <span>{{ t('physics.motor.strength') }}</span>
                  <input
                    class="s3d-input"
                    type="number"
                    step="any"
                    min="0"
                    :value="joint.motor.strength ?? 1"
                    @change="changeJointAt(index, { motor: { ...joint.motor, strength: number($event) } })"
                  />
                </label>
              </template>
              <label v-if="joint.kind === 'rope' || joint.kind === 'spring'" class="s3d-ph-field">
                <span>{{ t('physics.panel.length') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="any"
                  min="0"
                  :placeholder="t('physics.panel.auto')"
                  :value="joint.length ?? ''"
                  @change="changeJointAt(index, { length: number($event) })"
                />
              </label>
              <template v-if="joint.kind === 'spring'">
                <label class="s3d-ph-field">
                  <span>{{ t('physics.panel.stiffness') }}</span>
                  <input
                    class="s3d-input"
                    type="number"
                    step="any"
                    min="0"
                    :value="joint.stiffness ?? 200"
                    @change="changeJointAt(index, { stiffness: number($event) })"
                  />
                </label>
                <label class="s3d-ph-field">
                  <span>{{ t('physics.panel.damping') }}</span>
                  <input
                    class="s3d-input"
                    type="number"
                    step="any"
                    min="0"
                    :value="joint.damping ?? 5"
                    @change="changeJointAt(index, { damping: number($event) })"
                  />
                </label>
              </template>
            </div>
            <label v-if="joint.kind === 'hinge' || joint.kind === 'slider'" class="s3d-ph-field">
              <span>{{ t('physics.panel.program') }}</span>
              <input
                class="s3d-input"
                :placeholder="t('physics.panel.programHint')"
                :value="programText(joint.program)"
                @change="changeJointAt(index, { program: parseProgram(text($event)) })"
              />
            </label>
            <!-- while it runs: where the joint is, and a slider that drives it -->
            <div v-if="live(index) && (joint.kind === 'hinge' || joint.kind === 'slider')" class="s3d-ph-live">
              <span>{{
                t('physics.panel.now', {
                  value: live(index)!.value.toFixed(joint.kind === 'hinge' ? 0 : 2),
                  unit: joint.kind === 'hinge' ? '°' : 'm',
                })
              }}</span>
              <input
                type="range"
                :min="joint.min ?? (joint.kind === 'hinge' ? -180 : -2)"
                :max="joint.max ?? (joint.kind === 'hinge' ? 180 : 2)"
                :step="joint.kind === 'hinge' ? 1 : 0.01"
                :value="state.drive[live(index)!.key] ?? live(index)!.value"
                @input="state.drive[live(index)!.key] = Number(($event.target as HTMLInputElement).value)"
              />
            </div>
            <div class="s3d-ph-row end">
              <button class="s3d-btn" @click="changeJoint(current.instance, index, null)">{{ t('physics.panel.removeJoint') }}</button>
            </div>
          </div>
          <div class="s3d-ph-row">
            <select class="s3d-input s3d-ph-grow" :value="jointKind" @change="chooseJointKind(text($event) as JointKind)">
              <option v-for="kind in JOINT_KINDS" :key="kind" :value="kind">{{ t(`physics.joints.${kind}`) }}</option>
            </select>
            <button class="s3d-btn" @click="useTool(JOINT_TOOL_ID)">{{ t('physics.tools.joint') }}</button>
          </div>
          <p class="s3d-ph-hint">{{ t('physics.panel.jointHint') }}</p>
        </template>

        <!-- regions -->
        <template v-else-if="current.data">
          <div class="s3d-ph-grid">
            <label v-if="current.data.type !== 'tunnel'" class="s3d-ph-field">
              <span>{{ t('physics.panel.density') }}</span>
              <input
                class="s3d-input"
                type="number"
                step="any"
                placeholder="1000"
                :value="current.data.density ?? ''"
                @change="change({ density: number($event) })"
              />
            </label>
            <template v-if="current.data.type === 'liquid'">
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.spacing') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="any"
                  min="0"
                  :placeholder="t('physics.panel.auto')"
                  :value="current.data.spacing ?? ''"
                  @change="change({ spacing: number($event) })"
                />
              </label>
              <label class="s3d-ph-field">
                <span>{{ t('physics.panel.viscosity') }}</span>
                <input
                  class="s3d-input"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  placeholder="0.1"
                  :value="current.data.viscosity ?? ''"
                  @change="change({ viscosity: number($event) })"
                />
              </label>
            </template>
            <label v-if="current.data.type === 'tunnel'" class="s3d-ph-field">
              <span>{{ t('physics.panel.resolution') }}</span>
              <input
                class="s3d-input"
                type="number"
                step="1"
                min="12"
                max="64"
                placeholder="40"
                :value="current.data.resolution ?? ''"
                @change="change({ resolution: number($event) })"
              />
            </label>
          </div>
          <S3dPhysicsVec
            v-if="current.data.type !== 'liquid'"
            :label="t(current.data.type === 'tunnel' ? 'physics.panel.tunnelWind' : 'physics.panel.current')"
            :model-value="current.data.velocity ?? (current.data.type === 'tunnel' ? [5, 0, 0] : undefined)"
            @change="(value) => change({ velocity: value })"
          />
        </template>
      </section>
      <section v-else class="s3d-ph-section">
        <p class="s3d-ph-hint">{{ t('physics.panel.selectHint') }}</p>
        <div class="s3d-ph-row">
          <button class="s3d-btn" @click="markSelected('dynamic')">{{ t('physics.commands.dynamic') }}</button>
          <button class="s3d-btn" @click="markSelected('static')">{{ t('physics.commands.static') }}</button>
        </div>
      </section>

      <!-- every body and region in the model -->
      <section class="s3d-ph-section">
        <div class="s3d-ph-heading">{{ t('physics.panel.list') }}</div>
        <p v-if="!list.length" class="s3d-ph-hint">{{ t('physics.panel.listEmpty') }}</p>
        <button
          v-for="entry in list"
          :key="entry.instance.id"
          class="s3d-ph-entry"
          :class="{ active: current?.instance === entry.instance }"
          @click="select(entry.instance.id)"
        >
          <span class="s3d-ph-swatch" :style="{ background: colourOf(entry.data) }" />
          <span class="s3d-ph-entry-name">{{ entry.instance.name || entry.instance.definition.name }}</span>
          <span class="s3d-ph-entry-type"
            >{{ t(`physics.types.${entry.data.type}`)
            }}<template v-if="entry.data.joints?.length"> · {{ entry.data.joints.length }}⚙</template></span
          >
        </button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import S3dPhysicsBasic from './S3dPhysicsBasic.vue';
import S3dPhysicsTimeline from './S3dPhysicsTimeline.vue';
import S3dPhysicsVec from './S3dPhysicsVec.vue';
import {
  BODY_TYPES,
  JOINT_KINDS,
  MATERIALS,
  REGION_TYPES,
  SHAPES,
  bodyData,
  isRegion,
  settingsOf,
  type BodyData,
  type BodyType,
  type JointData,
  type JointKind,
  type ShapeKind,
} from './data';
import { changeBody, changeJoint, changeSettings, markSelected, selectedInstance } from './edit';
import { currentSim, jointValue, keepPositions, pauseSim, resetSim, startSim, stepSim } from './sim';
import { physicsInstances } from './scene';
import { currentJointKind, setJointKind } from './tools';
import { GUIDE_PANEL, JOINT_TOOL_ID, PULL_TOOL_ID } from './names';
import { pluginContext, t } from './runtime';
import { learn, usePhysicsState } from './state';

const SPEEDS = [0.1, 0.25, 0.5, 1, 2];
const MATERIAL_NAMES = Object.keys(MATERIALS) as (keyof typeof MATERIALS)[];
const REGION_COLOURS: Record<string, string> = {
  water: '#1971c2',
  liquid: '#1098ad',
  tunnel: '#7048e8',
  static: '#868e96',
  kinematic: '#f08c00',
  off: '#ced4da',
};

const context = pluginContext();
const editor = context.editor;
const state = usePhysicsState();
const jointKind = ref<JointKind>(currentJointKind());
/** the simple view by default – the advanced one has every value; the choice is remembered */
const advanced = ref(context.storage.get('advanced', false));
watch(advanced, (value) => context.storage.set('advanced', value));

const text = (event: Event) => (event.target as HTMLInputElement).value;
const checked = (event: Event) => (event.target as HTMLInputElement).checked;
/** a number field: empty removes the value */
const number = (event: Event) => {
  const value = text(event).trim();
  return value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
};
const isBody = (type: BodyType) => !isRegion(type);
const colourOf = (data: BodyData) =>
  data.type === 'dynamic'
    ? MATERIALS[data.material && data.material !== 'custom' ? data.material : 'wood'].colour
    : REGION_COLOURS[data.type];

const settings = computed(() => {
  void editor.ui.revision;
  return settingsOf();
});

const current = computed(() => {
  void editor.ui.revision;
  void editor.ui.selRev;
  void state.revision;
  const instance = selectedInstance();
  return instance ? { instance, data: bodyData(instance) } : null;
});

const list = computed(() => {
  void editor.ui.revision;
  void state.revision;
  return physicsInstances();
});

/** the bodies a joint may hold on to: every other body */
const partners = computed(() =>
  list.value
    .filter((entry) => !isRegion(entry.data.type) && entry.instance !== current.value?.instance)
    .map((entry) => ({ id: entry.instance.id, name: entry.instance.name || entry.instance.definition.name })),
);

const partner = (value: string): JointData['to'] => (value === 'parent' || value === 'world' ? value : Number(value));

const change = (patch: Partial<BodyData>) => {
  if (current.value) {
    resetSim();
    changeBody(current.value.instance, patch);
  }
};

const changeJointAt = (index: number, patch: Partial<JointData>) => {
  if (current.value) {
    resetSim();
    changeJoint(current.value.instance, index, patch);
  }
};

const setType = (type: string) => {
  if (!current.value) {
    return;
  }
  resetSim();
  changeBody(current.value.instance, type ? { type: type as BodyType } : null);
};

const setMotorMode = (index: number, joint: JointData, mode: string) =>
  changeJointAt(index, { motor: mode ? { value: 0, ...joint.motor, mode: mode as 'position' | 'speed' } : undefined });

/** "0:0, 2:90, 4:0" ↔ [[0, 0], [2, 90], [4, 0]] */
const programText = (program?: [number, number][]) => (program ?? []).map(([time, value]) => `${time}:${value}`).join(', ');
const parseProgram = (value: string) => {
  const points = value
    .split(/[,;]/)
    .map((entry) => entry.split(':').map((part) => Number(part.trim())))
    .filter((pair): pair is [number, number] => pair.length === 2 && pair.every(Number.isFinite));
  return points.length ? points : undefined;
};

/** the running joint of the selected body at an index: its key and value now */
const live = (index: number) => {
  void state.time;
  const sim = currentSim();
  if (!sim || !current.value) {
    return null;
  }
  const joint = sim.joints.find((candidate) => candidate.key === `${current.value!.instance.id}:${index}`);
  return joint ? { key: joint.key, value: jointValue(joint) } : null;
};

const toggle = () => {
  if (state.status === 'running') {
    pauseSim();
  } else {
    void startSim();
  }
};

const chooseJointKind = (kind: JointKind) => {
  jointKind.value = kind;
  setJointKind(kind);
};

const useTool = (id: string) => editor.setTool(id);
const reset = () => {
  resetSim();
  learn('reset');
};
const openGuide = () => context.panels.open(GUIDE_PANEL);
const select = (id: number) => editor.select([{ kind: 'instance', id }], 'set');
const redraw = () => editor.redraw();
</script>
