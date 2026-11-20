import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dDisplay from './S3dDisplay.vue';

const meta = {
  title: 'Panels/Display',
  component: S3dDisplay,
} satisfies Meta<typeof S3dDisplay>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
