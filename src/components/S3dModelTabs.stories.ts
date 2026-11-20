import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dModelTabs from './S3dModelTabs.vue';
import { useEditor } from './keys';
import { modelTabs, openNewTab, switchTab, closeTab } from '../engine/modelTabs';

const meta = {
  title: 'App/ModelTabs',
  component: S3dModelTabs,
  parameters: { layout: 'fullscreen' },
  render: () => ({
    components: { S3dModelTabs },
    setup: () => {
      // the tabs show from two models on: open an empty second one, show the demo model again
      const editor = useEditor();
      const first = modelTabs.list[0]?.id;
      openNewTab(editor);
      const second = modelTabs.active;
      if (first !== undefined) {
        switchTab(editor, first);
      }
      onUnmounted(() => closeTab(editor, second));
    },
    template: '<div class="relative h-40"><S3dModelTabs /></div>',
  }),
} satisfies Meta<typeof S3dModelTabs>;

export default meta;

export const TwoModels: StoryObj<typeof meta> = {};
