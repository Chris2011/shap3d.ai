import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dStylePresets from './S3dStylePresets.vue';

const meta = {
  title: 'Panels/Styles/StylePresets',
  component: S3dStylePresets,
} satisfies Meta<typeof S3dStylePresets>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
