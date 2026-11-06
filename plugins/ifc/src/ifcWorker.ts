import { readIfc, type IfcUrls } from './ifcRead';

export interface IfcWorkerRequest {
  urls: IfcUrls;
  fileData: Uint8Array;
}
export type IfcWorkerAnswer = { ok: true; result: Awaited<ReturnType<typeof readIfc>> } | { ok: false; error: string };

/** `Worker.postMessage` without the Window overload's targetOrigin */
const postToOwner = (self as unknown as { postMessage: (data: IfcWorkerAnswer) => void }).postMessage.bind(self);

addEventListener('message', async (event: MessageEvent<IfcWorkerRequest>) => {
  try {
    postToOwner({ ok: true, result: await readIfc(event.data.urls, event.data.fileData) });
  } catch (error) {
    postToOwner({ ok: false, error: (error as Error)?.message ?? String(error) });
  }
});
