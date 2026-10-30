<template>
  <div class="s3d-nz">
    <div class="s3d-nz-tabs">
      <button v-for="name in TABS" :key="name" :class="{ active: tab === name }" @click="tab = name">{{ t(`noise.tabs.${name}`) }}</button>
    </div>

    <section v-if="tab === 'terrain'" class="s3d-nz-section">
      <p v-if="editing" class="s3d-nz-status">{{ t('noise.terrain.editing', { name: editing.name || editing.definition.name }) }}</p>
      <p v-else class="s3d-nz-hint">{{ t('noise.terrain.hint') }}</p>
      <div class="s3d-nz-presets">
        <button v-for="preset in PRESET_NAMES" :key="preset" :title="t(`noise.presets.${preset}Title`)" @click="applyPreset(preset)">
          {{ t(`noise.presets.${preset}`) }}
        </button>
      </div>

      <div class="s3d-nz-heading">{{ t('noise.terrain.size') }}</div>
      <S3dNoiseSlider v-model="settings.width" :label="t('noise.terrain.width')" :min="2" :max="300" />
      <S3dNoiseSlider v-model="settings.depth" :label="t('noise.terrain.depth')" :min="2" :max="300" />
      <S3dNoiseSlider v-model="settings.detail" :label="t('noise.terrain.detail')" :min="8" :max="120" />

      <div class="s3d-nz-heading">{{ t('noise.terrain.noise') }}</div>
      <label class="s3d-nz-slider">
        <span>{{ t('noise.terrain.mode') }}</span>
        <select v-model="settings.mode" class="s3d-input" style="grid-column: span 2">
          <option v-for="mode in MODES" :key="mode" :value="mode">{{ t(`noise.modes.${mode}`) }}</option>
        </select>
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="settings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="settings.seed = randomSeed()">🎲</button>
      </div>
      <S3dNoiseSlider v-model="settings.scale" :label="t('noise.terrain.scale')" :min="1" :max="150" :step="0.5" />
      <S3dNoiseSlider v-model="settings.height" :label="t('noise.terrain.height')" :min="0" :max="60" :step="0.1" />
      <S3dNoiseSlider v-model="settings.octaves" :label="t('noise.terrain.octaves')" :min="1" :max="10" />
      <S3dNoiseSlider v-model="settings.persistence" :label="t('noise.terrain.persistence')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="settings.lacunarity" :label="t('noise.terrain.lacunarity')" :min="1" :max="4" :step="0.05" />
      <S3dNoiseSlider v-model="settings.exponent" :label="t('noise.terrain.exponent')" :min="0.3" :max="3" :step="0.05" />
      <S3dNoiseSlider v-model="settings.warp" :label="t('noise.terrain.warp')" :min="0" :max="1.5" :step="0.05" />

      <div class="s3d-nz-heading">{{ t('noise.terrain.shape') }}</div>
      <S3dNoiseSlider v-model="settings.falloff" :label="t('noise.terrain.falloff')" :min="0" :max="1" :step="0.05" />
      <S3dNoiseSlider v-model="settings.terraces" :label="t('noise.terrain.terraces')" :min="0" :max="10" :step="0.1" />
      <S3dNoiseSlider
        v-if="settings.terraces > 0"
        v-model="settings.terraceSharpness"
        :label="t('noise.terrain.terraceSharpness')"
        :min="0"
        :max="1"
        :step="0.05"
      />
      <S3dNoiseSlider v-model="settings.erosion" :label="t('noise.terrain.erosion')" :min="0" :max="3" :step="0.1" />
      <S3dNoiseSlider
        v-if="settings.erosion > 0"
        v-model="settings.erosionStrength"
        :label="t('noise.terrain.erosionStrength')"
        :min="0"
        :max="1"
        :step="0.05"
      />
      <label class="s3d-check">
        <input v-model="hasWater" type="checkbox" />
        {{ t('noise.terrain.water') }}
      </label>
      <S3dNoiseSlider v-if="hasWater" v-model="waterLevel" :label="t('noise.terrain.waterLevel')" :min="-5" :max="30" :step="0.1" />
      <label class="s3d-check">
        <input v-model="hasSnow" type="checkbox" />
        {{ t('noise.terrain.snow') }}
      </label>
      <S3dNoiseSlider v-if="hasSnow" v-model="snowLine" :label="t('noise.terrain.snowLine')" :min="0" :max="60" :step="0.1" />
      <label class="s3d-check">
        <input v-model="settings.skirt" type="checkbox" />
        {{ t('noise.terrain.skirt') }}
      </label>

      <label class="s3d-check">
        <input v-model="live" type="checkbox" />
        {{ t('noise.terrain.preview') }}
      </label>
      <p class="s3d-nz-hint">{{ stats }}</p>
      <div class="s3d-nz-row">
        <button class="s3d-btn primary" @click="create(!!editing)">
          {{ editing ? t('noise.terrain.apply') : t('noise.terrain.create') }}
        </button>
        <button v-if="editing" class="s3d-btn" @click="create(false)">{{ t('noise.terrain.createNew') }}</button>
      </div>
      <p class="s3d-nz-hint">{{ t('noise.terrain.sculptHint') }}</p>

      <template v-if="recipeSteps.length">
        <div class="s3d-nz-heading">{{ t('noise.steps.title') }}</div>
        <p class="s3d-nz-hint">{{ t('noise.steps.hint') }}</p>
        <div v-for="step in recipeSteps" :key="step.index" class="s3d-nz-step" :class="{ off: !step.enabled }">
          <label class="s3d-check">
            <input type="checkbox" :checked="step.enabled" @change="editStep(step.index, { enabled: !step.enabled })" />
            {{ step.index + 1 }}. {{ t(`noise.steps.kinds.${step.kind}`) }}
          </label>
          <button
            v-if="step.seed != null"
            class="s3d-btn small"
            :title="t('noise.steps.reseed')"
            @click="editStep(step.index, { seed: randomSeed() })"
          >
            🎲
          </button>
          <button class="s3d-btn small" :title="t('noise.steps.remove')" @click="editStep(step.index, { remove: true })">✕</button>
        </div>
        <button class="s3d-btn" @click="rebuildSteps">{{ t('noise.steps.rebuild') }}</button>
      </template>
    </section>

    <section v-else-if="tab === 'scatter'" class="s3d-nz-section">
      <div class="s3d-nz-heading">{{ t('noise.tree.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.tree.hint') }}</p>
      <label class="s3d-nz-slider">
        <span>{{ t('noise.tree.species') }}</span>
        <select v-model="treeSettings.species" class="s3d-input" style="grid-column: span 2">
          <option v-for="species in TREE_SPECIES" :key="species" :value="species">{{ t(`noise.objects.${species}`) }}</option>
        </select>
      </label>
      <S3dNoiseSlider v-model="treeSettings.height" :label="t('noise.terrain.height')" :min="2" :max="40" :step="0.5" />
      <S3dNoiseSlider v-model="treeSettings.gnarl" :label="t('noise.tree.gnarl')" :min="0" :max="1" :step="0.05" />
      <S3dNoiseSlider v-model="treeSettings.density" :label="t('noise.tree.density')" :min="0" :max="1" :step="0.05" />
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="treeSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="treeSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runTree">{{ t('noise.tree.run') }}</button>

      <div class="s3d-nz-heading">{{ t('noise.scatter.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.scatter.hint') }}</p>
      <p class="s3d-nz-status">{{ t(`noise.scatter.target.${scatterTarget.kind}`, { count: scatterTarget.count }) }}</p>
      <div class="s3d-nz-checks">
        <label v-for="kind in OBJECT_KINDS" :key="kind" class="s3d-check">
          <input v-model="scatterSettings.objects" type="checkbox" :value="kind" />
          {{ t(`noise.objects.${kind}`) }}
        </label>
      </div>
      <label class="s3d-nz-slider">
        <span>{{ t('noise.scatter.component') }}</span>
        <select v-model="scatterSettings.component" class="s3d-input" style="grid-column: span 2">
          <option value="">–</option>
          <option v-for="name in componentNames" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <S3dNoiseSlider v-model="scatterSettings.spacing" :label="t('noise.scatter.spacing')" :min="0.5" :max="20" :step="0.1" />
      <S3dNoiseSlider v-model="scatterSettings.density" :label="t('noise.scatter.density')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="scatterSettings.clumping" :label="t('noise.scatter.clumping')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="scatterSettings.clumpSize" :label="t('noise.scatter.clumpSize')" :min="2" :max="100" :step="0.5" />
      <S3dNoiseSlider v-model="scatterSettings.maxSlope" :label="t('noise.scatter.maxSlope')" :min="0" :max="90" />
      <S3dNoiseSlider v-model="scatterSettings.sizeMin" :label="t('noise.scatter.sizeMin')" :min="0.1" :max="3" :step="0.05" />
      <S3dNoiseSlider v-model="scatterSettings.sizeMax" :label="t('noise.scatter.sizeMax')" :min="0.1" :max="3" :step="0.05" />
      <template v-if="scatterTarget.kind === 'path'">
        <S3dNoiseSlider v-model="scatterSettings.offset" :label="t('noise.scatter.offset')" :min="0" :max="20" :step="0.1" />
        <label class="s3d-check">
          <input v-model="scatterSettings.alongPath" type="checkbox" />
          {{ t('noise.scatter.alongPath') }}
        </label>
      </template>
      <label v-if="scatterTarget.kind === 'faces'" class="s3d-check">
        <input v-model="scatterSettings.align" type="checkbox" />
        {{ t('noise.scatter.align') }}
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="scatterSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="scatterSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runScatter">{{ t('noise.scatter.run') }}</button>

      <div class="s3d-nz-heading">{{ t('noise.river.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.river.hint') }}</p>
      <S3dNoiseSlider v-model="riverSettings.width" :label="t('noise.river.width')" :min="0.5" :max="30" :step="0.5" />
      <S3dNoiseSlider v-model="riverSettings.depth" :label="t('noise.river.depth')" :min="0.2" :max="6" :step="0.1" />
      <S3dNoiseSlider v-model="riverSettings.wiggle" :label="t('noise.river.wiggle')" :min="0" :max="1" :step="0.05" />
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="riverSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="riverSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runRiver">{{ t('noise.river.run') }}</button>

      <div class="s3d-nz-heading">{{ t('noise.road.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.road.hint') }}</p>
      <p class="s3d-nz-status">
        {{ t(scatterTarget.kind === 'path' ? 'noise.road.target.path' : 'noise.road.target.across', { count: scatterTarget.count }) }}
      </p>
      <label class="s3d-nz-slider">
        <span>{{ t('noise.road.surface') }}</span>
        <select v-model="roadSettings.surface" class="s3d-input" style="grid-column: span 2">
          <option value="asphalt">{{ t('noise.road.asphalt') }}</option>
          <option value="gravel">{{ t('noise.road.gravel') }}</option>
        </select>
      </label>
      <S3dNoiseSlider v-model="roadSettings.width" :label="t('noise.road.width')" :min="0.5" :max="20" :step="0.5" />
      <S3dNoiseSlider v-model="roadSettings.maxGrade" :label="t('noise.road.maxGrade')" :min="1" :max="40" />
      <label v-if="roadSettings.surface === 'asphalt'" class="s3d-check">
        <input v-model="roadSettings.markings" type="checkbox" />
        {{ t('noise.city.markings') }}
      </label>
      <button class="s3d-btn primary" @click="runRoad">{{ t('noise.road.run') }}</button>
    </section>

    <section v-else-if="tab === 'paving'" class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.paving.hint') }}</p>
      <p class="s3d-nz-status">
        {{ selectedFaces ? t('noise.paving.onFaces', { count: selectedFaces }) : t('noise.paving.onArea') }}
      </p>
      <div class="s3d-nz-presets">
        <button
          v-for="preset in PAVING_PRESET_NAMES"
          :key="preset"
          :title="t(`noise.paving.presets.${preset}Title`)"
          @click="applyPavingPreset(preset)"
        >
          {{ t(`noise.paving.presets.${preset}`) }}
        </button>
      </div>
      <template v-if="!selectedFaces">
        <S3dNoiseSlider v-model="pavingSettings.width" :label="t('noise.terrain.width')" :min="0.5" :max="50" :step="0.1" />
        <S3dNoiseSlider v-model="pavingSettings.depth" :label="t('noise.terrain.depth')" :min="0.5" :max="50" :step="0.1" />
      </template>
      <S3dNoiseSlider v-model="pavingSettings.size" :label="t('noise.paving.size')" :min="0.05" :max="2" :step="0.01" />
      <S3dNoiseSlider v-model="pavingSettings.gap" :label="t('noise.paving.gap')" :min="0.002" :max="0.1" :step="0.001" />
      <S3dNoiseSlider v-model="pavingSettings.jitter" :label="t('noise.paving.jitter')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="pavingSettings.stretch" :label="t('noise.paving.stretch')" :min="0.5" :max="4" :step="0.05" />
      <S3dNoiseSlider v-model="pavingSettings.thickness" :label="t('noise.paving.thickness')" :min="0.005" :max="0.4" :step="0.005" />
      <S3dNoiseSlider v-model="pavingSettings.variation" :label="t('noise.paving.variation')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="pavingSettings.bevel" :label="t('noise.paving.bevel')" :min="0" :max="0.08" :step="0.001" />
      <S3dNoiseSlider v-model="pavingSettings.shades" :label="t('noise.paving.shades')" :min="1" :max="6" />
      <label class="s3d-nz-slider">
        <span>{{ t('noise.paving.color') }}</span>
        <input v-model="pavingSettings.color" class="s3d-input" type="color" style="grid-column: span 2" />
      </label>
      <label class="s3d-check">
        <input v-model="pavingSettings.joint" type="checkbox" />
        {{ t('noise.paving.joint') }}
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="pavingSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="pavingSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runPaving">{{ t('noise.paving.run') }}</button>
    </section>

    <section v-else-if="tab === 'city'" class="s3d-nz-section">
      <div class="s3d-nz-heading">{{ t('noise.facade.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.facade.hint') }}</p>
      <p class="s3d-nz-status">{{ facadeTarget.text }}</p>
      <S3dNoiseSlider v-model="facadeSettings.floorHeight" :label="t('noise.facade.floorHeight')" :min="2.4" :max="5" :step="0.05" />
      <S3dNoiseSlider v-model="facadeSettings.groundFloor" :label="t('noise.facade.groundFloor')" :min="0" :max="6" :step="0.05" />
      <S3dNoiseSlider v-model="facadeSettings.windowWidth" :label="t('noise.facade.windowWidth')" :min="0.4" :max="3" :step="0.05" />
      <S3dNoiseSlider v-model="facadeSettings.windowHeight" :label="t('noise.facade.windowHeight')" :min="0.4" :max="3" :step="0.05" />
      <S3dNoiseSlider v-model="facadeSettings.spacing" :label="t('noise.facade.spacing')" :min="0.2" :max="4" :step="0.05" />
      <S3dNoiseSlider v-model="facadeSettings.sill" :label="t('noise.facade.sill')" :min="0" :max="1.5" :step="0.05" />
      <S3dNoiseSlider v-model="facadeSettings.balconies" :label="t('noise.facade.balconies')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="facadeSettings.shutters" :label="t('noise.facade.shutters')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="facadeSettings.lit" :label="t('noise.facade.lit')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="facadeSettings.gaps" :label="t('noise.facade.gaps')" :min="0" :max="0.8" :step="0.01" />
      <label class="s3d-check">
        <input v-model="facadeSettings.shops" type="checkbox" />
        {{ t('noise.facade.shops') }}
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="facadeSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="facadeSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" :disabled="!facadeTarget.ok" @click="runFacade">{{ t('noise.facade.run') }}</button>

      <div class="s3d-nz-heading">{{ t('noise.city.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.city.hint') }}</p>
      <p class="s3d-nz-status">{{ t(cityTerrain ? 'noise.city.onTerrain' : 'noise.city.besideModel') }}</p>
      <template v-if="!cityTerrain">
        <S3dNoiseSlider v-model="citySettings.width" :label="t('noise.terrain.width')" :min="40" :max="600" />
        <S3dNoiseSlider v-model="citySettings.depth" :label="t('noise.terrain.depth')" :min="40" :max="600" />
      </template>
      <S3dNoiseSlider v-else v-model="cityFlatten" :label="t('noise.city.flatten')" :min="0" :max="1" :step="0.05" />
      <S3dNoiseSlider v-model="citySettings.block" :label="t('noise.city.block')" :min="12" :max="120" />
      <S3dNoiseSlider v-model="citySettings.street" :label="t('noise.city.street')" :min="4" :max="30" :step="0.5" />
      <S3dNoiseSlider v-model="citySettings.plot" :label="t('noise.city.plot')" :min="6" :max="60" />
      <S3dNoiseSlider v-model="citySettings.gap" :label="t('noise.city.gap')" :min="0.2" :max="10" :step="0.1" />
      <S3dNoiseSlider v-model="citySettings.minFloors" :label="t('noise.city.minFloors')" :min="1" :max="20" />
      <S3dNoiseSlider v-model="citySettings.maxFloors" :label="t('noise.city.maxFloors')" :min="1" :max="80" />
      <S3dNoiseSlider v-model="citySettings.floorHeight" :label="t('noise.facade.floorHeight')" :min="2.4" :max="5" :step="0.05" />
      <S3dNoiseSlider v-model="citySettings.scale" :label="t('noise.city.scale')" :min="10" :max="400" />
      <S3dNoiseSlider v-model="citySettings.centre" :label="t('noise.city.centre')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="citySettings.empty" :label="t('noise.city.empty')" :min="0" :max="0.8" :step="0.01" />
      <S3dNoiseSlider v-model="citySettings.sidewalk" :label="t('noise.city.sidewalk')" :min="0" :max="8" :step="0.5" />
      <S3dNoiseSlider v-model="citySettings.roofs" :label="t('noise.city.roofs')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="citySettings.pitchedFloors" :label="t('noise.city.pitchedFloors')" :min="1" :max="12" />
      <S3dNoiseSlider v-model="citySettings.courts" :label="t('noise.city.courts')" :min="0" :max="1" :step="0.01" />
      <S3dNoiseSlider v-model="citySettings.parks" :label="t('noise.city.parks')" :min="0" :max="0.5" :step="0.01" />
      <S3dNoiseSlider v-model="citySettings.treeSpacing" :label="t('noise.city.treeSpacing')" :min="0" :max="40" :step="0.5" />
      <label class="s3d-check">
        <input v-model="citySettings.markings" type="checkbox" />
        {{ t('noise.city.markings') }}
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="citySettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="citySettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runCity">{{ t('noise.city.run') }}</button>

      <div class="s3d-nz-heading">{{ t('noise.village.title') }}</div>
      <p class="s3d-nz-hint">{{ t('noise.village.hint') }}</p>
      <S3dNoiseSlider v-model="villageSettings.count" :label="t('noise.village.count')" :min="1" :max="12" />
      <S3dNoiseSlider v-model="villageSettings.houses" :label="t('noise.village.houses')" :min="3" :max="40" />
      <S3dNoiseSlider v-model="villageSettings.roadWidth" :label="t('noise.road.width')" :min="2" :max="8" :step="0.5" />
      <S3dNoiseSlider v-model="villageSettings.maxSlope" :label="t('noise.village.maxSlope')" :min="4" :max="30" />
      <label class="s3d-nz-slider">
        <span>{{ t('noise.village.roads') }}</span>
        <select v-model="villageSettings.roads" class="s3d-input" style="grid-column: span 2">
          <option value="gravel">{{ t('noise.road.gravel') }}</option>
          <option value="asphalt">{{ t('noise.road.asphalt') }}</option>
          <option value="none">{{ t('noise.village.noRoads') }}</option>
        </select>
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="villageSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="villageSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" @click="runVillages">{{ t('noise.village.run') }}</button>
    </section>

    <section v-else-if="tab === 'deform'" class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.deform.hint') }}</p>
      <S3dNoiseSlider v-model="deformSettings.amount" :label="t('noise.deform.amount')" :min="0" :max="3" :step="0.01" />
      <S3dNoiseSlider v-model="deformSettings.scale" :label="t('noise.deform.scale')" :min="0.05" :max="20" :step="0.05" />
      <S3dNoiseSlider v-model="deformSettings.detail" :label="t('noise.deform.detail')" :min="0.02" :max="5" :step="0.01" />
      <div class="s3d-nz-heading">{{ t('noise.deform.shape') }}</div>
      <S3dNoiseSlider v-model="deformSettings.twist" :label="t('noise.deform.twist')" :min="-360" :max="360" />
      <S3dNoiseSlider v-model="deformSettings.taper" :label="t('noise.deform.taper')" :min="0" :max="2" :step="0.01" />
      <S3dNoiseSlider v-model="deformSettings.bend" :label="t('noise.deform.bend')" :min="-180" :max="180" />
      <div class="s3d-nz-heading">{{ t('noise.terrain.noise') }}</div>
      <S3dNoiseSlider v-model="deformSettings.octaves" :label="t('noise.terrain.octaves')" :min="1" :max="8" />
      <label class="s3d-nz-slider">
        <span>{{ t('noise.terrain.mode') }}</span>
        <select v-model="deformSettings.mode" class="s3d-input" style="grid-column: span 2">
          <option v-for="mode in MODES" :key="mode" :value="mode">{{ t(`noise.modes.${mode}`) }}</option>
        </select>
      </label>
      <div class="s3d-nz-row">
        <S3dNoiseSlider v-model="deformSettings.seed" style="flex: 1" :label="t('noise.terrain.seed')" :min="0" :max="999" />
        <button class="s3d-btn small s3d-nz-dice" :title="t('noise.terrain.randomSeed')" @click="deformSettings.seed = randomSeed()">
          🎲
        </button>
      </div>
      <button class="s3d-btn primary" :disabled="!selectedGroups" @click="runDeform">
        {{ t('noise.deform.run', { count: selectedGroups }) }}
      </button>
    </section>

    <section v-else class="s3d-nz-section">
      <p class="s3d-nz-hint">{{ t('noise.script.hint') }}</p>
      <code v-for="line in SCRIPT_LINES" :key="line" class="s3d-nz-code">{{ line }}</code>
      <p class="s3d-nz-hint">{{ t('noise.script.shader') }}</p>
      <code class="s3d-nz-code">s3d.material('…', '#6f8f3a', { shader: 'noise.noise', params: { color2: '#2f3a2c', mode: 1 } })</code>
      <code class="s3d-nz-code">s3d.material('…', '#a39a8c', { shader: 'noise.cells', params: { joint: 0.08 } })</code>
      <code class="s3d-nz-code">s3d.material('…', '#d8cdbd', { shader: 'noise.facade', size: 3.2, params: { lit: 0.3 } })</code>
      <button class="s3d-btn" @click="openExample">{{ t('noise.script.open') }}</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import type * as THREE from 'three';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { Instance } from '../../../src/core/model';
