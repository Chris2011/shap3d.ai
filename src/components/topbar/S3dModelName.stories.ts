import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dModelName from './S3dModelName.vue';

const meta = {
  title: 'Top bar/ModelName',
  component: S3dModelName,
} satisfies Meta<typeof S3dModelName>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
