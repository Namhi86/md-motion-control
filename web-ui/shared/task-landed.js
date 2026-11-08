// Copied from dola-seedance-client/src/task-landed.js (smit-corp). Keep the two in step: change both, run both tests.
// Pure, no imports: the scheduler and the window both read it.
// A task has LANDED when Dola took its request: it holds the chat id (convId) or the video id (vid). From then on a clip may exist
// or still be made, so the request is never sent again by itself, and "Thử lại" (which sends it again) is not offered: the person
// gets "Lấy lại video" first, and "Tạo lại" (an explicit new request) after it.
// The exception: Dola itself said the creation failed, so no clip is coming and sending again is the only way on.
export const NO_CLIP_REASONS = new Set(['creation_failed']);

export const landed = (task) => Boolean(task?.result?.vid || task?.result?.convId) && !NO_CLIP_REASONS.has(task?.error?.reason);