import S3dNoiseSlider from './S3dNoiseSlider.vue';
import { lastRebuildResult } from './rebuild';
import { lastCityBuildings, lastCreated, lastRouteLength, lastVillageHouses, terrainGridOf, type NoiseTerrainData } from './actions';
import {
  VILLAGE_DEFAULTS,
  RIVER_DEFAULTS,
  ROAD_DEFAULTS,
  TREE_DEFAULTS,
  TREE_SPECIES,
  CITY_DEFAULTS,
  FACADE_DEFAULTS,
  PAVING_DEFAULTS,
  TERRAIN_DEFAULTS,
  gridRange,
  normaliseSettings,
  type TerrainSettings,
} from '@shap3d/procgen';
import { EXAMPLE } from './example';
import { OBJECT_KINDS } from './objects';
import { hidePreview, showPreview } from './preview';
import { PAVING_PRESETS, PAVING_PRESET_NAMES, PRESETS, PRESET_NAMES, type PavingPresetName, type PresetName } from './presets';
import { pluginContext, t } from './runtime';
import { TABS, onTabRequest, type PanelTab } from './tabs';

const MODES = ['fbm', 'ridged', 'billow'] as const;
const SCRIPT_LINES = [
  's3d.noiseTerrain({ width: 80, depth: 60, height: 12, mode: "ridged", water: 1.5, seed: 7 })',
  's3d.scatter({ objects: ["conifer", "tree", "rock"], spacing: 4, clumping: 0.7 })',
  's3d.paving({ area: [0, 0, 6, 4], size: 0.5, joint: true })',
  's3d.noiseDeform({ amount: 0.1, scale: 0.6, twist: 90 })',
  's3d.cellNoise(x, y)  →  { f1, f2, id, site }',
  's3d.facade({ on: s3d.box([0, 0, 0], 12, 9, 15), balconies: 0.4 })',
  's3d.city({ width: 200, depth: 150, maxFloors: 25 })',
  "s3d.tree({ at: [0, 0, 0], species: 'oak', height: 10 })",
  's3d.river({ width: 6, depth: 1.5, wiggle: 0.6 })',
  "s3d.villages({ count: 5, houses: 16, roads: 'gravel' })",
  's3d.road({ from: [0, 0, 0], to: [80, 50, 0], width: 6, maxGrade: 8 })',
  "s3d.road({ surface: 'gravel', width: 2 })  // along the selected edges",
  's3d.erode({ amount: 2, strength: 0.6 })',
  's3d.noise(x, y)  ·  s3d.fbm(x, y, { octaves: 5, mode: "ridged" })',
];

