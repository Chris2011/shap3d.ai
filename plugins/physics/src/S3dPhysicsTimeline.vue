<template>
  <!-- the timeline of what has been simulated, and a video of the view -->
  <div class="s3d-ph-timeline">
    <div class="s3d-ph-row">
      <span class="s3d-ph-small">{{ t('physics.timeline.label') }}</span>
      <span class="s3d-ph-time">{{ t('physics.timeline.position', { time: shown.toFixed(1), end: state.recorded.toFixed(1) }) }}</span>
    </div>
    <input
      type="range"
      min="0"
      :max="Math.max(state.recorded, 0.01)"
      step="0.0333"
      :value="shown"
      :disabled="!state.recorded || state.status === 'loading'"
      :aria-label="t('physics.timeline.label')"
      @input="scrubTo(Number(($event.target as HTMLInputElement).value))"
    />
    <p v-if="!state.recorded" class="s3d-ph-hint">{{ t('physics.timeline.empty') }}</p>
    <p v-else-if="rewound" class="s3d-ph-hint">{{ t('physics.timeline.rewound') }}</p>
    <div class="s3d-ph-row">
      <button v-if="!state.recording" class="s3d-btn" :title="t('physics.record.hint')" @click="record">
        <span class="s3d-ph-rec-dot" /> {{ t('physics.record.start') }}
      </button>
      <button v-else class="s3d-btn primary" @click="stopRecording">
        ■ {{ t('physics.record.stop', { time: clock(state.recording.seconds) }) }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { startRecording, stopRecording } from './recorder';
import { scrubTo, startSim } from './sim';
import { t } from './runtime';
import { usePhysicsState } from './state';

const state = usePhysicsState();

const shown = computed(() => state.scrub ?? Math.min(state.time, state.recorded));
/** an earlier moment is shown: going on simulates from there again */
const rewound = computed(() => state.scrub !== null && state.scrub < state.recorded - 0.05);

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** records the view – and starts the simulation, if it is not running, so there is something to see */
const record = () => {
  startRecording();
  if (state.status !== 'running') {
    void startSim();
  }
};
</script>
