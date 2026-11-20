import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dRemotePanel from './S3dRemotePanel.vue';

const meta = {
  title: 'Plugins/Remote API/RemotePanel',
  component: S3dRemotePanel,
} satisfies Meta<typeof S3dRemotePanel>;

export default meta;

export const Standard: StoryObj<typeof meta> = {};
