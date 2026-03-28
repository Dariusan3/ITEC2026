import { yFiles, getYText, roomId } from './yjs'
import { SERVER_URL } from './config'

/** Sends all current file contents to the server for immediate DB persistence. */
export async function saveRoomNow() {
  const files = {}
  yFiles.forEach((meta, filename) => {
    files[filename] = {
      content: getYText(filename).toString(),
      language: meta?.language ?? 'javascript',
    }
  })
  if (Object.keys(files).length === 0) return

  try {
    await fetch(`${SERVER_URL}/api/room/${roomId}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ files }),
      // keepalive so it survives page unload
      keepalive: true,
    })
  } catch {}
}