const context = pluginContext();
const editor = context.editor;
const tab = ref<PanelTab>(context.storage.get('tab', 'terrain'));
watch(tab, (value) => context.storage.set('tab', value));
// the context menu entries open the panel on a tab
onTabRequest((requested) => (tab.value = requested));

// ------------------------------------------------------------ terrain
const settings = reactive<TerrainSettings>(normaliseSettings(context.storage.get('terrain', {})));
const live = ref(context.storage.get('live', true));
watch(live, (value) => context.storage.set('live', value));
// water and snow keep their height while switched off
const waterLevel = ref(settings.water ?? 0.5),
  snowLine = ref(settings.snow ?? settings.height * 0.85);
const hasWater = ref(settings.water != null),
  hasSnow = ref(settings.snow != null);
watch([hasWater, waterLevel], () => (settings.water = hasWater.value ? waterLevel.value : null));
watch([hasSnow, snowLine], () => (settings.snow = hasSnow.value ? snowLine.value : null));

/** the selected noise terrain – the panel shows and changes its settings */
const editing = computed<Instance | null>(() => {
  void editor.ui.selRev;
  void editor.ui.revision;
  const selection = editor.selected();
  if (selection.length !== 1 || selection[0].kind !== 'instance') {
    return null;
  }
  const instance = editor.entities.instances.get(selection[0].id);
  return instance && context.data.get<NoiseTerrainData>(instance.definition)?.settings ? instance : null;
});
const storedSettings = (instance: Instance) => context.data.get<NoiseTerrainData>(instance.definition)!.settings!;
// a terrain selected when the panel opens counts too
watch(
  editing,
  (instance) => {
    if (!instance) {
      return;
    }
    const stored = normaliseSettings(storedSettings(instance));
    Object.assign(settings, stored);
    hasWater.value = stored.water != null;
    waterLevel.value = stored.water ?? waterLevel.value;
    hasSnow.value = stored.snow != null;
    snowLine.value = stored.snow ?? snowLine.value;
  },
  { immediate: true },
);

