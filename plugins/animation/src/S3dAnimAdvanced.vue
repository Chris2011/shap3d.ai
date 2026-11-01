<template>
  <!-- every value: the scene, the selected group's channels and constraints, cameras and shots, sun, lights, materials -->
  <div class="s3d-an">
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.panel.scene') }}</span>
        <span class="s3d-an-hint">{{ t('animation.panel.frameOf', { frame: Math.round(state.frame), end: scene.end }) }}</span>
      </div>
      <div class="s3d-an-row">
        <button class="s3d-btn primary" @click="togglePlay">
          {{ state.playing ? t('animation.timeline.pause') : t('animation.timeline.play') }}
        </button>
        <button class="s3d-btn" @click="state.timeline = !state.timeline">
          {{ state.timeline ? t('animation.panel.hideTimeline') : t('animation.panel.showTimeline') }}
        </button>
      </div>
      <div class="s3d-an-grid">
        <label class="s3d-an-field">
          <span>{{ t('animation.timeline.start') }}</span>
          <input class="s3d-input" type="number" :value="scene.start" @change="setScene('start', $event)" @keydown.stop />
        </label>
        <label class="s3d-an-field">
          <span>{{ t('animation.timeline.end') }}</span>
          <input class="s3d-input" type="number" :value="scene.end" @change="setScene('end', $event)" @keydown.stop />
        </label>
        <label class="s3d-an-field">
          <span>{{ t('animation.timeline.fps') }}</span>
          <input class="s3d-input" type="number" min="1" max="120" :value="scene.fps" @change="setScene('fps', $event)" @keydown.stop />
        </label>
      </div>
      <div class="s3d-an-row">
        <label class="s3d-an-check"><input v-model="state.autoKey" type="checkbox" /> {{ t('animation.timeline.autoKey') }}</label>
        <label class="s3d-an-check"><input v-model="state.loop" type="checkbox" /> {{ t('animation.timeline.loop') }}</label>
        <label class="s3d-an-check"><input v-model="state.show.paths" type="checkbox" /> {{ t('animation.panel.showPaths') }}</label>
        <label class="s3d-an-check"><input v-model="state.show.cameras" type="checkbox" /> {{ t('animation.panel.showCameras') }}</label>
      </div>
    </section>

    <!-- the selected group -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span class="s3d-an-name">{{ selected ? t('animation.panel.object', { name: objectName }) : t('animation.panel.noObject') }}</span>
        <button v-if="selected" class="s3d-btn" :title="t('animation.timeline.keyHint')" @click="keySelected()">
          ◆ {{ t('animation.timeline.key') }}
        </button>
      </div>
      <template v-if="selected && place">
        <div class="s3d-an-subheading">{{ t('animation.panel.position') }}</div>
        <div class="s3d-an-grid">
          <S3dAnimField
            v-for="channel in ['x', 'y', 'z']"
            :key="channel"
            :label="channel.toUpperCase()"
            :value="place[channel as 'x']"
            :status="status(channel)"
            @change="keyObject({ [channel]: Number($event) })"
            @key="toggleObject([channel])"
          />
        </div>
        <div class="s3d-an-subheading">{{ t('animation.panel.rotation') }}</div>
        <div class="s3d-an-grid">
          <S3dAnimField
            v-for="channel in ['rx', 'ry', 'rz']"
            :key="channel"
            :label="`${channel.slice(1).toUpperCase()} °`"
            :value="place[channel as 'rx']"
            :digits="2"
            :status="status(channel)"
            @change="keyObject({ [channel]: Number($event) })"
            @key="toggleObject([channel])"
          />
        </div>
        <div class="s3d-an-subheading">{{ t('animation.panel.scale') }}</div>
        <div class="s3d-an-grid">
          <S3dAnimField
            v-for="channel in ['sx', 'sy', 'sz']"
            :key="channel"
            :label="channel.slice(1).toUpperCase()"
            :value="place[channel as 'sx']"
            :status="status(channel)"
            @change="keyObject({ [channel]: Number($event) })"
            @key="toggleObject([channel])"
          />
        </div>
        <div class="s3d-an-grid">
          <label class="s3d-an-field">
            <span>
              <button
                type="button"
                class="s3d-an-diamond"
                :class="{ keyed: status('visible') === 'keyed', animated: status('visible') === 'animated' }"
                @click="toggleObject(['visible'])"
              ></button>
              {{ t('animation.channels.visible') }}
            </span>
            <input
              type="checkbox"
              :checked="looks.visible"
              @change="keyObject({ visible: ($event.target as HTMLInputElement).checked ? 1 : 0 })"
            />
          </label>
          <S3dAnimField
            :label="t('animation.panel.color')"
            type="color"
            :value="looks.color"
            :status="status('r')"
            @change="keyObject(fromHex(String($event)))"
            @key="toggleObject(['r', 'g', 'b'])"
          />
          <S3dAnimField
            :label="t('animation.channels.opacity')"
            :value="looks.opacity"
            :step="0.05"
            :min="0"
            :max="1"
            :digits="2"
            :status="status('opacity')"
            @change="keyObject({ opacity: Number($event) })"
            @key="toggleObject(['opacity'])"
          />
        </div>

        <div class="s3d-an-subheading">{{ t('animation.panel.pivot') }}</div>
        <div class="s3d-an-row">
          <select class="s3d-input s3d-an-grow" :value="pivotKind" @change="setPivot(($event.target as HTMLSelectElement).value)">
            <option value="center">{{ t('animation.pivot.center') }}</option>
            <option value="bottom">{{ t('animation.pivot.bottom') }}</option>
            <option value="origin">{{ t('animation.pivot.origin') }}</option>
          </select>
        </div>

        <div class="s3d-an-subheading">{{ t('animation.panel.path') }}</div>
        <div class="s3d-an-row">
          <select
            class="s3d-input s3d-an-grow"
            :value="animation?.path?.curve ?? ''"
            @change="setPath(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('animation.panel.none') }}</option>
            <option v-for="entry in paths" :key="entry.instance.id" :value="entry.instance.id">{{ entry.label }}</option>
          </select>
        </div>
        <div v-if="animation?.path" class="s3d-an-row">
          <label class="s3d-an-check">
            <input
              type="checkbox"
              :checked="animation.path.follow"
              @change="changePath({ follow: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('animation.panel.follow') }}
          </label>
          <select
            class="s3d-input"
            :value="animation.path.axis ?? '+x'"
            @change="changePath({ axis: ($event.target as HTMLSelectElement).value as Axis })"
          >
            <option v-for="axis in AXES" :key="axis" :value="axis">{{ t('animation.panel.front', { axis }) }}</option>
          </select>
        </div>
        <p v-if="!paths.length" class="s3d-an-hint">{{ t('animation.panel.pathHint') }}</p>

        <div class="s3d-an-subheading">{{ t('animation.panel.lookAt') }}</div>
        <div class="s3d-an-row">
          <select
            class="s3d-input s3d-an-grow"
            :value="animation?.lookAt?.target ?? ''"
            @change="setLookAt(($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('animation.panel.none') }}</option>
            <option v-for="entry in others" :key="entry.instance.id" :value="entry.instance.id">{{ entry.label }}</option>
          </select>
          <select
            v-if="animation?.lookAt"
            class="s3d-input"
            :value="animation.lookAt.axis ?? '+x'"
            @change="changeLookAt(($event.target as HTMLSelectElement).value as Axis)"
          >
            <option v-for="axis in AXES" :key="axis" :value="axis">{{ t('animation.panel.front', { axis }) }}</option>
          </select>
        </div>
        <p class="s3d-an-hint">{{ t('animation.panel.parentHint') }}</p>
        <div class="s3d-an-row">
          <button v-if="animation" class="s3d-btn" @click="clearObject">{{ t('animation.panel.clearObject') }}</button>
        </div>
      </template>
      <p v-else class="s3d-an-hint">{{ t('animation.panel.selectHint') }}</p>
    </section>

    <!-- cameras and the shots that cut between them -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.panel.cameras') }}</span>
        <button class="s3d-btn" :title="t('animation.panel.addCameraHint')" @click="addCamera()">
          + {{ t('animation.panel.addCamera') }}
        </button>
      </div>
      <label class="s3d-an-check">
        <input type="checkbox" :checked="state.lookThrough" @change="setLookThrough(($event.target as HTMLInputElement).checked)" />
        {{ t('animation.timeline.lookThrough') }}
      </label>
      <div v-for="camera in scene.cameras" :key="camera.id" class="s3d-an-section" style="padding-bottom: 0.5rem">
        <div class="s3d-an-row between">
          <input class="s3d-input s3d-an-grow" :value="camera.name" @change="renameCamera(camera.id, $event)" @keydown.stop />
          <span v-if="activeId === camera.id" class="s3d-an-hint">🎥</span>
        </div>
        <div class="s3d-an-row">
          <button class="s3d-btn" :title="t('animation.panel.keyCameraHint')" @click="keyCamera(camera.id)">
            ◆ {{ t('animation.panel.keyCamera') }}
          </button>
          <button class="s3d-btn" @click="viewCamera(camera.id)">{{ t('animation.panel.viewCamera') }}</button>
          <button class="s3d-btn" @click="removeCamera(camera.id)">{{ t('animation.panel.remove') }}</button>
        </div>
        <div class="s3d-an-grid two">
          <S3dAnimField
            :label="t('animation.channels.camera.lens')"
            :value="cameraValue(camera.id, 'lens')"
            :step="1"
            :digits="1"
            :status="cameraStatus(camera.id, 'lens')"
            @change="keyValues(`cam:${camera.id}`, frame, { lens: Number($event) })"
            @key="
              toggleKeys(`cam:${camera.id}`, frame, { lens: cameraValue(camera.id, 'lens') }, cameraStatus(camera.id, 'lens') === 'keyed')
            "
          />
          <label class="s3d-an-field">
            <span>{{ t('animation.panel.cameraLooksAt') }}</span>
            <select
              class="s3d-input"
              :value="camera.lookAt ?? ''"
              @change="setCameraLookAt(camera.id, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('animation.panel.itsTarget') }}</option>
              <option v-for="entry in groups" :key="entry.instance.id" :value="entry.instance.id">{{ entry.label }}</option>
            </select>
          </label>
        </div>
        <label class="s3d-an-field">
          <span>{{ t('animation.panel.cameraPath') }}</span>
          <select
            class="s3d-input"
            :value="camera.path?.curve ?? ''"
            @change="setCameraPath(camera.id, ($event.target as HTMLSelectElement).value)"
          >
            <option value="">{{ t('animation.panel.none') }}</option>
            <option v-for="entry in paths" :key="entry.instance.id" :value="entry.instance.id">{{ entry.label }}</option>
          </select>
        </label>
      </div>
      <p v-if="!scene.cameras.length" class="s3d-an-hint">{{ t('animation.panel.noCameras') }}</p>

      <div class="s3d-an-subheading">{{ t('animation.panel.shots') }}</div>
      <div v-for="shot in shots" :key="shot.id" class="s3d-an-row">
        <input
          class="s3d-input"
          style="width: 3.75rem"
          type="number"
          :value="shot.frame"
          :title="t('animation.timeline.frame')"
          @change="changeShot(shot.id, { frame: Number(($event.target as HTMLInputElement).value) })"
          @keydown.stop
        />
        <select
          class="s3d-input s3d-an-grow"
          :value="shot.camera"
          @change="changeShot(shot.id, { camera: ($event.target as HTMLSelectElement).value })"
        >
          <option v-for="camera in scene.cameras" :key="camera.id" :value="camera.id">{{ camera.name }}</option>
        </select>
        <button class="s3d-btn" :title="t('animation.panel.remove')" @click="removeShot(shot.id)">✕</button>
      </div>
      <button class="s3d-btn" :disabled="!scene.cameras.length" :title="t('animation.panel.addShotHint')" @click="addShot">
        + {{ t('animation.panel.addShot', { frame }) }}
      </button>
    </section>

    <!-- the sun and the lights -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.sun.title') }}</span>
      </div>
      <div class="s3d-an-grid two">
        <S3dAnimField
          :label="t('animation.channels.hour')"
          :value="sunValue('hour')"
          :step="0.25"
          :min="0"
          :max="24"
          :digits="2"
          :status="sunStatus('hour')"
          @change="keyValues('sun', frame, { hour: Number($event) })"
          @key="toggleKeys('sun', frame, { hour: sunValue('hour') }, sunStatus('hour') === 'keyed')"
        />
        <S3dAnimField
          :label="t('animation.channels.daylight')"
          :value="sunValue('daylight')"
          :step="0.05"
          :min="0"
          :max="1"
          :digits="2"
          :status="sunStatus('daylight')"
          @change="keyValues('sun', frame, { daylight: Number($event) })"
          @key="toggleKeys('sun', frame, { daylight: sunValue('daylight') }, sunStatus('daylight') === 'keyed')"
        />
      </div>
      <p class="s3d-an-hint">{{ t('animation.sun.hint') }}</p>

      <div class="s3d-an-heading">
        <span>{{ t('animation.panel.lights') }}</span>
        <span class="s3d-an-row">
          <button class="s3d-btn" @click="addLight('point')">+ {{ t('animation.light.point') }}</button>
          <button class="s3d-btn" @click="addLight('spot')">+ {{ t('animation.light.spot') }}</button>
        </span>
      </div>
      <div v-for="light in lights" :key="light.light.id" class="s3d-an-section" style="padding-bottom: 0.5rem">
        <div class="s3d-an-row between">
          <b class="s3d-an-name">{{ light.light.name }}</b>
          <button class="s3d-btn" @click="removeLight(light.light.id)">{{ t('animation.panel.remove') }}</button>
        </div>
        <div class="s3d-an-grid">
          <S3dAnimField
            v-for="(channel, index) in ['x', 'y', 'z']"
            :key="channel"
            :label="channel.toUpperCase()"
            :value="light.position[index]"
            :status="lightStatus(light.light.id, channel)"
            @change="keyValues(`light:${light.light.id}`, frame, { [channel]: Number($event) })"
            @key="
              toggleKeys(
                `light:${light.light.id}`,
                frame,
                { [channel]: light.position[index] },
                lightStatus(light.light.id, channel) === 'keyed',
              )
            "
          />
        </div>
        <div class="s3d-an-grid">
          <S3dAnimField
            :label="t('animation.channels.light.intensity')"
            :value="light.intensity"
            :step="0.1"
            :min="0"
            :digits="2"
            :status="lightStatus(light.light.id, 'intensity')"
            @change="keyValues(`light:${light.light.id}`, frame, { intensity: Number($event) })"
            @key="
              toggleKeys(
                `light:${light.light.id}`,
                frame,
                { intensity: light.intensity },
                lightStatus(light.light.id, 'intensity') === 'keyed',
              )
            "
          />
          <S3dAnimField
            :label="t('animation.panel.color')"
            type="color"
            :value="toHex(...light.color)"
            :status="lightStatus(light.light.id, 'r')"
            @change="keyValues(`light:${light.light.id}`, frame, fromHex(String($event)))"
            @key="
              toggleKeys(
                `light:${light.light.id}`,
                frame,
                { r: light.color[0], g: light.color[1], b: light.color[2] },
                lightStatus(light.light.id, 'r') === 'keyed',
              )
            "
          />
          <label class="s3d-an-field">
            <span>{{ t('animation.light.range') }}</span>
            <input
              class="s3d-input"
              type="number"
              min="0.5"
              step="0.5"
              :value="light.light.range"
              @change="changeLight(light.light.id, { range: Number(($event.target as HTMLInputElement).value) })"
              @keydown.stop
            />
          </label>
        </div>
        <div class="s3d-an-row">
          <label class="s3d-an-check">
            <input
              type="checkbox"
              :checked="light.light.shadow"
              @change="changeLight(light.light.id, { shadow: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('animation.light.shadow') }}
          </label>
          <button class="s3d-btn" :title="t('animation.light.hereHint')" @click="lightHere(light.light.id)">
            {{ t('animation.light.here') }}
          </button>
        </div>
      </div>
    </section>

    <!-- material colours over time -->
    <section class="s3d-an-section">
      <div class="s3d-an-heading">
        <span>{{ t('animation.panel.materials') }}</span>
      </div>
      <select v-model="materialName" class="s3d-input">
        <option value="">{{ t('animation.panel.chooseMaterial') }}</option>
        <option v-for="material in editor.model.materials" :key="material.name" :value="material.name">{{ material.name }}</option>
      </select>
      <div v-if="materialName && materialLook" class="s3d-an-grid two">
        <S3dAnimField
          :label="t('animation.panel.color')"
          type="color"
          :value="materialLook.color"
          :status="materialStatus('r')"
          @change="keyValues(`mat:${materialName}`, frame, fromHex(String($event)))"
          @key="toggleKeys(`mat:${materialName}`, frame, fromHex(materialLook.color), materialStatus('r') === 'keyed')"
        />
        <S3dAnimField
          :label="t('animation.channels.opacity')"
          :value="materialLook.opacity"
          :step="0.05"
          :min="0"
          :max="1"
          :digits="2"
          :status="materialStatus('opacity')"
          @change="keyValues(`mat:${materialName}`, frame, { opacity: Number($event) })"
          @key="toggleKeys(`mat:${materialName}`, frame, { opacity: materialLook.opacity }, materialStatus('opacity') === 'keyed')"
        />
      </div>
      <p class="s3d-an-hint">{{ t('animation.panel.materialHint') }}</p>
    </section>

    <S3dAnimRender advanced />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import S3dAnimField from './S3dAnimField.vue';
