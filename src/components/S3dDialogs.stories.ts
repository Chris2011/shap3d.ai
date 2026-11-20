import { onUnmounted } from 'vue';
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import S3dDialogs from './S3dDialogs.vue';
import { useEditor } from './keys';

/** opens one of the editor's dialogs while the story is shown */
const showing = (open: (editor: ReturnType<typeof useEditor>) => void) => ({
  render: () => ({
    components: { S3dDialogs },
    setup: () => {
      const editor = useEditor();
      open(editor);
      onUnmounted(() => {
        editor.ui.dialog = null;
      });
    },
    template: '<S3dDialogs />',
  }),
});

const meta = {
  title: 'App/Dialogs',
  component: S3dDialogs,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof S3dDialogs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prompt: Story = showing((editor) => editor.prompt('Name der Gruppe', 'Haus'));
export const Confirm: Story = showing((editor) => editor.confirm('Ungespeicherte Änderungen verwerfen?'));
export const Options: Story = showing((editor) =>
  editor.askOptions('Export', [
    { id: 'edges', label: 'Kanten mit exportieren', value: true },
    { id: 'name', label: 'Dateiname', value: 'haus' },
  ]),
);
