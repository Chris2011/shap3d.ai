import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dModelSearch from './S3dModelSearch.vue';

const meta = {
  title: 'Plugins/AI/ModelSearch',
  component: S3dModelSearch,
} satisfies Meta<typeof S3dModelSearch>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