import S3dAnimRender from './S3dAnimRender.vue';
import { currentPose, currentScene, overrides } from './apply';
import { evaluate } from './curves';
import { newId, objectAnimation, type Axis, type LightAnimation, type ObjectAnimation, type Tracks } from './data';
import { fromHex, keyValues, statusOf, toggleKeys, toHex } from './fields';
import { addCamera, editObjects, editScene, keyCamera, keySelected, selectedInstances } from './keying';
import { activeCamera, placementAt, placementOf } from './pose';
import { pathGroups, allGroups } from './recipes';
import { pluginContext, t, THREE } from './runtime';
import { boxOf, pivotOf } from './scene';
import { setFrame, setLookThrough, togglePlay } from './player';
import { useAnimationState } from './state';

const AXES: Axis[] = ['+x', '-x', '+y', '-y'];

const context = pluginContext();
const editor = context.editor;
const state = useAnimationState();

// the model is not reactive – the editor bumps these after changes and selections
const tick = () => {
  void state.revision;
  void editor.ui.revision;
  void editor.ui.selRev;
};
const scene = computed(() => (tick(), currentScene()));
const frame = computed(() => Math.round(state.frame));

const setScene = (what: 'start' | 'end' | 'fps', event: Event) => {
  const value = Math.round(Number((event.target as HTMLInputElement).value));
  if (!Number.isFinite(value)) {
    return;
  }
  editScene(t('animation.undo.range'), (edited) => {
    if (what === 'fps') {
      edited.fps = Math.max(1, Math.min(120, value));
    } else if (what === 'start') {
      edited.start = Math.min(value, edited.end - 1);
    } else {
      edited.end = Math.max(value, edited.start + 1);
    }
  });
};

