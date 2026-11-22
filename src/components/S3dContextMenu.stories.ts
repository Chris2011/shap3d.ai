import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dContextMenu from './S3dContextMenu.vue';
import { useEditor } from './keys';

const meta = {
  title: 'App/ContextMenu',
  component: S3dContextMenu,
  args: { x: 24, y: 24 },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof S3dContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};

/** the three chairs of the demo model selected – the menu offers Align and Distribute */
export const SeveralObjects: Story = {
  render: (args) => ({
    components: { S3dContextMenu },
    setup: () => {
      const editor = useEditor();
      const chairs = [...editor.model.root.instances.values()].filter((instance) => instance.definition.name === 'Stuhl');
      editor.select(chairs.map((instance) => ({ kind: 'instance' as const, id: instance.id })));
      onUnmounted(() => editor.select([]));
      return { args };
    },
    template: '<S3dContextMenu v-bind="args" />',
  }),
};