/** where a new terrain goes: centred on the origin in an empty model, else beside the model */
const newOrigin = (): THREE.Vector3 => {
  const box = editor.model.bounds();
  const { Vector3 } = context.THREE;
  return box.isEmpty() ? new Vector3(-settings.width / 2, -settings.depth / 2, 0) : new Vector3(box.max.x + 2, box.min.y, 0);
};
const originOf = (instance: Instance) =>
  new context.THREE.Vector3().setFromMatrixPosition(editor.contextMatrix.clone().multiply(instance.matrix));

const stats = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
const refreshPreview = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const current = normaliseSettings({ ...settings });
    context.storage.set('terrain', current);
    const instance = editing.value;
    // the terrain as it is in the model needs no preview
    const unchanged = instance && JSON.stringify(normaliseSettings(storedSettings(instance))) === JSON.stringify(current);
    // only the terrain tab shows it
    if (!live.value || unchanged || tab.value !== 'terrain') {
      hidePreview();
      stats.value = '';
      return;
    }
    const grid = showPreview(current, instance ? originOf(instance) : newOrigin(), instance);
    const { low, high } = gridRange(grid);
    stats.value = t('noise.terrain.stats', {
      columns: grid.columns,
      rows: grid.rows,
      faces: grid.columns * grid.rows * 2,
      low: low.toFixed(1),
      high: high.toFixed(1),
    });
  }, 60);
};
watch([settings, live, editing, tab], refreshPreview, { deep: true, immediate: true });
onBeforeUnmount(() => {
  clearTimeout(timer);
  hidePreview();
});

