import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { Decorator } from '@storybook/vue3-vite';
import { provideAiSetup } from './useAiSetup';
import S3dWizardConnect from './S3dWizardConnect.vue';

/** the wizard steps read the wizard's state */
const withAiSetup: Decorator = (story) => ({ components: { story }, setup: () => provideAiSetup(), template: '<story />' });

const meta = {
  title: 'Plugins/AI/Setup/WizardConnect',
  component: S3dWizardConnect,
  decorators: [withAiSetup],
} satisfies Meta<typeof S3dWizardConnect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
