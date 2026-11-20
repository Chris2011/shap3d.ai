import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dComponents from './S3dComponents.vue';

const meta = {
  title: 'Panels/Components',
  component: S3dComponents,
} satisfies Meta<typeof S3dComponents>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