const randomSeed = () => Math.floor(Math.random() * 1000);
const applyPreset = (name: PresetName) => {
  const preset: Partial<TerrainSettings> = PRESETS[name];
  Object.assign(
    settings,
    { ...TERRAIN_DEFAULTS, width: settings.width, depth: settings.depth, detail: settings.detail, seed: settings.seed },
    preset,
  );
  hasWater.value = preset.water != null;
  if (preset.water != null) {
    waterLevel.value = preset.water;
  }
  hasSnow.value = preset.snow != null;
  if (preset.snow != null) {
    snowLine.value = preset.snow;
  }
};

/** runs a script line as one undo step; shows the error as a toast */
const run = (code: string) => {
  const result = context.script.run(code);
  if (!result.ok) {
    context.ui.toast(String(result.error ?? ''));
  }
  return result.ok;
};
const selectCreated = () => {
  const instance = lastCreated();
  if (instance) {
    editor.select([{ kind: 'instance', id: instance.id }]);
  }
};

// the recipe of the selected terrain (noise or Terrain tool): its steps, switched on and off, reseeded, built again
const recipeTerrain = computed(() => {
  void editor.ui.selRev;
  void editor.ui.revision;
  const selection = editor.selected();
  if (selection.length !== 1 || selection[0].kind !== 'instance') {
    return null;
  }
  const instance = editor.entities.instances.get(selection[0].id);
  return instance && terrainGridOf(instance) && context.data.get<NoiseTerrainData>(instance.definition)?.steps?.length ? instance : null;
});
const recipeSteps = computed(() =>
  (recipeTerrain.value ? (context.data.get<NoiseTerrainData>(recipeTerrain.value.definition)?.steps ?? []) : []).map((step, index) => ({
    index,
    kind: step.kind,
    enabled: step.enabled,
    seed: typeof step.params.seed === 'number' ? step.params.seed : null,
  })),
);
const reportRebuild = () => {
  const { ran, failed } = lastRebuildResult();
  context.ui.toast(
    failed.length ? t('noise.steps.failed', { count: ran, steps: failed.join(', ') }) : t('noise.steps.done', { count: ran }),
  );
};
const editStep = (index: number, change: { enabled?: boolean; seed?: number; remove?: boolean }) => {
  if (recipeTerrain.value && run(`s3d.editTerrainStep(${JSON.stringify({ target: recipeTerrain.value.id, index, ...change })});`)) {
    reportRebuild();
  }
};
const rebuildSteps = () => {
  if (recipeTerrain.value && run(`s3d.rebuildTerrain(${JSON.stringify({ target: recipeTerrain.value.id })});`)) {
    reportRebuild();
  }
};

