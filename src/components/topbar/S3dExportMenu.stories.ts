import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dExportMenu from './S3dExportMenu.vue';

const meta = {
  title: 'Top bar/ExportMenu',
  component: S3dExportMenu,
} satisfies Meta<typeof S3dExportMenu>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
