import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialCreate from './S3dMaterialCreate.vue';

const meta = {
  title: 'Panels/Materials/MaterialCreate',
  component: S3dMaterialCreate,
} satisfies Meta<typeof S3dMaterialCreate>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
