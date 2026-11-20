import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dShadows from './S3dShadows.vue';

const meta = {
  title: 'Panels/Shadows',
  component: S3dShadows,
} satisfies Meta<typeof S3dShadows>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
