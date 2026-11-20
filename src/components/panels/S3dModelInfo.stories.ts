import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dModelInfo from './S3dModelInfo.vue';

const meta = {
  title: 'Panels/ModelInfo',
  component: S3dModelInfo,
} satisfies Meta<typeof S3dModelInfo>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
