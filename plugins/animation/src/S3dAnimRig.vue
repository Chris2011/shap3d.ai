<template>
  <!-- the rig: the tools, the bone picked (name, side, partner, limits) and the figure's poses -->
  <section class="s3d-an-section">
    <div class="s3d-an-heading">
      <span>{{ t('animation.rig.title') }}</span>
      <label class="s3d-an-check"><input v-model="state.show.bones" type="checkbox" /> {{ t('animation.rig.showBones') }}</label>
    </div>
    <div class="s3d-an-row">
      <button class="s3d-btn" :class="{ primary: editor.ui.tool === JOINT_TOOL_ID }" @click="editor.setTool(JOINT_TOOL_ID)">
        {{ t('animation.tools.joint') }}
      </button>
      <button class="s3d-btn" :class="{ primary: editor.ui.tool === POSE_TOOL_ID }" @click="editor.setTool(POSE_TOOL_ID)">
        {{ t('animation.tools.pose') }}
      </button>
    </div>
    <p v-if="!bone && !root" class="s3d-an-hint">{{ t('animation.rig.hint') }}</p>

    <template v-if="bone && boneData">
      <div class="s3d-an-subheading">{{ t('animation.rig.bone') }}</div>
      <div class="s3d-an-grid two">
        <label class="s3d-an-field">
          <span>{{ t('animation.rig.name') }}</span>
          <input class="s3d-input" :value="boneData.name" @change="rename($event)" @keydown.stop />
        </label>
        <label class="s3d-an-field">
          <span>{{ t('animation.rig.side') }}</span>
          <select class="s3d-input" :value="boneData.side ?? ''" @change="setSide($event)">
            <option value="">{{ t('animation.rig.sideNone') }}</option>
            <option value="L">{{ t('animation.rig.sideLeft') }}</option>
            <option value="R">{{ t('animation.rig.sideRight') }}</option>
          </select>
        </label>
      </div>
      <label class="s3d-an-field">
        <span>{{ t('animation.rig.partner') }}</span>
        <select class="s3d-input" :value="boneData.mirror ?? ''" @change="setPartner($event)">
          <option value="">{{ t('animation.panel.none') }}</option>
          <option v-for="name in partners" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>

      <div class="s3d-an-subheading">{{ t('animation.rig.limits') }}</div>
      <div v-for="channel in LIMIT_CHANNELS" :key="channel" class="s3d-an-row">
        <label class="s3d-an-check s3d-an-limit">
          <input type="checkbox" :checked="!!limitOf(channel)" @change="toggleLimit(channel, $event)" />
          {{ channel.slice(1).toUpperCase() }}
        </label>
        <template v-if="limitOf(channel)">
          <input
            class="s3d-input s3d-an-grow"
            type="number"
            :aria-label="t('animation.rig.limitMin')"
            :title="t('animation.rig.limitMin')"
            :value="limitOf(channel)![0]"
            @change="setLimit(channel, 0, $event)"
            @keydown.stop
          />
          <input
            class="s3d-input s3d-an-grow"
            type="number"
            :aria-label="t('animation.rig.limitMax')"
            :title="t('animation.rig.limitMax')"
            :value="limitOf(channel)![1]"
            @change="setLimit(channel, 1, $event)"
            @keydown.stop
          />
        </template>
        <span v-else class="s3d-an-hint">{{ t('animation.rig.free') }}</span>
      </div>
      <div class="s3d-an-row">
        <button class="s3d-btn" @click="removeBone(bone)">{{ t('animation.rig.removeBone') }}</button>
      </div>
    </template>

    <template v-if="root">
      <div class="s3d-an-subheading">{{ t('animation.rig.poses') }}</div>
      <div v-for="pose in poses" :key="pose.name" class="s3d-an-row">
        <span class="s3d-an-grow s3d-an-name" :title="pose.name">{{ pose.name }}</span>
        <button class="s3d-btn" :title="t('animation.rig.applyHint')" @click="applyPose(root, pose.name)">
          {{ t('animation.rig.apply') }}
        </button>
        <button
          class="s3d-btn"
          :aria-label="t('animation.rig.removePose')"
          :title="t('animation.rig.removePose')"
          @click="removePose(root, pose.name)"
        >
          ×
        </button>
      </div>
      <div class="s3d-an-row">
        <input
          v-model="poseName"
          class="s3d-input s3d-an-grow"
          :aria-label="t('animation.rig.poseName')"
          :placeholder="t('animation.rig.poseName')"
          @keydown.stop
          @keydown.enter="save"
        />
        <button class="s3d-btn" :disabled="!poseName.trim()" @click="save">{{ t('animation.rig.savePose') }}</button>
      </div>
      <div class="s3d-an-row">
        <button class="s3d-btn" :title="t('animation.rig.keyPoseHint')" @click="keyPose(root)">◆ {{ t('animation.rig.keyPose') }}</button>
        <button class="s3d-btn" :title="t('animation.rig.mirrorHint')" @click="mirrorPose(root)">{{ t('animation.rig.mirror') }}</button>
        <button class="s3d-btn" :title="t('animation.rig.restHint')" @click="restPose(root)">{{ t('animation.rig.rest') }}</button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Instance } from '../../../src/core/model';
