'use strict';
module.exports = async function verifyLoopback(wc) {
  const result = await wc.executeJavaScript('(' + loopbackInPage.toString() + ')()', true);
  require('node:assert/strict').equal(result, true);
};
async function loopbackInPage() {
  const sender = new RTCPeerConnection({ iceServers: [] });
  const receiver = new RTCPeerConnection({ iceServers: [] });
  let stream;
  const video = document.createElement('video');
  video.muted = true; video.autoplay = true;
  document.body.append(video);
  const waitFor = async check => {
    const end = Date.now() + 10000;
    while (!(await check())) {
      if (Date.now() > end) throw new Error('Local WebRTC transport timed out');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    for (const track of stream.getTracks()) sender.addTrack(track, stream);
    receiver.ontrack = event => { video.srcObject = event.streams[0]; void video.play(); };
    await sender.setLocalDescription(await sender.createOffer());
    await waitFor(() => sender.iceGatheringState === 'complete');
    await receiver.setRemoteDescription(sender.localDescription);
    await receiver.setLocalDescription(await receiver.createAnswer());
    await waitFor(() => receiver.iceGatheringState === 'complete');
    await sender.setRemoteDescription(receiver.localDescription);
    await waitFor(async () => {
      const stats = [...(await receiver.getStats()).values()].filter(s => s.type === 'inbound-rtp');
      return stats.some(s => s.kind === 'audio' && s.packetsReceived > 0) &&
        stats.some(s => s.kind === 'video' && s.framesDecoded > 0);
    });
    return true;
  } finally {
    stream?.getTracks().forEach(track => track.stop());
    sender.close(); receiver.close(); video.srcObject = null; video.remove();
  }
}
