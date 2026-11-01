<template>
  <!-- the simple view: play, three steps to a first movement, ready-made movements, a camera and the film -->
  <div class="s3d-an">
    <section class="s3d-an-section">
      <div class="s3d-an-row">
        <button class="s3d-btn primary s3d-an-big" @click="togglePlay">
          {{ state.playing ? '⏸ ' + t('animation.timeline.pause') : '▶ ' + t('animation.timeline.play') }}
        </button>
        <button class="s3d-btn s3d-an-big" @click="jumpTo('start')">⏮ {{ t('animation.basic.toStart') }}</button>
      </div>
      <div class="s3d-an-row between">
        <span class="s3d-an-hint">{{ t('animation.panel.frameOf', { frame: Math.round(state.frame), end: scene.end }) }}</span>
        <button class="s3d-an-link" @click="state.timeline = !state.timeline">
          {{ state.timeline ? t('animation.panel.hideTimeline') : t('animation.panel.showTimeline') }}
        </button>
      </div>
    </section>

    <!-- the way every animation is made: a frame, a place, a key -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.basic.keyTitle') }}</span>
      </div>
      <p class="s3d-an-hint s3d-an-steps" style="white-space: pre-line">{{ t('animation.basic.keySteps') }}</p>
      <div class="s3d-an-row">
        <button class="s3d-btn primary" :disabled="!selected.length" @click="keySelected()">◆ {{ t('animation.basic.keyHere') }}</button>
        <label class="s3d-an-check" :title="t('animation.timeline.autoKeyHint')">
          <input v-model="state.autoKey" type="checkbox" /> {{ t('animation.basic.autoKey') }}
        </label>
      </div>
      <p v-if="!selected.length" class="s3d-an-hint">{{ t('animation.basic.selectFirst') }}</p>
      <p v-else-if="overridden" class="s3d-an-warning">{{ t('animation.basic.notKeyed') }}</p>
    </section>

    <!-- ready-made movements -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.basic.recipes') }}</span>
      </div>
      <div class="s3d-an-choices">
        <button
          v-for="recipe in RECIPES"
          :key="recipe"
          class="s3d-an-choice"
          :disabled="!selected.length"
          @click="applyRecipe(recipe, selected)"
        >
          <span>{{ t(`animation.recipes.${recipe}.name`) }}</span>
          <span>{{ t(`animation.recipes.${recipe}.hint`) }}</span>
        </button>
      </div>
      <div v-if="selected.length" class="s3d-an-row">
        <select v-model="pathId" class="s3d-input s3d-an-grow" :disabled="!paths.length">
          <option value="">{{ paths.length ? t('animation.basic.choosePath') : t('animation.basic.noPath') }}</option>
          <option v-for="entry in paths" :key="entry.instance.id" :value="String(entry.instance.id)">{{ entry.label }}</option>
        </select>
        <button class="s3d-btn" :disabled="!pathId" @click="onPath">{{ t('animation.basic.followPath') }}</button>
      </div>
      <p class="s3d-an-hint">{{ selected.length ? t('animation.basic.recipesHint') : t('animation.basic.selectFirst') }}</p>
      <button v-if="selectedAnimated" class="s3d-an-link" @click="clearSelected">{{ t('animation.basic.clear') }}</button>
    </section>

    <!-- the camera: one where the view is, or a move around the model -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.basic.camera') }}</span>
      </div>
      <div class="s3d-an-choices">
        <button class="s3d-an-choice" @click="keyCamera()">
          <span>🎥 {{ scene.cameras.length ? t('animation.basic.cameraKey') : t('animation.basic.cameraHere') }}</span>
          <span>{{ t('animation.basic.cameraHereHint') }}</span>
        </button>
        <button class="s3d-an-choice" @click="cameraMove('orbit')">
          <span>{{ t('animation.recipes.orbit.name') }}</span>
          <span>{{ t('animation.recipes.orbit.hint') }}</span>
        </button>
        <button class="s3d-an-choice" @click="cameraMove('dolly')">
          <span>{{ t('animation.recipes.dolly.name') }}</span>
          <span>{{ t('animation.recipes.dolly.hint') }}</span>
        </button>
      </div>
      <label v-if="scene.cameras.length" class="s3d-an-check">
        <input type="checkbox" :checked="state.lookThrough" @change="setLookThrough(($event.target as HTMLInputElement).checked)" />
        {{ t('animation.timeline.lookThrough') }}
      </label>
    </section>

    <S3dAnimRender />

    <p class="s3d-an-hint">
      {{ t('animation.basic.more') }}
      <button class="s3d-an-link" @click="emit('advanced')">{{ t('animation.basic.toAdvanced') }}</button>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dAnimRender from './S3dAnimRender.vue';
import { currentScene, overrides } from './apply';
import { objectAnimation } from './data';
import { editObjects, keyCamera, keySelected, selectedInstances } from './keying';
import { jumpTo, setLookThrough, togglePlay } from './player';
import { applyRecipe, cameraMove, followPath, pathGroups, RECIPES } from './recipes';
import { pluginContext, t } from './runtime';
import { useAnimationState } from './state';

const emit = defineEmits<{ advanced: [] }>();

const editor = pluginContext().editor;
const state = useAnimationState();

const tick = () => {
  void state.revision;
  void editor.ui.revision;
  void editor.ui.selRev;
};
const scene = computed(() => (tick(), currentScene()));
const selected = computed(() => (tick(), selectedInstances()));
const selectedAnimated = computed(() => selected.value.some((instance) => objectAnimation(instance)));
/** moved at this frame but not keyed – it jumps back when the frame changes */
const overridden = computed(() => (tick(), void state.frame, selected.value.some((instance) => overrides.has(instance))));

const paths = computed(() => (tick(), pathGroups().filter((entry) => !selected.value.includes(entry.instance))));
const pathId = ref('');
const onPath = () => {
  const curve = paths.value.find((entry) => String(entry.instance.id) === pathId.value)?.instance;
  if (curve) {
    followPath(selected.value, curve);
  }
};

const clearSelected = () =>
  editObjects(t('animation.undo.clear'), selected.value, (animation) => {
    animation.tracks = {};
    delete animation.path;
    delete animation.lookAt;
  });
</script>
