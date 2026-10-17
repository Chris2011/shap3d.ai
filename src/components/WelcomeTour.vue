<template>
  <div v-if="tour.open" class="bg" @pointerdown.self="closeTour()" @keydown.stop>
    <div class="card s3d-panel" role="dialog" aria-modal="true" :aria-label="`Einführung, Schritt ${tour.step + 1} von ${STEPS.length}`">
      <button class="x" title="Einführung schließen (Esc)" @click="closeTour()"><Icon name="close" :size="16" /></button>

      <!-- illustration – :key restarts the animation on every step -->
      <div class="art" :key="tour.step">
        <!-- 1 welcome: the logo draws itself -->
        <svg v-if="tour.step === 0" viewBox="0 0 300 170" class="ill">
          <g transform="translate(118 38) scale(1)">
            <rect width="64" height="64" rx="14" fill="#0d1218" />
            <path class="draw d1" pathLength="1" d="M32 12 L49 22 V42 L32 52 L15 42 V22 Z" fill="none" stroke="#e6ebf1" stroke-width="2.2" stroke-linejoin="round" />
            <path class="draw d2" pathLength="1" d="M15 22 L32 32 L49 22 M32 32 V52" fill="none" stroke="#e6ebf1" stroke-opacity=".55" stroke-width="1.4" />
            <circle class="pop p1" cx="32" cy="32" r="3.4" fill="#5fd4e6" />
            <circle class="ring" cx="32" cy="32" r="6.5" fill="none" stroke="#5fd4e6" stroke-width="1.2" />
          </g>
          <text x="150" y="128" text-anchor="middle" class="word">Shap<tspan class="acc">3D</tspan>.<tspan class="acc">ai</tspan></text>
          <text x="150" y="150" text-anchor="middle" class="say">sprich „{{ BRAND.pronounced }}“</text>
        </svg>

        <!-- 2 draw + push/pull: a rectangle becomes a box -->
        <svg v-else-if="tour.step === 1" viewBox="0 0 300 170" class="ill">
          <defs><clipPath id="grow"><rect class="grow" x="0" y="0" width="300" height="170" /></clipPath></defs>
          <path d="M40 125 L150 160 L260 125 L150 90 Z" class="ground" />
          <path class="draw d1" pathLength="1" d="M95 118 L150 136 L205 118 L150 100 Z" fill="none" stroke="#0e8ca0" stroke-width="2" />
          <g clip-path="url(#grow)" class="box">
            <path d="M95 118 L150 136 L150 78 L95 60 Z" class="face l" />
            <path d="M150 136 L205 118 L205 60 L150 78 Z" class="face r" />
            <path d="M95 60 L150 78 L205 60 L150 42 Z" class="face t" />
          </g>
          <g class="arrow"><path d="M150 54 V22 M141 31 L150 22 L159 31" fill="none" stroke="#d0312d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></g>
          <g class="keys"><rect x="14" y="14" width="22" height="22" rx="4" /><text x="25" y="30">R</text><rect x="42" y="14" width="22" height="22" rx="4" /><text x="53" y="30">P</text></g>
        </svg>

        <!-- 3 navigation: orbiting cube + mouse -->
        <div v-else-if="tour.step === 2" class="ill nav">
          <div class="scene"><div class="cube"><span class="f1"></span><span class="f2"></span><span class="f3"></span><span class="f4"></span><span class="f5"></span><span class="f6"></span></div></div>
          <svg viewBox="0 0 60 90" class="mouse"><rect x="6" y="4" width="48" height="80" rx="24" fill="none" stroke="currentColor" stroke-width="2.4" /><path d="M30 4 V36 M6 36 H54" stroke="currentColor" stroke-width="2" /><rect class="wheel" x="26" y="14" width="8" height="14" rx="4" /></svg>
        </div>

        <!-- 4 AI: a prompt turns into a house -->
        <svg v-else-if="tour.step === 3" viewBox="0 0 300 170" class="ill">
          <rect x="18" y="20" width="168" height="40" rx="10" class="bubble" />
          <text x="32" y="45" class="typed">„Ein kleines Haus“</text>
          <g class="dots"><circle cx="40" cy="84" r="4" /><circle cx="54" cy="84" r="4" /><circle cx="68" cy="84" r="4" /></g>
          <g class="house">
            <path d="M200 140 L240 154 L240 112 L200 98 Z" class="face l" /><path d="M240 154 L278 140 L278 98 L240 112 Z" class="face r" />
            <path d="M196 100 L240 115 L240 82 L216 70 Z" class="roof" /><path d="M240 115 L282 100 L262 70 L240 82 Z" class="roof r2" />
            <rect x="252" y="122" width="10" height="20" class="door" />
          </g>
          <path class="spark" d="M230 50 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 z" />
        </svg>

        <!-- 5 terrain, scripts, import -->
        <div v-else-if="tour.step === 4" class="ill trio">
          <div class="tile"><svg viewBox="0 0 80 60"><path class="draw d1" pathLength="1" d="M4 52 L24 26 L36 38 L50 14 L76 52" fill="none" stroke="#3e9b4b" stroke-width="3" stroke-linejoin="round" /><path class="snow" d="M44 23 L50 14 L56 23 Z" /></svg><b>Gelände</b></div>
          <div class="tile"><svg viewBox="0 0 80 60"><rect class="ln l1" x="8" y="12" height="6" rx="3" /><rect class="ln l2" x="16" y="26" height="6" rx="3" /><rect class="ln l3" x="16" y="40" height="6" rx="3" /></svg><b>Skripte</b></div>
          <div class="tile"><svg viewBox="0 0 80 60"><path class="tray" d="M10 40 V52 H70 V40" fill="none" stroke-width="3" /><g class="file"><path d="M30 6 H46 L54 14 V34 H30 Z" /><text x="42" y="28" text-anchor="middle">SKP</text></g></svg><b>Import</b></div>
        </div>

        <!-- 6 look: light ⇄ dark -->
        <div v-else class="ill look">
          <div class="mock"><div class="bar"></div><div class="side"></div><div class="view"><div class="mcube"></div></div></div>
          <div class="toggle"><span class="knob"></span></div>
        </div>
      </div>

      <div class="text">
        <div class="kicker">Schritt {{ tour.step + 1 }} von {{ STEPS.length }}</div>
        <h2>{{ cur.title }}</h2>
        <p>{{ cur.text }}</p>
        <ul v-if="cur.tips" class="tips"><li v-for="t in cur.tips" :key="t" v-html="t"></li></ul>
        <button v-if="cur.action" class="s3d-btn small act" @click="cur.action.run()">{{ cur.action.label }}</button>
      </div>

      <div class="foot">
        <div class="dots-nav">
          <button v-for="(s, i) in STEPS" :key="s.title" class="dot" :class="{ on: i === tour.step, past: i < tour.step }" :title="s.title" :aria-label="`Schritt ${i + 1}: ${s.title}`" @click="tour.step = i"></button>
        </div>
        <span class="sp"></span>
        <button v-if="tour.step === 0" class="lnk" @click="closeTour()">Überspringen</button>
        <button v-else class="s3d-btn" @click="tour.step--">Zurück</button>
        <button class="s3d-btn primary" @click="next()">{{ tour.step === STEPS.length - 1 ? 'Loslegen' : tour.step === 0 ? 'Los geht’s' : 'Weiter' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
import { BRAND } from '../brand';
import { tour, closeTour } from './tour';
import { openPanel } from './panelState';

const STEPS: { title: string; text: string; tips?: string[]; action?: { label: string; run: () => void } }[] = [
  { title: `Willkommen bei ${BRAND.name}`, text: 'Easy 3D-Modellieren direkt im Browser – mit einer KI, die auf deinem eigenen Rechner läuft. In ein paar kurzen Schritten zeigen wir dir das Wichtigste.' },
  { title: 'Zeichnen und hochziehen', text: 'Zeichne eine Fläche auf den Boden und zieh sie mit Drücken/Ziehen in die Höhe – so entstehen Wände, Möbel und ganze Häuser.',
    tips: ['<kbd>R</kbd> Rechteck, <kbd>C</kbd> Kreis, <kbd>L</kbd> Linie', '<kbd>P</kbd> Drücken/Ziehen, <kbd>M</kbd> Verschieben', 'Maße einfach eintippen, z. B. <kbd>2,5</kbd> <kbd>Enter</kbd>'] },
  { title: 'Umsehen', text: 'Mit der Maus bewegst du dich frei durch dein Modell.',
    tips: ['Mittlere Maustaste ziehen = drehen (Orbit)', '<kbd>Umschalt</kbd> + mittlere Maustaste = schwenken', 'Mausrad = zoomen · <kbd>Umschalt</kbd>+<kbd>Z</kbd> = alles zeigen'] },
  { title: 'Der KI-Assistent', text: 'Beschreib einfach, was du haben willst – „Ein Tisch mit 4 Stühlen“ oder „eine Spinne mit roten Augen“ – und die KI baut es. Sie läuft lokal, z. B. mit Ollama; ein Assistent hilft beim Einrichten.',
    action: { label: '✦ KI-Assistent öffnen', run: () => { closeTour(); openPanel.value = 'ai'; } } },
  { title: 'Gelände, Skripte und Import', text: 'Forme Berge und Täler mit dem Gelände-Werkzeug, baue Objekte per Skript (s3d.box …) oder zieh Dateien aus SketchUp, Blender, 3ds Max & Co. einfach ins Fenster.',
    tips: ['Werkzeug <b>Gelände</b> – Pinsel für Hügel, Täler und Texturen', 'Skript-Editor rechts – mit API-Info und Beispielen', 'SKP · BLEND · FBX · 3DS · DAE · OBJ · STL · glTF …'] },
  { title: 'Dein Look', text: 'Oben schaltest du zwischen Hell und Dunkel um – auch nur die Menüs oder eine Nachtszene. Diese Einführung findest du jederzeit wieder im Menü.',
    tips: ['☾ / ☀ oben links – Pfeil daneben für mehr Optionen', '<b>Menü › Einführung</b> öffnet diese Tour erneut'] },
];
const cur = computed(() => STEPS[tour.step] ?? STEPS[0]);
function next() { if (tour.step < STEPS.length - 1) tour.step++; else closeTour(); }

function key(e: KeyboardEvent) {
  if (!tour.open) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeTour(); }
  else if (e.key === 'ArrowRight') { e.stopPropagation(); next(); }
  else if (e.key === 'ArrowLeft' && tour.step > 0) { e.stopPropagation(); tour.step--; }
}
onMounted(() => window.addEventListener('keydown', key, true));
onUnmounted(() => window.removeEventListener('keydown', key, true));
</script>

<style scoped>
.bg { position: fixed; inset: 0; z-index: 120; background: rgba(8, 12, 18, .45); display: flex; align-items: center; justify-content: center; animation: fade .25s ease-out; }
.card { position: relative; width: min(520px, 94vw); overflow: hidden; border-radius: 10px; animation: rise .35s cubic-bezier(.2, .9, .3, 1.2); }
.x { position: absolute; top: 8px; right: 8px; z-index: 2; border: 0; background: transparent; cursor: pointer; width: 28px; height: 28px; border-radius: 4px; color: var(--s3d-text-2); display: flex; align-items: center; justify-content: center; }
.x:hover { background: var(--s3d-hover); }
.art { height: 190px; background: #0b0f14; background-image: linear-gradient(rgba(230, 235, 241, .04) 1px, transparent 1px), linear-gradient(90deg, rgba(230, 235, 241, .04) 1px, transparent 1px); background-size: 24px 24px; display: flex; align-items: center; justify-content: center; }
.ill { width: 100%; height: 100%; max-width: 360px; }
.text { padding: 16px 22px 6px; }
.kicker { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: var(--s3d-muted); font-weight: 700; }
h2 { margin: 4px 0 6px; font-size: 19px; color: var(--s3d-text); }
p { margin: 0; line-height: 1.5; color: var(--s3d-text-2); font-size: 13.5px; }
.tips { margin: 10px 0 0; padding-left: 18px; color: var(--s3d-text); font-size: 12.5px; line-height: 1.8; }
.tips :deep(kbd) { font: 11px Consolas, monospace; background: var(--s3d-bg-2); border: 1px solid var(--s3d-line-2); border-bottom-width: 2px; border-radius: 3px; padding: 0 5px; }
.act { margin-top: 12px; }
.foot { display: flex; align-items: center; gap: 8px; padding: 14px 22px 18px; }
.sp { flex: 1; }
.dots-nav { display: flex; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; background: var(--s3d-line-2); transition: width .2s, background .2s; }
.dot.past { background: #5fa9bf; }
.dot.on { width: 22px; border-radius: 4px; background: #0e8ca0; }
.lnk { border: 0; background: transparent; color: var(--s3d-text-2); cursor: pointer; font-size: 13px; padding: 0 6px; }
.lnk:hover { color: var(--s3d-text); text-decoration: underline; }

/* ---------- animations ---------- */
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .8s cubic-bezier(.6, 0, .2, 1) forwards; }
.d2 { animation-delay: .55s; }
.pop { transform-box: fill-box; transform-origin: center; transform: scale(0); animation: pop .45s cubic-bezier(.3, 1.6, .5, 1) .95s forwards; }
.ring { transform-box: fill-box; transform-origin: center; opacity: 0; animation: ring 1.8s ease-out 1.1s infinite; }
.word { font: 600 26px 'Segoe UI', Inter, sans-serif; fill: #e6ebf1; letter-spacing: 1px; opacity: 0; animation: fadeUp .5s ease-out 1.1s forwards; }
.word .acc { fill: #5fd4e6; font-weight: 700; }
.say { font: 12px 'Segoe UI', Inter, sans-serif; fill: #7d8794; opacity: 0; animation: fadeUp .5s ease-out 1.5s forwards; }

.ground { fill: #142029; stroke: #22313d; }
.face.l { fill: #c9cdd2; } .face.r { fill: #9ea5ad; } .face.t { fill: #e7e9ec; }
.face { stroke: #0b0f14; stroke-width: 1.2; stroke-linejoin: round; }
.box { animation: none; }
.grow { transform-box: view-box; transform-origin: 150px 170px; transform: scaleY(.18); animation: grow 1.4s cubic-bezier(.5, 0, .2, 1) .9s infinite alternate; }
.arrow { opacity: 0; animation: arrow 1.4s ease-in-out .9s infinite alternate; }
.keys rect { fill: #1b2631; stroke: #3a4a58; } .keys text { font: 700 12px Consolas, monospace; fill: #e6ebf1; text-anchor: middle; }

.nav { display: flex; align-items: center; justify-content: center; gap: 46px; color: #e6ebf1; }
.scene { width: 90px; height: 90px; perspective: 420px; }
.cube { position: relative; width: 90px; height: 90px; transform-style: preserve-3d; animation: spin 6s linear infinite; }
.cube span { position: absolute; inset: 0; border: 2px solid #0b0f14; }
.f1 { background: #e7e9ec; transform: translateZ(45px); } .f2 { background: #9ea5ad; transform: rotateY(180deg) translateZ(45px); }
.f3 { background: #c9cdd2; transform: rotateY(90deg) translateZ(45px); } .f4 { background: #b4bac1; transform: rotateY(-90deg) translateZ(45px); }
.f5 { background: #5fd4e6; transform: rotateX(90deg) translateZ(45px); } .f6 { background: #6b737c; transform: rotateX(-90deg) translateZ(45px); }
.mouse { width: 52px; height: 78px; }
.wheel { fill: #5fd4e6; animation: wheel 1.2s ease-in-out infinite; }

.bubble { fill: #1b2631; stroke: #3a4a58; }
.typed { font: 15px 'Segoe UI', Inter, sans-serif; fill: #e6ebf1; clip-path: inset(0 100% 0 0); animation: type 1.2s steps(16) .2s forwards; }
.dots circle { fill: #5fd4e6; opacity: .25; animation: blink 1s ease-in-out 1.4s 2; }
.dots circle:nth-child(2) { animation-delay: 1.55s; } .dots circle:nth-child(3) { animation-delay: 1.7s; }
.house { transform-box: fill-box; transform-origin: 50% 100%; transform: scale(0); animation: pop .6s cubic-bezier(.3, 1.5, .5, 1) 3.3s forwards; }
.roof { fill: #c0503a; stroke: #0b0f14; stroke-width: 1.2; } .roof.r2 { fill: #9c3c2b; } .door { fill: #7a4e2a; }
.spark { fill: #5fd4e6; transform-box: fill-box; transform-origin: center; transform: scale(0); animation: pop .4s ease-out 3.1s forwards, twinkle 1.6s ease-in-out 3.6s infinite; }

.trio { display: flex; align-items: center; justify-content: center; gap: 18px; }
.tile { width: 92px; height: 110px; border: 1px solid #22313d; background: #101820; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #c8d1da; font-size: 12px; }
.tile svg { width: 74px; height: 56px; }
.snow { fill: #f3f6f9; opacity: 0; animation: fadeUp .4s ease-out .9s forwards; }
.ln { fill: #5fd4e6; width: 0; animation: lines 2.4s ease-out infinite; }
.l2 { fill: #d2a8ff; animation-delay: .25s; } .l3 { fill: #7ee787; animation-delay: .5s; }
.tray { stroke: #5fd4e6; }
.file path { fill: #e6ebf1; } .file text { font: 700 8px Consolas, monospace; fill: #0b0f14; }
.file { animation: drop 2.2s cubic-bezier(.5, 0, .5, 1) infinite; }

.look { display: flex; align-items: center; justify-content: center; gap: 30px; }
.mock { width: 170px; height: 110px; border-radius: 6px; overflow: hidden; position: relative; animation: mockBg 4s steps(1) infinite; }
.mock .bar { position: absolute; left: 0; right: 0; top: 0; height: 14px; animation: mockPanel 4s steps(1) infinite; }
.mock .side { position: absolute; left: 0; top: 14px; bottom: 0; width: 18px; animation: mockPanel 4s steps(1) infinite; }
.mock .view { position: absolute; left: 18px; right: 0; top: 14px; bottom: 0; display: flex; align-items: center; justify-content: center; }
.mcube { width: 30px; height: 30px; background: #c9cdd2; transform: rotate(45deg) skew(10deg, 10deg); border: 2px solid #0b0f14; animation: mockCube 4s steps(1) infinite; }
.toggle { width: 54px; height: 30px; border-radius: 15px; position: relative; animation: tgl 4s steps(1) infinite; }
.knob { position: absolute; top: 4px; left: 4px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .4); animation: knob 4s cubic-bezier(.5, 0, .2, 1) infinite; }

@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.97); } }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes pop { to { transform: scale(1); } }
@keyframes ring { 0% { opacity: .6; transform: scale(.6); } 100% { opacity: 0; transform: scale(2.3); } }
@keyframes fadeUp { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@keyframes grow { to { transform: scaleY(1); } }
@keyframes arrow { 0% { opacity: 0; transform: translateY(16px); } 100% { opacity: 1; transform: none; } }
@keyframes spin { from { transform: rotateX(-24deg) rotateY(0); } to { transform: rotateX(-24deg) rotateY(360deg); } }
@keyframes wheel { 50% { transform: translateY(5px); opacity: .5; } }
@keyframes type { to { clip-path: inset(0 0 0 0); } }
@keyframes blink { 50% { opacity: 1; } }
@keyframes twinkle { 50% { transform: scale(.6) rotate(45deg); opacity: .6; } }
@keyframes lines { 0% { width: 0; } 40%, 100% { width: 54px; } }
@keyframes drop { 0% { transform: translateY(-14px); opacity: 0; } 30% { opacity: 1; } 60%, 100% { transform: translateY(12px); opacity: 1; } }
@keyframes mockBg { 0% { background: #e9edf1; } 50% { background: #0e1520; } }
@keyframes mockPanel { 0% { background: #f7f8fa; } 50% { background: #1a2028; } }
@keyframes mockCube { 0% { background: #e7e9ec; border-color: #0b0f14; } 50% { background: #59616b; border-color: #c3cedb; } }
@keyframes tgl { 0% { background: #c3cad3; } 50% { background: #2f8fd6; } }
@keyframes knob { 0%, 40% { transform: none; } 50%, 90% { transform: translateX(24px); } 100% { transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .art *, .bg, .card { animation-duration: 1ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; }
}
</style>
