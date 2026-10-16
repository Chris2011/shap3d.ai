import { ref } from 'vue';

export const openPanel = ref<string | null>(null);
export function showPanel(id: string) { openPanel.value = id; }
