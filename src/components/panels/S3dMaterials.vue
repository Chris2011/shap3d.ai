<template>
  <div class="mt-1 mb-2.5 flex items-center gap-2.5">
    <div class="size-12 flex-none rounded-[3px] border border-line-2" :style="swatchStyle(cur)"></div>
    <div>
      <div class="font-semibold">{{ editor.ui.currentMaterial ?? t('names.defaultMaterial') }}</div>
      <div class="s3d-label">{{ t('materials.hint') }}</div>
    </div>
  </div>
  <input v-model="filter" class="s3d-input" :placeholder="t('materials.search')" />
  <div class="my-2.5 grid grid-cols-[repeat(6,1fr)] gap-1.5">
    <div
      class="flex aspect-square cursor-pointer items-end justify-center rounded-[3px] border border-line-2 bg-[linear-gradient(135deg,var(--s3d-bg)_50%,#a4b2bf_50%)] text-[0.5625rem] text-[#333]"
      :class="{ [SELECTED_OUTLINE]: editor.ui.currentMaterial == null }"
      :title="t('names.defaultMaterial')"
      @click="choose(null)"
    >
      <span>{{ t('materials.defaultShort') }}</span>
    </div>
    <div
      v-for="material in list"
      :key="material.name"
      class="aspect-square cursor-pointer rounded-[3px] border border-line-2"
      :class="{ [SELECTED_OUTLINE]: editor.ui.currentMaterial === material.name }"
      :style="swatchStyle(material)"
      :title="material.name"
      @click="choose(material.name)"
    ></div>
  </div>

  <template v-if="cur">
    <div class="s3d-section-title">{{ t('materials.edit') }}</div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('materials.name') }}</span
      ><input class="s3d-input" :value="cur.name" @change="rename(($event.target as HTMLInputElement).value)" />
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('materials.color') }}</span
      ><input
        type="color"
        class="h-7 w-9 flex-none rounded-[3px] border border-edge bg-surface p-px"
        :value="cur.color"
        @input="setColor(($event.target as HTMLInputElement).value)"
      /><input class="s3d-input" :value="cur.color" @change="setColor(($event.target as HTMLInputElement).value)" />
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('materials.opacity') }}</span
      ><input
        type="range"
        min="0.05"
        max="1"
        step="0.05"
        :value="cur.opacity"
        @input="setOpacity(+($event.target as HTMLInputElement).value)"
      /><span class="w-10 text-end">{{ Math.round(cur.opacity * 100) }} %</span>
    </div>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('materials.texture') }}</span>
      <select
        class="s3d-input"
        :value="surfaceValue"
        @change="setSurface(($event.target as HTMLSelectElement).value, $event.target as HTMLSelectElement)"
      >
        <option value="">{{ t('materials.noTexture') }}</option>
        <option :value="IMAGE_VALUE">{{ t('materials.image') }}</option>
        <option v-for="(label, kind) in TEXTURES" :key="kind" :value="kind">{{ label }}</option>
        <optgroup v-if="SURFACE_SHADERS.length || cur.shader" :label="t('materials.shaders')">
          <option v-for="entry in SURFACE_SHADERS" :key="entry.id" :value="SHADER_PREFIX + entry.id">
            {{ t('materials.shaderOption', { name: localize(entry.label) }) }}
          </option>
          <option v-if="cur.shader && !shader" :value="SHADER_PREFIX + cur.shader">
            {{ t('materials.shaderMissing', { shader: cur.shader }) }}
          </option>
        </optgroup>
      </select>
    </div>
    <div v-if="cur.image" class="s3d-row">
      <span class="s3d-label"></span><button class="s3d-btn small" @click="loadImage">{{ t('materials.replaceImage') }}</button>
    </div>
    <div v-if="cur.texture || cur.image || shader" class="s3d-row">
      <span class="s3d-label">{{ cur.image ? t('materials.width') : t('materials.size') }}</span
      ><input class="s3d-input" :value="editor.fmt(currentSize)" @change="setTexSize(($event.target as HTMLInputElement).value)" />
    </div>
    <div v-if="cur.image" class="s3d-row">
      <span class="s3d-label">{{ t('materials.height') }}</span
      ><input
        class="s3d-input"
        :value="editor.fmt(currentSize * (cur.imageAspect ?? 1))"
        @change="setTexSize(($event.target as HTMLInputElement).value, cur.imageAspect ?? 1)"
      />
    </div>
    <template v-if="!shader && (cur.texture || cur.image)">
      <div class="s3d-row">
        <span class="s3d-label">{{ t('materials.offset') }}</span
        ><input
          class="s3d-input"
          :value="editor.fmt(cur.textureOffset?.[0] ?? 0)"
          :title="t('materials.offsetU')"
          @change="setOffset(0, ($event.target as HTMLInputElement).value)"
        /><input
          class="s3d-input"
          :value="editor.fmt(cur.textureOffset?.[1] ?? 0)"
          :title="t('materials.offsetV')"
          @change="setOffset(1, ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="s3d-row">
        <span class="s3d-label">{{ t('materials.rotation') }}</span
        ><input
          type="range"
          min="-180"
          max="180"
          step="5"
          :value="cur.textureRotation ?? 0"
          @input="setRotation(+($event.target as HTMLInputElement).value)"
        /><span class="w-10 text-end">{{ formatNumber(cur.textureRotation ?? 0) }}°</span>
      </div>
    </template>
    <template v-if="shader">
      <div v-for="{ param, value } in shaderParams" :key="param.name" class="s3d-row">
        <span class="s3d-label">{{ localize(param.label) }}</span>
        <template v-if="param.type === 'color'"
          ><input
            type="color"
            class="h-7 w-9 flex-none rounded-[3px] border border-edge bg-surface p-px"
            :value="value"
            @input="setParam(param, ($event.target as HTMLInputElement).value)"
        /></template>
        <template v-else
          ><input
            type="range"
            :min="param.min ?? 0"
            :max="param.max ?? 1"
            :step="param.step ?? 0.01"
            :value="value"
            @input="setParam(param, +($event.target as HTMLInputElement).value)"
          /><span class="w-10 text-end">{{ formatNumber(+value, { maximumFractionDigits: 2 }) }}</span></template
        >
      </div>
      <button v-if="cur.shaderParams" class="s3d-btn small mb-1.5" @click="resetParams">{{ t('materials.resetShader') }}</button>
    </template>
    <div class="s3d-row">
      <span class="s3d-label">{{ t('materials.used') }}</span
      ><span>{{ usage }}×</span>
    </div>
    <button class="s3d-btn small" @click="remove">{{ t('materials.delete') }}</button>
  </template>

  <div class="s3d-section-title">{{ t('materials.new') }}</div>
  <div class="s3d-row">
    <input v-model="newName" class="s3d-input" :placeholder="t('materials.name')" /><input
      v-model="newColor"
      type="color"
      class="h-7 w-9 flex-none rounded-[3px] border border-edge bg-surface p-px"
    />
  </div>
  <button class="s3d-btn small" @click="create">{{ t('materials.create') }}</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEditor } from '../keys';