// ------------------------------------------------------------ the selected group

const selected = computed(() => (tick(), selectedInstances()[0] ?? null));
const animation = computed<ObjectAnimation | undefined>(() => (tick(), selected.value ? objectAnimation(selected.value) : undefined));
const objectName = computed(() => selected.value?.name || selected.value?.definition.name || '');
const owner = computed(() => `obj:${selected.value?.id}`);

/** its place as shown at this frame */
const place = computed(() => {
  tick();
  void state.frame;
  const instance = selected.value;
  if (!instance) {
    return null;
  }
  const override = overrides.get(instance);
  return override ? placementOf(override, pivotOf(instance, animation.value)) : placementAt(instance, animation.value, frame.value);
});

const value = (tracks: Tracks | undefined, channel: string, fallback: number) =>
  tracks?.[channel]?.keys.length ? evaluate(tracks[channel]!, state.frame, channel) : fallback;

const looks = computed(() => {
  tick();
  const tracks = animation.value?.tracks;
  return {
    visible: value(tracks, 'visible', 1) >= 0.5,
    color: toHex(value(tracks, 'r', 1), value(tracks, 'g', 1), value(tracks, 'b', 1)),
    opacity: value(tracks, 'opacity', 1),
  };
});

const status = (channel: string) => (tick(), statusOf(animation.value?.tracks, channel, frame.value));

