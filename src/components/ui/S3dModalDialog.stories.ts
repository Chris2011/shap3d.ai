import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dModalDialog from './S3dModalDialog.vue';

const meta = {
  title: 'UI/ModalDialog',
  component: S3dModalDialog,
  args: { title: 'Modell-Info', panelClass: 'w-[420px]' },
  render: (args) => ({
    components: { S3dModalDialog },
    setup: () => ({ args }),
    template: `<S3dModalDialog v-bind="args"><div class="p-4">Inhalt des Dialogs</div></S3dModalDialog>`,
  }),
} satisfies Meta<typeof S3dModalDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = { parameters: { layout: 'fullscreen' } };
export const WithoutTitle: Story = { args: { title: undefined }, parameters: { layout: 'fullscreen' } };
