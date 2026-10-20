<template>
  <div
    v-if="splash.phase !== 'gone'"
    class="fixed inset-0 z-[9999] flex flex-col items-center gap-6.5 overflow-auto bg-brand-night bg-[linear-gradient(rgba(230,235,241,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(230,235,241,.035)_1px,transparent_1px)] bg-size-[2rem_2rem] bg-center px-4 py-6 font-[Segoe_UI,Inter,system-ui,sans-serif] transition-[opacity,visibility] duration-450 [justify-content:safe_center]"
    :class="{ 'invisible opacity-0': splash.phase === 'hiding' }"
    :role="splash.error ? 'alert' : 'status'"
    :aria-label="splash.error ? undefined : bootText('splash.loading', { name: BRAND.name })"
  >
    <!-- logo draws itself: outline, inner edges, then the glowing node with a pulsing ring -->
    <svg class="size-30 flex-none overflow-visible" viewBox="0 0 64 64" aria-hidden="true">
      <path :class="[EDGE, 'stroke-[2.2] animate-splash-draw']" pathLength="1" d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" />
      <path :class="[EDGE, 'stroke-[1.4] opacity-55 animate-splash-draw-late']" pathLength="1" d="M15 22 L32 32 L49 22 M32 32 V52" />
      <circle
        class="origin-center fill-none stroke-brand stroke-[1.2] opacity-0 [transform-box:fill-box] animate-splash-ring motion-reduce:animate-none"
        cx="32"
        cy="32"
        r="6.5"
      />
      <circle
        class="origin-center fill-brand drop-shadow-[0_0_0.375rem_rgba(95,212,230,.7)] [transform-box:fill-box] animate-splash-pop motion-reduce:animate-none"
        cx="32"
        cy="32"
        r="3.4"
      />
    </svg>

    <!-- "Shap3D.ai" letter by letter – 3D and ai light up in the accent colour -->
    <div class="flex flex-none text-[2.125rem] font-semibold tracking-[0.0625rem] text-brand-ice">
      <component
        :is="letter.accent ? 'b' : 'span'"
        v-for="(letter, i) in LETTERS"
        :key="i"
        :class="
          letter.accent
            ? 'font-bold animate-splash-in-lit motion-reduce:animate-none motion-reduce:text-brand'
            : 'animate-splash-in motion-reduce:animate-none'
        "
        :style="{ animationDelay: letter.delay }"
        >{{ letter.ch }}</component
      >
    </div>
    <div class="flex-none text-[0.8125rem] tracking-[0.15625rem] text-[#7d8794] uppercase animate-splash-tag motion-reduce:animate-none">
      {{ bootText('brand.tagline') }}
    </div>

    <div
      v-if="!splash.error"
      class="relative h-0.5 w-40 flex-none overflow-hidden rounded-full bg-[rgba(230,235,241,.08)] after:absolute after:inset-y-0 after:left-0 after:w-2/5 after:bg-brand after:content-[''] after:animate-splash-load motion-reduce:after:animate-none"
    ></div>

    <!-- the app cannot start: explain why instead of hanging on the loading screen -->
    <div
      v-else
      class="max-w-140 flex-none rounded-[0.625rem] border border-[#22313d] bg-[#101820] px-5.5 py-4.5 text-sm/[1.55] text-[#c8d1da] [&_code]:rounded-[0.25rem] [&_code]:border [&_code]:border-[#22313d] [&_code]:bg-brand-night [&_code]:px-1.25 [&_code]:py-0.25 [&_code]:font-mono [&_code]:text-xs [&_code]:text-brand"
    >
      <template v-if="splash.error.kind === 'webgl'">
        <h2 class="mb-2 text-lg font-bold text-brand-ice">{{ bootText('splash.webglTitle') }}</h2>
        <p>{{ bootText('splash.webglText', { name: BRAND.name }) }}</p>
        <ol class="mt-2.5 mb-3.5 list-decimal ps-5">
          <li>
            <b>{{ bootText('splash.webglRestart') }}</b> {{ bootText('splash.webglRestartHint') }}
          </li>
          <li>
            {{ bootText('splash.webglAcceleration') }} <code>{{ bootText('splash.webglAccelerationPath') }}</code
            >.
          </li>
          <li>
            <template v-for="(part, i) in withCode(bootText('splash.webglStatus'))" :key="i"
              ><code v-if="part.code">{{ part.text }}</code
              ><template v-else>{{ part.text }}</template></template
            >
          </li>
          <li>{{ bootText('splash.webglDrivers') }}</li>
        </ol>
      </template>
      <template v-else>
        <h2 class="mb-2 text-lg font-bold text-brand-ice">{{ bootText('splash.failedTitle', { name: BRAND.name }) }}</h2>
        <p>{{ bootText('splash.failedText') }}</p>
        <pre
          v-if="splash.error.detail"
          class="my-3 max-h-40 overflow-auto rounded-[0.25rem] border border-[#22313d] bg-brand-night p-2 font-mono text-xs whitespace-pre-wrap text-brand select-text"
          >{{ splash.error.detail }}</pre>
      </template>
      <button type="button" class="mt-1 h-8 rounded-[0.25rem] bg-brand-deep px-4 font-semibold text-white" @click="reload()">
        {{ bootText('splash.reload') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BRAND } from '../brand';
import { splash } from './splashState';
import { bootText } from '../i18n/boot';

/** Logo strokes: drawn via a 0…1 dash offset (pathLength="1"); fully drawn when motion is reduced. */
const EDGE = 'fill-none stroke-brand-ice [stroke-linecap:round] [stroke-linejoin:round] [stroke-dasharray:1] motion-reduce:animate-none';

/** Letters appear one after another (50 ms apart); 3D and ai light up 0.35 s after they appear. */
const LETTERS = [...BRAND.name].map((letter, i) => {
  const accent = i >= 4 && letter !== '.';
  const start = 1 + i * 0.05;
  return { ch: letter, accent, delay: accent ? `${start.toFixed(2)}s, ${(start + 0.35).toFixed(2)}s` : `${start.toFixed(2)}s` };
});
const reload = () => location.reload();
/** "… {chrome} …" → text and <code> parts */
const CODE: Record<string, string> = { chrome: 'chrome://gpu', edge: 'edge://gpu' };
const withCode = (text: string) =>
  text.split(/\{(\w+)\}/).map((part, i) => ({ text: i % 2 ? (CODE[part] ?? part) : part, code: i % 2 === 1 }));
</script>