const keyObject = (values: Record<string, number>) => keyValues(owner.value, frame.value, values);

/** the diamond of a value group: keys what is shown, or takes the keys at this frame away */
const toggleObject = (channels: string[]) => {
  const shown: Record<string, number> = {};
  for (const channel of channels) {
    if (channel in (place.value ?? {})) {
      shown[channel] = place.value![channel as 'x'];
    } else if (channel === 'visible') {
      shown.visible = looks.value.visible ? 1 : 0;
    } else if (channel === 'opacity') {
      shown.opacity = looks.value.opacity;
    } else {
      Object.assign(shown, fromHex(looks.value.color));
    }
  }
  toggleKeys(owner.value, frame.value, shown, status(channels[0]) === 'keyed');
};

const pivotKind = computed(() => {
  const pivot = animation.value?.pivot;
  if (!pivot) {
    return 'center';
  }
  return pivot.every((part) => part === 0) ? 'origin' : 'bottom';
});

/** the point it turns about: the middle of its box, the middle of its bottom, or its own origin */
const setPivot = (kind: string) => {
  const instance = selected.value;
  if (!instance) {
    return;
  }
  const box = boxOf(instance.definition.entities);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  editObjects(t('animation.undo.pivot'), [instance], (edited) => {
    // the keyed places stay where they are: the keys are moved by how far the pivot moves
    const before = pivotOf(instance, edited);
    const pivot: [number, number, number] | undefined =
      kind === 'origin' ? [0, 0, 0] : kind === 'bottom' ? [center.x, center.y, box.isEmpty() ? 0 : box.min.z] : undefined;
    const after = pivot ?? (center.toArray() as [number, number, number]);
    const shift = new THREE.Vector3(...after).sub(new THREE.Vector3(...before));
    for (const [index, channel] of ['x', 'y', 'z'].entries()) {
      for (const key of edited.tracks[channel]?.keys ?? []) {
        // exact for groups that are not turned or scaled
        key.value += shift.getComponent(index);
      }
    }
    if (pivot) {
      edited.pivot = pivot;
    } else {
      delete edited.pivot;
    }
  });
};

