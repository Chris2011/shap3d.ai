import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dScenes from './S3dScenes.vue';

const meta = {
  title: 'Panels/Scenes',
  component: S3dScenes,
} satisfies Meta<typeof S3dScenes>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
