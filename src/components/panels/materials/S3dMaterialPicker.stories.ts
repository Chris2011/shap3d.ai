import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMaterialPicker from './S3dMaterialPicker.vue';

const meta = {
  title: 'Panels/Materials/MaterialPicker',
  component: S3dMaterialPicker,
} satisfies Meta<typeof S3dMaterialPicker>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