const paths = computed(() => (tick(), pathGroups().filter((entry) => entry.instance !== selected.value)));
const groups = computed(() => (tick(), allGroups()));
const others = computed(() => groups.value.filter((entry) => entry.instance !== selected.value));

const setPath = (id: string) => {
  const instance = selected.value;
  if (!instance) {
    return;
  }
  const curve = paths.value.find((entry) => String(entry.instance.id) === id)?.instance;
  editObjects(t('animation.undo.path'), [instance], (edited) => {
    if (!curve) {
      delete edited.path;
      delete edited.tracks.path;
      return;
    }
    edited.path = { curve: curve.id, follow: true };
    if (!edited.tracks.path?.keys.length) {
      edited.tracks.path = {
        keys: [
          { frame: scene.value.start, value: 0, interp: 'ease-in-out' },
          { frame: scene.value.end, value: 1, interp: 'ease-in-out' },
        ],
      };
    }
  });
};
const changePath = (change: { follow?: boolean; axis?: Axis }) => {
  if (selected.value) {
    editObjects(t('animation.undo.path'), [selected.value], (edited) => {
      if (edited.path) {
        Object.assign(edited.path, change);
      }
    });
  }
};
const setLookAt = (id: string) => {
  if (selected.value) {
    editObjects(t('animation.undo.lookAt'), [selected.value], (edited) => {
      if (id) {
        edited.lookAt = { target: Number(id), axis: edited.lookAt?.axis };
      } else {
        delete edited.lookAt;
      }
    });
  }
};
const changeLookAt = (axis: Axis) => {
  if (selected.value) {
    editObjects(t('animation.undo.lookAt'), [selected.value], (edited) => {
      if (edited.lookAt) {
        edited.lookAt.axis = axis;
      }
    });
  }
};
const clearObject = () => {
  if (selected.value) {
    editObjects(t('animation.undo.clear'), [selected.value], (edited) => {
      edited.tracks = {};
      delete edited.path;
      delete edited.lookAt;
      delete edited.pivot;
    });
  }
};

