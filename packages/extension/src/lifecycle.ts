export async function finishRecording<T>(
  quiesce: () => Promise<void>,
  finalize: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  await quiesce();
  try { return await finalize(); }
  finally { await cleanup(); }
}
