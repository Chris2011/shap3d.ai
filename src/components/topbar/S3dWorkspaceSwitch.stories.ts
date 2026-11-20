import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dWorkspaceSwitch from './S3dWorkspaceSwitch.vue';
import { addWorkspace } from '../../plugins/uiExtensions';

const meta = {
  title: 'Top bar/WorkspaceSwitch',
  component: S3dWorkspaceSwitch,
  parameters: { layout: 'fullscreen' },
  render: () => ({
    components: { S3dWorkspaceSwitch },
    setup: () => {
      // the switch shows once a plugin brings a workspace (like the LayOut package's sheets)
      const remove = addWorkspace({ id: 'demo.sheets', label: 'Pläne', icon: 'file', component: { template: '<div />' } });
      onUnmounted(remove);
    },
    template: '<div class="relative h-16"><S3dWorkspaceSwitch /></div>',
  }),
} satisfies Meta<typeof S3dWorkspaceSwitch>;

export default meta;

export const WithWorkspace: StoryObj<typeof meta> = {};
