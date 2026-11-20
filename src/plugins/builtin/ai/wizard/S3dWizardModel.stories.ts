import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { Decorator } from '@storybook/vue3-vite';
import { provideAiSetup } from './useAiSetup';
import S3dWizardModel from './S3dWizardModel.vue';

/** the wizard steps read the wizard's state */
const withAiSetup: Decorator = (story) => ({ components: { story }, setup: () => provideAiSetup(), template: '<story />' });

const meta = {
  title: 'Plugins/AI/Setup/WizardModel',
  component: S3dWizardModel,
  decorators: [withAiSetup],
} satisfies Meta<typeof S3dWizardModel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {};