const create = (replace: boolean) => {
  const instance = replace ? editing.value : null;
  hidePreview();
  const at = instance ? undefined : editor.toLocal(newOrigin()).toArray();
  const call = { ...normaliseSettings({ ...settings }), at, replace: instance?.id };
  if (run(`s3d.noiseTerrain(${JSON.stringify(call)});`)) {
    selectCreated();
    if (!instance) {
      editor.zoomExtents();
    }
  }
  refreshPreview();
};

// ------------------------------------------------------------ scatter
const scatterSettings = reactive({
  objects: ['conifer', 'tree', 'rock'] as string[],
  component: '',
  spacing: 4,
  density: 0.7,
  clumping: 0.6,
  clumpSize: 25,
  maxSlope: 32,
  sizeMin: 0.75,
  sizeMax: 1.3,
  seed: 1,
  offset: 0,
  alongPath: false,
  align: false,
  ...context.storage.get('scatter', {}),
});
watch(scatterSettings, (value) => context.storage.set('scatter', value), { deep: true });
const componentNames = computed(() => {
  void editor.ui.revision;
  return [...editor.model.definitions.values()]
    .filter((definition) => definition.isComponent && !context.data.get(definition))
    .map((definition) => definition.name)
    .sort();
});
/** what Scatter works on: the selected edges (a path), faces, or a terrain */
const scatterTarget = computed(() => {
  void editor.ui.selRev;
  const selection = editor.selected();
  const edges = selection.filter((entityRef) => entityRef.kind === 'edge').length,
    faces = selection.filter((entityRef) => entityRef.kind === 'face').length;
  if (edges) {
    return { kind: 'path', count: edges };
  }
  if (faces) {
    return { kind: 'faces', count: faces };
  }
  return { kind: 'terrain', count: 0 };
});
// rivers and roads on the selected (or newest) terrain
const riverSettings = reactive({ ...RIVER_DEFAULTS, ...context.storage.get('river', {}) });
watch(riverSettings, (value) => context.storage.set('river', value), { deep: true });
const runRiver = () => {
  if (run(`s3d.river(${JSON.stringify({ ...riverSettings, target: editing.value?.id })});`)) {
    context.ui.toast(t('noise.river.done', { length: Math.round(lastRouteLength()) }));
  }
};
const roadSettings = reactive({ ...ROAD_DEFAULTS, ...context.storage.get('road', {}) });
watch(roadSettings, (value) => context.storage.set('road', value), { deep: true });
const runRoad = () => {
  if (run(`s3d.road(${JSON.stringify({ ...roadSettings, target: editing.value?.id })});`)) {
    context.ui.toast(t('noise.road.done', { length: Math.round(lastRouteLength()) }));
  }
};

