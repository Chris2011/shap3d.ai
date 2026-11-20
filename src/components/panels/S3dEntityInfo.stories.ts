import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dEntityInfo from './S3dEntityInfo.vue';

const meta = {
  title: 'Panels/EntityInfo',
  component: S3dEntityInfo,
} satisfies Meta<typeof S3dEntityInfo>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
