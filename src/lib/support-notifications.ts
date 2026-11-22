let audioContext: AudioContext | null = null

export function playSupportNotification() {
  try {
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return
    audioContext ??= new AudioContextClass()
    if (audioContext.state === 'suspended') void audioContext.resume()
    const ctx = audioContext
    const now = ctx.currentTime
    ;[0, 0.19].forEach((offset, index) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(index === 0 ? 880 : 1174, now + offset)
      gain.gain.setValueAtTime(0.0001, now + offset)
      gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(now + offset)
      oscillator.stop(now + offset + 0.17)
    })
  } catch {
    // Audio is optional; browser permissions or device settings may block playback.
  }
}
