import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dCommandPalette from './S3dCommandPalette.vue';

const meta = {
  title: 'App/CommandPalette',
  component: S3dCommandPalette,
} satisfies Meta<typeof S3dCommandPalette>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
