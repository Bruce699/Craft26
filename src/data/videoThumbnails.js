// Pin posters to the start of the same video used for playback.
export function getVideoThumbnailUrl(playbackId, width = 1200) {
  return `https://image.mux.com/${encodeURIComponent(playbackId)}/thumbnail.jpg?time=0&width=${width}&fit_mode=preserve`
}
