import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dCompletionPopup from './S3dCompletionPopup.vue';

const meta = {
  title: 'Panels/CompletionPopup',
  component: S3dCompletionPopup,
  args: {
    items: [
      {
        label: 'box',
        kind: 'method',
        detail: 'Körper',
        signature: 's3d.box(position, width, depth, height, options?)',
        description: 'Ein Quader.',
      },
      { label: 'boolean', kind: 'method', detail: 'Solid' },
      { label: 'bottom', kind: 'property' },
    ],
    selected: 0,
    anchor: { x: 24, top: 24, bottom: 44 },
    word: 'bo',
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof S3dCompletionPopup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
