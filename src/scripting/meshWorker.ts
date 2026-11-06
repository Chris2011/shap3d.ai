import { answerOf, type MeshJob, type MeshJobAnswer } from './meshJobs';

/** `Worker.postMessage` without the Window overload's targetOrigin */
const postToOwner = (self as unknown as { postMessage: (data: MeshJobAnswer, transfer: ArrayBuffer[]) => void }).postMessage.bind(self);

addEventListener('message', async (event: MessageEvent<MeshJob>) => {
  const { answer, transfer } = await answerOf(event.data);
  postToOwner(answer, transfer);
});