// ------------------------------------------------------------ cameras and shots

const activeId = computed(() => activeCamera(scene.value, state.frame)?.id);
const cameraTracks = (id: string) => scene.value.cameras.find((camera) => camera.id === id)?.tracks;
const cameraValue = (id: string, channel: string) => (void state.frame, value(cameraTracks(id), channel, 50));
const cameraStatus = (id: string, channel: string) => statusOf(cameraTracks(id), channel, frame.value);

const renameCamera = (id: string, event: Event) => {
  const name = (event.target as HTMLInputElement).value.trim();
  if (name) {
    editScene(t('animation.undo.camera'), (edited) => {
      const camera = edited.cameras.find((entry) => entry.id === id);
      if (camera) {
        camera.name = name;
      }
    });
  }
};
const removeCamera = (id: string) => {
  editScene(t('animation.undo.camera'), (edited) => {
    edited.cameras = edited.cameras.filter((camera) => camera.id !== id);
    edited.shots = edited.shots.filter((shot) => shot.camera !== id);
  });
};
/** looks through a camera: shows the frame of its first shot, or its view now */
const viewCamera = (id: string) => {
  const shot = [...scene.value.shots].sort((a, b) => a.frame - b.frame).find((entry) => entry.camera === id);
  if (shot && activeCamera(scene.value, state.frame)?.id !== id) {
    setFrame(shot.frame);
  }
  setLookThrough(true);
};
const setCameraLookAt = (id: string, target: string) => {
  editScene(t('animation.undo.camera'), (edited) => {
    const camera = edited.cameras.find((entry) => entry.id === id);
    if (camera) {
      camera.lookAt = target ? Number(target) : undefined;
    }
  });
};
const setCameraPath = (id: string, curve: string) => {
  editScene(t('animation.undo.camera'), (edited) => {
    const camera = edited.cameras.find((entry) => entry.id === id);
    if (!camera) {
      return;
    }
    if (!curve) {
      delete camera.path;
      delete camera.tracks.path;
      return;
    }
    camera.path = { curve: Number(curve), follow: false };
    camera.tracks.path ??= {
      keys: [
        { frame: edited.start, value: 0, interp: 'ease-in-out' },
        { frame: edited.end, value: 1, interp: 'ease-in-out' },
      ],
    };
  });
};