// a single grown tree, beside the model
const treeSettings = reactive({ ...TREE_DEFAULTS, ...context.storage.get('tree', {}) });
watch(treeSettings, (value) => context.storage.set('tree', value), { deep: true });
const runTree = () => {
  const box = editor.model.bounds();
  const spot = box.isEmpty() ? [0, 0] : [box.max.x + treeSettings.height * 0.5, (box.min.y + box.max.y) / 2];
  const at = editor.toLocal(new context.THREE.Vector3(spot[0], spot[1], 0)).toArray();
  if (run(`s3d.tree(${JSON.stringify({ ...treeSettings, at })});`)) {
    selectCreated();
  }
};

const runScatter = () => {
  const { component, objects, ...rest } = scatterSettings;
  const chosen = [...objects, ...(component ? [component] : [])];
  if (!chosen.length) {
    context.ui.toast(t('noise.scatter.nothingChosen'));
    return;
  }
  const { offset, alongPath, align, ...common } = rest;
  const target = scatterTarget.value.kind;
  const options = {
    ...common,
    objects: chosen,
    on: editing.value?.id ?? 'selection',
    ...(target === 'path' ? { offset, alongPath } : {}),
    ...(target === 'faces' ? { align } : {}),
  };
  if (run(`s3d.scatter(${JSON.stringify(options)});`)) {
    context.ui.toast(t('noise.scatter.done', { count: lastCreated()?.definition.entities.instances.size ?? 0 }));
  }
};

