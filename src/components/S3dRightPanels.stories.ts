import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dRightPanels from './S3dRightPanels.vue';

const meta = {
  title: 'App/RightPanels',
  component: S3dRightPanels,
} satisfies Meta<typeof S3dRightPanels>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
