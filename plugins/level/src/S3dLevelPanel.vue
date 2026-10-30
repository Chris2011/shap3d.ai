<template>
  <div class="s3d-lv">
    <!-- placing: choose a kind, then click in the 3D view -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.panel.place') }}</div>
      <template v-for="group in KIND_GROUPS" :key="group">
        <div class="s3d-lv-subheading">{{ t(`level.groups.${group}`) }}</div>
        <div class="s3d-lv-kinds">
          <button
            v-for="spec in KIND_LIST.filter((candidate) => candidate.group === group)"
            :key="spec.kind"
            class="s3d-lv-kind"
            :class="{ active: state.placing === spec.kind }"
            :style="{ '--s3d-lv-colour': spec.colour }"
            @click="choose(spec.kind)"
          >
            <span class="s3d-lv-swatch" />
            {{ t(`level.kinds.${spec.kind}`) }}
          </button>
        </div>
      </template>
      <p class="s3d-lv-hint">{{ state.placing ? t('level.panel.placingHint') : t('level.panel.placeHint') }}</p>
    </section>

    <!-- the selected object -->
    <section v-if="current" class="s3d-lv-section">
      <div class="s3d-lv-heading">
        <span class="s3d-lv-inline"
          ><span class="s3d-lv-swatch" :style="{ '--s3d-lv-colour': KINDS[current.kind].colour }" />{{
            t(`level.kinds.${current.kind}`)
          }}</span
        >
      </div>
      <label class="s3d-lv-field">
        <span>{{ t('level.panel.name') }}</span>
        <input class="s3d-input" :value="current.instance.name" @change="renameObject(current, text($event))" />
      </label>
      <label class="s3d-lv-field">
        <span>{{ t('level.panel.id') }}</span>
        <input class="s3d-input" :value="current.id" @change="setObjectId(current, text($event).trim())" />
      </label>
      <label v-for="spec in KINDS[current.kind].props" :key="spec.name" class="s3d-lv-field" :class="{ check: spec.type === 'boolean' }">
        <input
          v-if="spec.type === 'boolean'"
          type="checkbox"
          :checked="!!current.props[spec.name]"
          @change="setProp(current, spec.name, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ t(`level.props.${spec.name}`) }}</span>
        <input
          v-if="spec.type === 'text'"
          class="s3d-input"
          :value="current.props[spec.name]"
          @change="setProp(current, spec.name, text($event))"
        />
        <input
          v-else-if="spec.type === 'number'"
          class="s3d-input"
          type="number"
          step="any"
          :value="current.props[spec.name]"
          @change="setProp(current, spec.name, Number(text($event)) || 0)"
        />
        <input
          v-else-if="spec.type === 'color'"
          class="s3d-input s3d-lv-colour"
          type="color"
          :value="current.props[spec.name]"
          @change="setProp(current, spec.name, text($event))"
        />
        <select
          v-else-if="spec.type === 'choice'"
          class="s3d-input"
          :value="current.props[spec.name]"
          @change="setProp(current, spec.name, text($event))"
        >
          <option v-for="option in spec.options" :key="option" :value="option">{{ t(`level.options.${option}`) }}</option>
        </select>
        <select
          v-else-if="spec.type === 'target'"
          class="s3d-input"
          :value="current.props[spec.name]"
          @change="setProp(current, spec.name, text($event))"
        >
          <option value="">–</option>
          <option v-for="target in targetsFor(spec.targets ?? 'any', current)" :key="target.id" :value="target.id">
            {{ targetLabel(target) }}
          </option>
        </select>
      </label>
      <p v-if="KINDS[current.kind].volume" class="s3d-lv-hint">{{ t('level.panel.volumeSize', { size: sizeText(current) }) }}</p>

      <!-- what it sets off: open a door, switch the camera, let enemies come … -->
      <template v-if="KINDS[current.kind].actions">
        <div class="s3d-lv-subheading">{{ t(current.kind === 'pickup' ? 'level.panel.actionsPickup' : 'level.panel.actionsTrigger') }}</div>
        <div v-for="(action, index) in current.actions" :key="index" class="s3d-lv-action">
          <select class="s3d-input" :value="action.do" @change="changeAction(index, { do: text($event) as ActionKind })">
            <option v-for="spec in ACTIONS" :key="spec.do" :value="spec.do">{{ t(`level.actions.${spec.do}`) }}</option>
          </select>
          <select
            v-if="actionSpec(action.do).targets"
            class="s3d-input"
            :value="action.target"
            @change="changeAction(index, { target: text($event) })"
          >
            <option value="">–</option>
            <option v-for="target in targetsFor(actionSpec(action.do).targets!, current)" :key="target.id" :value="target.id">
              {{ targetLabel(target) }}
            </option>
          </select>
          <input
            v-if="actionSpec(action.do).value"
            class="s3d-input"
            :value="action.value"
            :placeholder="t(`level.panel.${action.do}Placeholder`)"
            @change="changeAction(index, { value: text($event) })"
          />
          <button class="s3d-lv-remove" :title="t('level.panel.removeAction')" @click="removeAction(index)">✕</button>
        </div>
        <button class="s3d-btn small" @click="addAction">{{ t('level.panel.addAction') }}</button>
      </template>
    </section>
    <p v-else-if="selectedCount > 1" class="s3d-lv-hint">{{ t('level.panel.several', { count: selectedCount }) }}</p>

    <!-- every object of the level -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.panel.objects', { count: objects.length }) }}</div>
      <p v-if="!objects.length" class="s3d-lv-hint">{{ t('level.panel.empty') }}</p>
      <template v-for="group in groups" :key="group.kind">
        <div class="s3d-lv-subheading">{{ t(`level.kinds.${group.kind}`) }} · {{ group.objects.length }}</div>
        <button
          v-for="object in group.objects"
          :key="object.instance.id"
          class="s3d-lv-entry"
          :class="{ active: selectedIds.has(object.instance.id) }"
          @click="selectObjects([object.instance])"
        >
          <span class="s3d-lv-swatch" :style="{ '--s3d-lv-colour': KINDS[object.kind].colour }" />
          <span class="s3d-lv-entry-name">{{ object.instance.name || object.id }}</span>
          <span class="s3d-lv-entry-id">{{ object.id }}</span>
        </button>
      </template>
      <button
        v-for="(problem, index) in problems"
        :key="index"
        class="s3d-lv-warning"
        :disabled="!problem.object"
        @click="problem.object && selectObjects([problem.object.instance])"
      >
        {{ problem.text }}
      </button>
      <!-- the walking grid: what the player gets to from the start (shown in the view until the model changes) -->
      <button class="s3d-btn small" :disabled="!objects.length" @click="toggleNav()">
        {{ nav ? t('level.panel.navHide') : t('level.panel.navCheck') }}
      </button>
      <template v-if="nav">
        <p class="s3d-lv-hint">{{ t('level.panel.navSummary', { reached: nav.reached, cells: nav.cells }) }}</p>
        <button
          v-for="(problem, index) in nav.problems"
          :key="`nav-${index}`"
          class="s3d-lv-warning"
          :disabled="!problem.object"
          @click="problem.object && selectObjects([problem.object.instance])"
        >
          {{ problem.text }}
        </button>
      </template>
    </section>

    <!-- light and atmosphere: daylight, fog, shown while editing -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.atmosphere.title') }}</div>
      <label class="s3d-lv-field">
        <span>{{ t('level.atmosphere.daylight', { percent: Math.round(atmosphere.daylight * 100) }) }}</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="atmosphere.daylight"
          @change="setAtmosphere({ daylight: Number(text($event)) })"
        />
      </label>
      <label class="s3d-lv-field check">
        <input type="checkbox" :checked="atmosphere.fog" @change="setAtmosphere({ fog: checked($event) })" />
        <span>{{ t('level.atmosphere.fog') }}</span>
      </label>
      <div v-if="atmosphere.fog" class="s3d-lv-grid">
        <label class="s3d-lv-field">
          <span>{{ t('level.atmosphere.fogColor') }}</span>
          <input
            class="s3d-input s3d-lv-colour"
            type="color"
            :value="atmosphere.fogColor"
            @change="setAtmosphere({ fogColor: text($event) })"
          />
        </label>
        <label class="s3d-lv-field">
          <span>{{ t('level.atmosphere.fogNear') }}</span>
          <input
            class="s3d-input"
            type="number"
            step="1"
            :value="atmosphere.fogNear"
            @change="setAtmosphere({ fogNear: Number(text($event)) || 0 })"
          />
        </label>
        <label class="s3d-lv-field">
          <span>{{ t('level.atmosphere.fogFar') }}</span>
          <input
            class="s3d-input"
            type="number"
            step="1"
            :value="atmosphere.fogFar"
            @change="setAtmosphere({ fogFar: Number(text($event)) || 1 })"
          />
        </label>
      </div>
      <label class="s3d-lv-field check">
        <input type="checkbox" :checked="atmosphere.preview" @change="setAtmosphere({ preview: checked($event) })" />
        <span>{{ t('level.atmosphere.preview') }}</span>
      </label>
      <p class="s3d-lv-hint">{{ t('level.atmosphere.hint') }}</p>
    </section>

    <!-- the sound files the test run plays by name -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.sounds.title') }}</div>
      <div v-for="sound in sounds" :key="sound.path" class="s3d-lv-row">
        <span class="s3d-lv-entry-name">{{ soundName(sound.path) }}</span>
        <span class="s3d-lv-entry-id">{{ Math.ceil(sound.size / 1024) }} KB</span>
        <button class="s3d-lv-remove" :title="t('level.sounds.remove')" @click="dropSound(sound.path)">✕</button>
      </div>
      <label class="s3d-btn small">
        {{ t('level.sounds.add') }}
        <input type="file" accept="audio/*" multiple hidden @change="addSounds" />
      </label>
      <p class="s3d-lv-hint">{{ t('level.sounds.hint') }}</p>
    </section>

    <!-- the test run -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.play.title') }}</div>
      <p class="s3d-lv-hint">{{ t('level.play.startHint') }}</p>
      <button class="s3d-btn primary" @click="editor.setTool(PLAY_TOOL_ID)">▶ {{ t('level.play.start') }}</button>
    </section>

    <!-- export for game engines -->
    <section class="s3d-lv-section">
      <div class="s3d-lv-heading">{{ t('level.panel.export') }}</div>
      <p class="s3d-lv-hint">{{ t('level.panel.exportHint') }}</p>
      <div class="s3d-lv-row">
        <button class="s3d-btn" @click="context.commands.run('export-glb')">{{ t('level.panel.exportGlb') }}</button>
        <button class="s3d-btn" @click="context.commands.run(`export-level.${EXPORTER}`)">{{ t('level.panel.exportJson') }}</button>
      </div>
      <p class="s3d-lv-hint">{{ t('level.panel.templatesHint') }}</p>
      <div class="s3d-lv-row">
        <button
          v-for="template in TEMPLATES"
          :key="template.id"
          class="s3d-btn"
          @click="context.commands.run(`export-level.${template.id}`)"
        >
          {{ t(`level.export.${template.id}Short`) }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { checkLevel } from './checks';
import { levelAtmosphere, setAtmosphere } from './lights';
import { shownNav, toggleNav } from './nav';
import { addSound, listSounds, removeSound, soundName } from './sounds';
import { ACTIONS, KINDS, KIND_GROUPS, KIND_LIST, actionSpec, type ActionKind, type LevelAction, type ObjectKind } from './kinds';
import { levelObjects, renameObject, selectObjects, selectedObjects, setActions, setObjectId, setProp, type LevelObject } from './objects';
import { EXPORTER, PLACE_TOOL_ID, PLAY_TOOL_ID } from './names';
import { TEMPLATES } from './templates';
import { pluginContext, t, THREE } from './runtime';
import { useLevelState } from './state';

/**
 * The level panel: what to place, the selected object's name, id, properties and actions, the list of all objects
 * with what a game engine would trip over, export.
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
const selected = computed(() => {
  void revision.value;
  return selectedObjects();
});
const selectedIds = computed(() => new Set(selected.value.map((object) => object.instance.id)));
const selectedCount = computed(() => selected.value.length);
const current = computed(() => (selected.value.length === 1 ? selected.value[0] : null));
const groups = computed(() =>
  KIND_LIST.map((spec) => ({ kind: spec.kind, objects: objects.value.filter((object) => object.kind === spec.kind) })).filter(
    (group) => group.objects.length,
  ),
);
const problems = computed(() => checkLevel(objects.value));
/** the last reachability check while the model is as it was then */
const nav = computed(() => {
  void revision.value;
  void state.nav;
  const grid = shownNav();
  return grid && { reached: grid.nodes.filter((node) => node.reached).length, cells: grid.nodes.length, problems: grid.problems };
});
const atmosphere = computed(() => {
  void revision.value;
  return levelAtmosphere();
});
const checked = (event: Event) => (event.target as HTMLInputElement).checked;

// the sound files kept with the plugin
const sounds = ref<{ path: string; size: number }[]>([]);
const readSounds = async () => {
  sounds.value = await listSounds();
};
onMounted(readSounds);
const addSounds = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  for (const file of input.files ?? []) {
    await addSound(file);
  }
  input.value = '';
  await readSounds();
};
const dropSound = async (path: string) => {
  await removeSound(path);
  await readSounds();
};