// ------------------------------------------------------------ deform
const deformSettings = reactive({
  amount: 0.15,
  scale: 1,
  detail: 0.3,
  octaves: 4,
  mode: 'fbm',
  seed: 1,
  twist: 0,
  taper: 1,
  bend: 0,
  ...context.storage.get('deform', {}),
});
watch(deformSettings, (value) => context.storage.set('deform', value), { deep: true });
const selectedGroups = computed(() => {
  void editor.ui.selRev;
  return editor.selected().filter((entityRef) => entityRef.kind === 'instance').length;
});
const runDeform = () => {
  if (run(`s3d.noiseDeform(${JSON.stringify(deformSettings)});`)) {
    context.ui.toast(t('noise.deform.done'));
  }
};

// ------------------------------------------------------------ paving
const pavingSettings = reactive({
  ...PAVING_DEFAULTS,
  width: 6,
  depth: 4,
  color: '#9a948a',
  joint: true,
  ...context.storage.get('paving', {}),
});
watch(pavingSettings, (value) => context.storage.set('paving', value), { deep: true });
const selectedFaces = computed(() => {
  void editor.ui.selRev;
  return editor.selected().filter((entityRef) => entityRef.kind === 'face').length;
});
const applyPavingPreset = (name: PavingPresetName) => Object.assign(pavingSettings, PAVING_PRESETS[name]);
const runPaving = () => {
  const { width, depth, ...options } = pavingSettings;
  let area: number[] | undefined;
  if (!selectedFaces.value) {
    // beside the model, like a new terrain
    const box = editor.model.bounds();
    const corner = box.isEmpty() ? [-width / 2, -depth / 2] : [box.max.x + 1, box.min.y];
    const local = editor.toLocal(new context.THREE.Vector3(corner[0], corner[1], 0));
    area = [local.x, local.y, local.x + width, local.y + depth];
  }
  if (run(`s3d.paving(${JSON.stringify({ ...options, area })});`)) {
    selectCreated();
    context.ui.toast(t('noise.paving.done', { count: lastCreated()?.definition.entities.faces.size ?? 0 }));
  }
};

// ------------------------------------------------------------ facades and cities
const facadeSettings = reactive({ ...FACADE_DEFAULTS, ...context.storage.get('facade', {}) });
watch(facadeSettings, (value) => context.storage.set('facade', value), { deep: true });
/** what a facade goes on: the selected faces, or the walls of the selected group */
const facadeTarget = computed(() => {
  void editor.ui.selRev;
  const selection = editor.selected();
  const faces = selection.filter((entityRef) => entityRef.kind === 'face').length;
  if (faces) {
    return { ok: true, on: 'selection' as const, text: t('noise.facade.onFaces', { count: faces }) };
  }
  const groups = selection.filter((entityRef) => entityRef.kind === 'instance');
  if (groups.length === 1) {
    return { ok: true, on: groups[0].id, text: t('noise.facade.onGroup') };
  }
  return { ok: false, on: 'selection' as const, text: t('noise.facade.noTarget') };
});
const runFacade = () => {
  if (run(`s3d.facade(${JSON.stringify({ ...facadeSettings, on: facadeTarget.value.on })});`)) {
    context.ui.toast(t('noise.facade.done'));
  }
};

const citySettings = reactive({ ...CITY_DEFAULTS, ...context.storage.get('city', {}) });
watch(citySettings, (value) => context.storage.set('city', value), { deep: true });
// a selected terrain (noise or Terrain tool): the city is built on it and takes its size
const cityTerrain = computed(() => {
  void editor.ui.selRev;
  const selection = editor.selected();
  if (selection.length !== 1 || selection[0].kind !== 'instance') {
    return null;
  }
  const instance = editor.entities.instances.get(selection[0].id);
  return instance && terrainGridOf(instance) ? instance : null;
});
// villages on the selected (or newest) terrain, connected by roads
const villageSettings = reactive({ ...VILLAGE_DEFAULTS, roads: 'gravel', ...context.storage.get('villages', {}) });
watch(villageSettings, (value) => context.storage.set('villages', value), { deep: true });
const runVillages = () => {
  if (run(`s3d.villages(${JSON.stringify({ ...villageSettings, target: cityTerrain.value?.id })});`)) {
    context.ui.toast(t('noise.village.done', { count: lastVillageHouses() }));
  }
};
const cityFlatten = ref<number>(context.storage.get('cityFlatten', 0.7));
watch(cityFlatten, (value) => context.storage.set('cityFlatten', value));
const runCity = () => {
  if (cityTerrain.value) {
    // the city takes the terrain's size
    const rest = Object.fromEntries(Object.entries(citySettings).filter(([key]) => key !== 'width' && key !== 'depth'));
    if (run(`s3d.city(${JSON.stringify({ ...rest, on: cityTerrain.value.id, flatten: cityFlatten.value })});`)) {
      context.ui.toast(t('noise.city.done', { count: lastCityBuildings() }));
    }
    return;
  }
  const box = editor.model.bounds();
  const corner = box.isEmpty() ? [-citySettings.width / 2, -citySettings.depth / 2] : [box.max.x + 10, box.min.y];
  const at = editor.toLocal(new context.THREE.Vector3(corner[0], corner[1], 0)).toArray();
  if (run(`s3d.city(${JSON.stringify({ ...citySettings, at })});`)) {
    selectCreated();
    editor.zoomExtents();
    context.ui.toast(t('noise.city.done', { count: lastCityBuildings() }));
  }
};

// ------------------------------------------------------------ script
const openExample = () => context.script.openInEditor('js', EXAMPLE);
</script>
