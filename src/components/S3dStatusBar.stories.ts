import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dStatusBar from './S3dStatusBar.vue';

const meta = {
  title: 'App/StatusBar',
  component: S3dStatusBar,
} satisfies Meta<typeof S3dStatusBar>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