const choose = (kind: ObjectKind) => {
  state.placing = state.placing === kind ? null : kind;
  if (state.placing) {
    editor.setTool(PLACE_TOOL_ID);
  }
  editor.redraw();
};

const text = (event: Event) => (event.target as HTMLInputElement).value;

/** the objects an action or property may point at – not the object itself */
const targetsFor = (kinds: ObjectKind[] | 'any', self: LevelObject) =>
  objects.value.filter((object) => object.instance !== self.instance && (kinds === 'any' || kinds.includes(object.kind)));
const targetLabel = (object: LevelObject) => `${object.instance.name || object.id} (${object.id})`;

// ------------------------------------------------------------ actions
const changeAction = (index: number, change: Partial<LevelAction>) => {
  const object = current.value!;
  setActions(
    object,
    object.actions.map((action, at) => (at === index ? { ...action, ...change } : action)),
  );
};
const addAction = () => {
  const object = current.value!;
  // a door nearby is the most likely thing to open
  const door = objects.value.find((candidate) => candidate.kind === 'door');
  setActions(object, [...object.actions, { do: 'open', target: door?.id ?? '' }]);
};
const removeAction = (index: number) => {
  const object = current.value!;
  setActions(
    object,
    object.actions.filter((_, at) => at !== index),
  );
};

/** a volume's size in metres (the component's box at the instance's scale) */
const sizeText = (object: LevelObject) => {
  const scale = new THREE.Vector3();
  object.world.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  const [width, depth, height] = KINDS[object.kind].size;
  const metres = (value: number) => (Math.round(value * 100) / 100).toString();
  return `${metres(width * scale.x)} × ${metres(depth * scale.y)} × ${metres(height * scale.z)} m`; // i18n-ignore – unit symbol
};
</script>