import type { MaterialDef } from '../../core/document';
import type { Entities } from '../../core/model';
import { TEXTURES, defaultTextureSize } from '../../core/textures';
import { SURFACE_SHADERS, materialShader, shaderParam, shaderSize, type SurfaceShaderParam } from '../../engine/surfaceShaders';
import { swatchStyle } from '../../utils/materialSwatch';
import { parseLength } from '../../core/units';
import { pickFile } from '../../engine/commands';
import { readImageFile } from '../../utils/imageFile';
import { useModel } from '../../composables/useModel';
import { t, localize, formatNumber } from '../../i18n';

const editor = useEditor();
const SELECTED_OUTLINE = 'outline-2 outline-offset-1 outline-blue';
const filter = ref('');
const newName = ref('');
const newColor = ref('#c08040');
const mats = useModel(() => editor.model.materials);
const list = computed(() =>
  mats.value.filter((material) => !filter.value || material.name.toLowerCase().includes(filter.value.toLowerCase())),
);
const cur = useModel(() => editor.model.material(editor.ui.currentMaterial ?? undefined) ?? null);
const usage = useModel(() => {
  const name = cur.value?.name;
  if (!name) {
    return 0;
  }
  let count = 0;
  const seen = new Set<Entities>();
  const walk = (entities: Entities) => {
    if (seen.has(entities)) {
      return;
    }
    seen.add(entities);
    for (const face of entities.faces.values()) {
      if (face.material === name) {
        count++;
      }
      if (face.backMaterial === name) {
        count++;
      }
    }
    for (const instance of entities.instances.values()) {
      if (instance.material === name) {
        count++;
      }
      walk(instance.definition.entities);
    }
  };
  walk(editor.model.root);
  return count;
});
const choose = (name: string | null) => {
  editor.ui.currentMaterial = name;
  if (editor.ui.tool !== 'paint') {
    editor.setTool('paint');
  } else {
    editor.refreshStatus();
  }
};
const change = (label: string, apply: () => void) => {
  editor.commit(label, apply);
};
const setColor = (color: string) => {
  const material = cur.value;
  if (!material || !/^#[0-9a-f]{6}$/i.test(color)) {
    return;
  }
  material.color = color;
  editor.invalidate();
  editor.ui.saved = false;
};
/** shaders share the texture list – their values carry this prefix */
const SHADER_PREFIX = 'shader:';
/** the entry for the user's own image */
const IMAGE_VALUE = 'image:';
// the material object stays the same when it changes – so these re-read it on every model change
const shader = useModel(() => materialShader(cur.value ?? undefined));
const surfaceValue = useModel(() =>
  cur.value?.shader ? SHADER_PREFIX + cur.value.shader : cur.value?.image ? IMAGE_VALUE : (cur.value?.texture ?? ''),
);
const currentSize = useModel(() => {
  const material = cur.value;
  if (!material) {
    return 1;
  }
  return shader.value ? shaderSize(material, shader.value) : (material.textureSize ?? defaultTextureSize(material));
});
const shaderParams = useModel(() => {
  const material = cur.value;
  return material && shader.value ? (shader.value.params ?? []).map((param) => ({ param, value: shaderParam(material, param) })) : [];
});
const setSurface = (value: string, select?: HTMLSelectElement) => {
  const material = cur.value;
  if (!material) {
    return;
  }
  if (value === IMAGE_VALUE) {
    // the list shows the image only once one is loaded
    if (select) {
      select.value = surfaceValue.value;
    }
    void loadImage();
    return;
  }
  const shaderId = value.startsWith(SHADER_PREFIX) ? value.slice(SHADER_PREFIX.length) : undefined;
  material.texture = shaderId ? undefined : value || undefined;
  material.image = material.imageAspect = undefined;
  material.textureSize = material.textureRotation = undefined;
  material.textureOffset = undefined;
  if (material.shader !== shaderId) {
    material.shader = shaderId;
    material.shaderParams = undefined;
  }
  editor.invalidate();
  editor.ui.saved = false;
};
const setParam = (param: SurfaceShaderParam, value: number | string) => {
  const material = cur.value;
  if (!material || (typeof value === 'number' && !Number.isFinite(value))) {
    return;
  }
  material.shaderParams = { ...material.shaderParams, [param.name]: value };
  editor.invalidate();
  editor.ui.saved = false;
};
const resetParams = () => {
  const material = cur.value;
  if (!material) {
    return;
  }
  material.shaderParams = undefined;
  editor.invalidate();
  editor.ui.saved = false;
};
/** `per` – the entered length for one unit of width (the image's aspect, for its height) */
const setTexSize = (text: string, per = 1) => {
  const material = cur.value;
  const size = parseLength(text, editor.model.settings.units);
  if (!material || size == null || size <= 0) {
    return;
  }
  material.textureSize = size / per;
  editor.invalidate();
  editor.ui.saved = false;
};
const setOffset = (axis: 0 | 1, text: string) => {
  const material = cur.value;
  const offset = parseLength(text, editor.model.settings.units);
  if (!material || offset == null) {
    return;
  }
  const next: [number, number] = [material.textureOffset?.[0] ?? 0, material.textureOffset?.[1] ?? 0];
  next[axis] = offset;
  material.textureOffset = next[0] || next[1] ? next : undefined;
  editor.invalidate();
  editor.ui.saved = false;
};
const setRotation = (degrees: number) => {
  const material = cur.value;
  if (!material || !Number.isFinite(degrees)) {
    return;
  }
  material.textureRotation = degrees || undefined;
  editor.invalidate();
  editor.ui.saved = false;
};
/** asks for a picture and puts it into the current material (undoable – it is saved with the model) */
const loadImage = async () => {
  const material = cur.value;
  const file = material && (await pickFile('image/png,image/jpeg,image/webp,image/gif,image/bmp'));
  if (!material || !file) {
    return;
  }
  const image = await readImageFile(file).catch(() => null);
  if (!image) {
    editor.toast(t('materials.imageFailed', { name: file.name }));
    return;
  }
  change('undo.materialImage', () => {
    const first = !material.image;
    material.image = image.url;
    material.imageAspect = image.aspect;
    material.texture = material.shader = undefined;
    material.shaderParams = undefined;
    if (first) {
      material.textureSize = material.textureRotation = undefined;
      material.textureOffset = undefined;
    }
  });
};
const setOpacity = (opacity: number) => {
  const material = cur.value;
  if (!material) {
    return;
  }
  material.opacity = opacity;
  editor.invalidate();
  editor.ui.saved = false;
};
const rename = (name: string) => {
  const material = cur.value;
  name = name.trim();
  if (!material || !name || editor.model.materials.some((other) => other.name === name)) {
    return;
  }
  const old = material.name;
  change('undo.renameMaterial', () => {
    material.name = name;
    const seen = new Set<Entities>();
    const walk = (entities: Entities) => {
      if (seen.has(entities)) {
        return;
      }
      seen.add(entities);
      for (const face of entities.faces.values()) {
        if (face.material === old) {
          face.material = name;
        }
        if (face.backMaterial === old) {
          face.backMaterial = name;
        }
      }
      for (const instance of entities.instances.values()) {
        if (instance.material === old) {
          instance.material = name;
        }
        walk(instance.definition.entities);
      }
    };
    walk(editor.model.root);
  });
  editor.ui.currentMaterial = name;
};
const remove = () => {
  const material = cur.value;
  if (!material) {
    return;
  }
  const old = material.name;
  change('materials.delete', () => {
    editor.model.materials = editor.model.materials.filter((other) => other !== material);
    const seen = new Set<Entities>();
    const walk = (entities: Entities) => {
      if (seen.has(entities)) {
        return;
      }
      seen.add(entities);
      for (const face of entities.faces.values()) {
        if (face.material === old) {
          face.material = undefined;
        }
        if (face.backMaterial === old) {
          face.backMaterial = undefined;
        }
      }
      for (const instance of entities.instances.values()) {
        if (instance.material === old) {
          instance.material = undefined;
        }
        walk(instance.definition.entities);
      }
    };
    walk(editor.model.root);
  });
  editor.ui.currentMaterial = null;
};
const create = () => {
  let name = newName.value.trim() || 'Material';
  let counter = 1;
  const base = name;
  while (editor.model.materials.some((other) => other.name === name)) {
    name = `${base} ${++counter}`;
  }
  change('undo.createMaterial', () => editor.model.materials.push({ name: name, color: newColor.value, opacity: 1 }));
  newName.value = '';
  choose(name);
};
</script>