import { LIMIT_CHANNELS, objectAnimation, type BoneData, type LimitChannel } from './data';
import { selectedInstances } from './keying';
import { JOINT_TOOL_ID, POSE_TOOL_ID } from './names';
import { applyPose, bonesOf, changeBone, keyPose, mirrorPose, removeBone, removePose, restPose, rigRootOf, savePose } from './rig';
import { pluginContext, t } from './runtime';
import { findInstance } from './scene';
import { useAnimationState } from './state';

const editor = pluginContext().editor;
const state = useAnimationState();

// the model is not reactive – the editor bumps these after changes and selections
const tick = () => {
  void state.revision;
  void editor.ui.revision;
  void editor.ui.selRev;
};

/** a selected group is what the panel shows – else the bone picked with the Pose tool */
const current = computed<Instance | null>(() => {
  tick();
  return selectedInstances()[0] ?? (state.bone !== null ? (findInstance(state.bone)?.instance ?? null) : null);
});
const bone = computed(() => (current.value && objectAnimation(current.value)?.bone ? current.value : null));
const boneData = computed<BoneData | undefined>(() => (tick(), bone.value ? objectAnimation(bone.value)?.bone : undefined));
const root = computed(() => (tick(), current.value ? rigRootOf(current.value) : null));
const poses = computed(() => (tick(), root.value ? (objectAnimation(root.value)?.rig?.poses ?? []) : []));
/** the other bones of the figure */
const partners = computed(() => {
  tick();
  return root.value
    ? bonesOf(root.value)
        .map((node) => node.bone.name)
        .filter((name) => name !== boneData.value?.name)
    : [];
});

const inputValue = (event: Event) => (event.target as HTMLInputElement | HTMLSelectElement).value;

const rename = (event: Event) => {
  const name = inputValue(event).trim();
  if (bone.value && name && !partners.value.includes(name)) {
    changeBone(bone.value, { name });
  } else {
    (event.target as HTMLInputElement).value = boneData.value?.name ?? '';
  }
};
const setSide = (event: Event) => {
  if (bone.value) {
    changeBone(bone.value, { side: (inputValue(event) || undefined) as BoneData['side'] });
  }
};
const setPartner = (event: Event) => {
  if (bone.value) {
    changeBone(bone.value, { mirror: inputValue(event) || undefined });
  }
};

const limitOf = (channel: LimitChannel) => boneData.value?.limits?.[channel];
const writeLimits = (change: (limits: NonNullable<BoneData['limits']>) => void) => {
  if (bone.value) {
    const limits = { ...boneData.value?.limits };
    change(limits);
    changeBone(bone.value, { limits });
  }
};
/** on: the joint may turn 45° each way from its rest; off: free */
const toggleLimit = (channel: LimitChannel, event: Event) => {
  const on = (event.target as HTMLInputElement).checked;
  writeLimits((limits) => {
    if (on) {
      limits[channel] = [-45, 45];
    } else {
      delete limits[channel];
    }
  });
};
const setLimit = (channel: LimitChannel, end: 0 | 1, event: Event) => {
  const value = Number(inputValue(event));
  const range = limitOf(channel);
  if (!range || !Number.isFinite(value)) {
    return;
  }
  const next: [number, number] = end === 0 ? [value, Math.max(value, range[1])] : [Math.min(value, range[0]), value];
  writeLimits((limits) => {
    limits[channel] = next;
  });
};

const poseName = ref('');
const save = () => {
  const name = poseName.value.trim();
  if (root.value && name) {
    savePose(root.value, name);
    poseName.value = '';
  }
};
</script>
