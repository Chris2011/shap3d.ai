import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dMenuSeparator from './S3dMenuSeparator.vue';

const meta = {
  title: 'UI/MenuSeparator',
  component: S3dMenuSeparator,
} satisfies Meta<typeof S3dMenuSeparator>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
