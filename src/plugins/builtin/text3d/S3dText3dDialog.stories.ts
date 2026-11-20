import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dText3dDialog from './S3dText3dDialog.vue';

const meta = {
  title: 'Plugins/3D text/Text3dDialog',
  component: S3dText3dDialog,
} satisfies Meta<typeof S3dText3dDialog>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
