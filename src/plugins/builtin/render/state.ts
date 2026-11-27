import { reactive } from 'vue';

/** whether the render window is open; `request` counts the times a new picture was asked for */
export const renderUi = reactive({ open: false, request: 0 });
