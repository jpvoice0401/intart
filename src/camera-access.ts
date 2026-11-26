/** Set properties as well as attributes for WebKit-based embedded browsers. */
export function prepareCameraVideo(video: HTMLVideoElement) {
  video.muted = true; video.defaultMuted = true; video.playsInline = true
  video.setAttribute('playsinline',''); video.setAttribute('webkit-playsinline','')
}

export async function openCamera(video: HTMLVideoElement, width: number, height: number) {
  prepareCameraVideo(video)
  if (!isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('카메라는 localhost 또는 HTTPS에서 사용할 수 있어요. 인앱에서 열리지 않으면 Safari 또는 Chrome에서 열어주세요.')
  try {
    return await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:width},height:{ideal:height},frameRate:{ideal:30,max:30}},audio:false})
  } catch (error) {
    if (error instanceof Error && error.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({video:true,audio:false})
    throw error
  }
}

export function setCameraVisible(stream: MediaStream | null, visible: boolean) {
  stream?.getVideoTracks().forEach(track => { track.enabled = visible })
}