const shots = computed(() => [...scene.value.shots].sort((a, b) => a.frame - b.frame));
const addShot = () => {
  editScene(t('animation.undo.shot'), (edited) => {
    const camera = activeCamera(edited, state.frame) ?? edited.cameras[0];
    // the next camera after the one seen now – a cut
    const index = edited.cameras.indexOf(camera);
    const next = edited.cameras[(index + 1) % edited.cameras.length];
    edited.shots = edited.shots.filter((shot) => shot.frame !== frame.value);
    edited.shots.push({ id: newId(), name: next.name, frame: frame.value, camera: next.id });
  });
};
const changeShot = (id: string, change: { frame?: number; camera?: string }) => {
  editScene(t('animation.undo.shot'), (edited) => {
    const shot = edited.shots.find((entry) => entry.id === id);
    if (shot) {
      Object.assign(shot, change);
    }
  });
};
const removeShot = (id: string) => {
  editScene(t('animation.undo.shot'), (edited) => {
    edited.shots = edited.shots.filter((shot) => shot.id !== id);
  });
};

// ------------------------------------------------------------ sun and lights

const sunValue = (channel: 'hour' | 'daylight') => (
  void state.frame,
  value(scene.value.sun.tracks, channel, channel === 'hour' ? editor.model.settings.shadowHour : 1)
);
const sunStatus = (channel: string) => statusOf(scene.value.sun.tracks, channel, frame.value);

