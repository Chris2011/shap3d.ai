import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterials from './S3dMaterials.vue';

const meta = {
  title: 'Panels/Materials',
  component: S3dMaterials,
} satisfies Meta<typeof S3dMaterials>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
