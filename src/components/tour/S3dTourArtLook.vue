<template>
  <div class="ill look">
    <div class="mock">
      <div class="bar"></div>
      <div class="side"></div>
      <div class="view"><div class="mcube"></div></div>
    </div>
    <div class="toggle"><span class="knob"></span></div>
  </div>
</template>

<script setup lang="ts">
/** Step 6 – look: light ⇄ dark. Shared animation classes come from S3dTourArt.vue. */
</script>

<style scoped>
.look {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 30px;
}
.mock {
  width: 170px;
  height: 110px;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  animation: mockBg 4s steps(1) infinite;
}
.mock .bar {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 14px;
  animation: mockPanel 4s steps(1) infinite;
}
.mock .side {
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 0;
  width: 18px;
  animation: mockPanel 4s steps(1) infinite;
}
.mock .view {
  position: absolute;
  left: 18px;
  right: 0;
  top: 14px;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mcube {
  width: 30px;
  height: 30px;
  background: #c9cdd2;
  transform: rotate(45deg) skew(10deg, 10deg);
  border: 2px solid #0b0f14;
  animation: mockCube 4s steps(1) infinite;
}
.toggle {
  width: 54px;
  height: 30px;
  border-radius: 15px;
  position: relative;
  animation: tgl 4s steps(1) infinite;
}
.knob {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  animation: knob 4s cubic-bezier(0.5, 0, 0.2, 1) infinite;
}
@keyframes mockBg {
  0% {
    background: #e9edf1;
  }
  50% {
    background: #0e1520;
  }
}
@keyframes mockPanel {
  0% {
    background: #f7f8fa;
  }
  50% {
    background: #1a2028;
  }
}
@keyframes mockCube {
  0% {
    background: #e7e9ec;
    border-color: #0b0f14;
  }
  50% {
    background: #59616b;
    border-color: #c3cedb;
  }
}
@keyframes tgl {
  0% {
    background: #c3cad3;
  }
  50% {
    background: #2f8fd6;
  }
}
@keyframes knob {
  0%,
  40% {
    transform: none;
  }
  50%,
  90% {
    transform: translateX(24px);
  }
  100% {
    transform: none;
  }
}
</style>