const lights = computed(() => {
  tick();
  void state.frame;
  return currentPose()?.lights ?? [];
});
const lightTracks = (id: string) => scene.value.lights.find((light) => light.id === id)?.tracks;
const lightStatus = (id: string, channel: string) => statusOf(lightTracks(id), channel, frame.value);

/** a new lamp where the view looks (its target), keyed at this frame */
const addLight = (kind: 'point' | 'spot') => {
  const view = editor.viewer.rig.getState();
  editScene(t('animation.undo.light'), (edited) => {
    const light: LightAnimation = {
      id: newId(),
      name: t(kind === 'point' ? 'animation.light.pointName' : 'animation.light.spotName', { number: edited.lights.length + 1 }),
      kind,
      range: 10,
      angle: 30,
      shadow: false,
      tracks: {},
    };
    const at = kind === 'spot' ? view.position : [view.target[0], view.target[1], view.target[2] + 2];
    const values: Record<string, number> = { x: at[0], y: at[1], z: at[2], intensity: 1, r: 1, g: 0.9, b: 0.75 };
    if (kind === 'spot') {
      Object.assign(values, { tx: view.target[0], ty: view.target[1], tz: view.target[2] });
    }
    for (const [channel, number] of Object.entries(values)) {
      light.tracks[channel] = { keys: [{ frame: frame.value, value: Math.round(number * 1000) / 1000, interp: 'bezier' }] };
    }
    edited.lights.push(light);
  });
};
/** keys a lamp where the view is (a spot at the eye, shining at the target) */
const lightHere = (id: string) => {
  const view = editor.viewer.rig.getState();
  const light = scene.value.lights.find((entry) => entry.id === id);
  if (!light) {
    return;
  }
  const at = light.kind === 'spot' ? view.position : [view.target[0], view.target[1], view.target[2] + 2];
  const values: Record<string, number> = { x: at[0], y: at[1], z: at[2] };
  if (light.kind === 'spot') {
    Object.assign(values, { tx: view.target[0], ty: view.target[1], tz: view.target[2] });
  }
  keyValues(`light:${id}`, frame.value, values);
};
const changeLight = (id: string, change: Partial<LightAnimation>) => {
  editScene(t('animation.undo.light'), (edited) => {
    const light = edited.lights.find((entry) => entry.id === id);
    if (light) {
      Object.assign(light, change);
    }
  });
};
const removeLight = (id: string) => {
  editScene(t('animation.undo.light'), (edited) => {
    edited.lights = edited.lights.filter((light) => light.id !== id);
  });
};

// ------------------------------------------------------------ materials

const materialName = ref('');
const materialStatus = (channel: string) => statusOf(scene.value.materials[materialName.value]?.tracks, channel, frame.value);
const materialLook = computed(() => {
  tick();
  void state.frame;
  const material = editor.model.materials.find((entry) => entry.name === materialName.value);
  if (!material) {
    return null;
  }
  const own = fromHex(material.color.length === 7 ? material.color : '#ffffff');
  const tracks = scene.value.materials[materialName.value]?.tracks;
  return {
    color: toHex(value(tracks, 'r', own.r), value(tracks, 'g', own.g), value(tracks, 'b', own.b)),
    opacity: value(tracks, 'opacity', material.opacity ?? 1),
  };
});
</script>
