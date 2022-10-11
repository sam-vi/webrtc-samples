/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);

let startTime;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const f_candidatepairaddedCell = document.getElementById('1candidatepairadded');
const f_candidatepairreportCell = document.getElementById('1candidatepairreport');
const f_candidatepairswitchCell = document.getElementById('1candidatepairswitch');
const f_candidatepairdestroyedCell = document.getElementById('1candidatepairdestroyed');
const f_icepingproposalCell = document.getElementById('1icepingproposal');
const f_iceswitchproposalCell = document.getElementById('1iceswitchproposal');
const f_icepruneproposalCell = document.getElementById('1icepruneproposal');

const s_candidatepairaddedCell = document.getElementById('2candidatepairadded');
const s_candidatepairreportCell = document.getElementById('2candidatepairreport');
const s_candidatepairswitchCell = document.getElementById('2candidatepairswitch');
const s_candidatepairdestroyedCell = document.getElementById('2candidatepairdestroyed');
const s_icepingproposalCell = document.getElementById('2icepingproposal');
const s_iceswitchproposalCell = document.getElementById('2iceswitchproposal');
const s_icepruneproposalCell = document.getElementById('2icepruneproposal');

localVideo.addEventListener('loadedmetadata', function () {
  console.log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('loadedmetadata', function () {
  console.log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('resize', () => {
  console.log(`Remote video size changed to ${remoteVideo.videoWidth}x${remoteVideo.videoHeight} - Time since pageload ${performance.now().toFixed(0)}ms`);
  // We'll use the first onsize callback as an indication that video has started
  // playing out.
  if (startTime) {
    const elapsedTime = window.performance.now() - startTime;
    console.log('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
    startTime = null;
  }
});

let rtc_configuration;
let localStream;
let pc1;
let pc2;
const offerOptions = {
  offerToReceiveAudio: 1,
  offerToReceiveVideo: 1
};

function getName(pc) {
  return (pc === pc1) ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
  return (pc === pc1) ? pc2 : pc1;
}

const USER_MEDIA_CONSTRAINTS = new Map([
  ['', { audio: true, video: true }],
  ['a', { audio: true }],
  ['v', { video: true }],
]);

async function start() {
  console.log('Requesting local stream');
  startButton.disabled = true;
  try {
    const request = new URLSearchParams(document.location.search).get('umc');
    let constraint = USER_MEDIA_CONSTRAINTS.get('');
    if (USER_MEDIA_CONSTRAINTS.has(request)) {
      constraint = USER_MEDIA_CONSTRAINTS.get(request);
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraint);
    console.log('Received local stream');
    localVideo.srcObject = stream;
    localStream = stream;
    callButton.disabled = false;
  } catch (e) {
    alert(`getUserMedia() error: ${e.name}`);
  }
}

const DEFAULT_CONFIG = {
  iceServers: [
    {
      urls: [
        'stun:turn2.l.google.com',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

/*
{
  "lifetimeDuration":"86400s",
  "iceServers": [
    {
      "urls":["stun:localhost"]
    },
    {
      "urls":["turn:localhost?transport=udp","turn:localhost?transport=tcp"],
      "username":"...",
      "credential":"..."
    }
  ],
  "blockStatus":"NOT_BLOCKED",
  "iceTransportPolicy":"relay"
}
*/

const OPEN_RELAY_SERVERS = new Map([
  ['turn-udp',
    {
      urls: ['turn:openrelay.metered.ca:80'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  ['turn-ssl',
    {
      urls: ['turn:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  ['turn-tcp',
    {
      urls: ['turn:openrelay.metered.ca:80?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  ['turn-ssl-tcp',
    {
      urls: ['turn:openrelay.metered.ca:443?transport=tcp'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
]);

const OPEN_RELAY_CONFIG = {
  iceServers: [
    {
      urls: 'stun:openrelay.metered.ca:80',
    },
  ],
  blockStatus: 'NOT_BLOCKED',
  iceTransportPolicy: 'relay',
};

const NTP_CONFIG_URL = `https://networktraversal.googleapis.com/v1alpha/iceconfig?key=AIzaSyCCkISWotZGISiHcm55NQH5n3tHxKP_3dY`;
const NTP_TIMEOUT_MS = 3000;

async function loadIceConfiguration(template) {
  if (template && template.startsWith('openrelay')) {
    const subtemplate = template.replace('openrelay-', '');
    const config = Object.assign({}, OPEN_RELAY_CONFIG);
    if (OPEN_RELAY_SERVERS.has(subtemplate)) {
      config.iceServers.push(OPEN_RELAY_SERVERS.get(subtemplate));
    }
    console.log(`Returning openrelay config for template ${template}`);
    return config;
  }

  template = template || 'local';
  console.log(`Fetch config from ${NTP_CONFIG_URL} for template ${template}`);

  let configuration = DEFAULT_CONFIG;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NTP_TIMEOUT_MS);

  try {
    const response = await fetch(NTP_CONFIG_URL, {
      method: 'POST',
      body: JSON.stringify({ ice_config_preference: template }),
      signal: controller.signal,
    });
    if (response.ok) {
      configuration = await response.json();
      console.log(`Fetched ICE config: ${JSON.stringify(configuration)}`);
    } else {
      console.log(`Fetch failed: ${response.status}`);
    }
    clearTimeout(timeoutId);
  } catch (err) {
    console.log(`Fetch failed: ${err.message}`);
  }
  return configuration;
}

async function call() {
  let f_candidatepairaddedCtr = 0;
  let f_candidatepairreportCtr = 0;
  let f_candidatepairswitchCtr = 0;
  let f_candidatepairdestroyedCtr = 0;
  let f_icepingproposalCtr = 0;
  let f_iceswitchproposalCtr = 0;
  let f_icepruneproposalCtr = 0;

  let s_candidatepairaddedCtr = 0;
  let s_candidatepairreportCtr = 0;
  let s_candidatepairswitchCtr = 0;
  let s_candidatepairdestroyedCtr = 0;
  let s_icepingproposalCtr = 0;
  let s_iceswitchproposalCtr = 0;
  let s_icepruneproposalCtr = 0;

  callButton.disabled = true;
  hangupButton.disabled = false;
  console.log('Starting call');
  startTime = window.performance.now();
  const videoTracks = localStream.getVideoTracks();
  const audioTracks = localStream.getAudioTracks();
  if (videoTracks.length > 0) {
    console.log(`Using video device: ${videoTracks[0].label}`);
  }
  if (audioTracks.length > 0) {
    console.log(`Using audio device: ${audioTracks[0].label}`);
  }
  const template = new URLSearchParams(document.location.search).get('t');
  rtc_configuration = await loadIceConfiguration(template);
  // const configuration = await loadIceConfiguration(template);
  console.log('RTCPeerConnection configuration:', rtc_configuration);

  if (typeof RTCIceController === 'function') {
    console.log('Attaching an RTCIceController to #1');
    let ic1 = new RTCIceController();
    ic1.addEventListener('candidatepairadded', e => {
      f_candidatepairaddedCell.innerHTML = ++f_candidatepairaddedCtr;
      console.log(`RTCIC #1==> Pair added: [${e.debugStr}]`);
    });
    ic1.addEventListener('candidatepairreport', e => {
      f_candidatepairreportCell.innerHTML = ++f_candidatepairreportCtr;
      console.log(`RTCIC #1==> Pair report: [${e.debugStr}]`);
    });
    ic1.addEventListener('candidatepairswitch', e => {
      f_candidatepairswitchCell.innerHTML = ++f_candidatepairswitchCtr;
      console.log(`RTCIC #1==> Pair switch: [${e.debugStr}]`);
    });
    ic1.addEventListener('candidatepairdestroyed', e => {
      f_candidatepairdestroyedCell.innerHTML = ++f_candidatepairdestroyedCtr;
      console.log(`RTCIC #1==> Pair destroyed: [${e.debugStr}]`);
    });
    ic1.addEventListener('icepingproposal', e => {
      f_icepingproposalCell.innerHTML = ++f_icepingproposalCtr;
      console.log(`RTCIC #1==> Ping request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    ic1.addEventListener('iceswitchproposal', e => {
      f_iceswitchproposalCell.innerHTML = ++f_iceswitchproposalCtr;
      console.log(`RTCIC #1==> Switch request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    ic1.addEventListener('icepruneproposal', e => {
      f_icepruneproposalCell.innerHTML = ++f_icepruneproposalCtr;
      console.log(`RTCIC #1==> Prune request: [${e.debugStr}]`);
      e.preventDefault();
    });
    rtc_configuration.iceController = ic1;
  } else {
    console.log('RTCIceController unavailable');
  }
  pc1 = new RTCPeerConnection(rtc_configuration);
  console.log('Created local peer connection object pc1');

  pc1.addEventListener('icecandidate', e => onIceCandidate(pc1, e));

  if (typeof RTCIceController === 'function') {
    console.log('Attaching an RTCIceController to #2');
    let ic2 = new RTCIceController();
    ic2.addEventListener('candidatepairadded', e => {
      s_candidatepairaddedCell.innerHTML = ++s_candidatepairaddedCtr;
      console.log(`RTCIC #2==> Pair added: [${e.debugStr}]`);
    });
    ic2.addEventListener('candidatepairreport', e => {
      s_candidatepairreportCell.innerHTML = ++s_candidatepairreportCtr;
      console.log(`RTCIC #2==> Pair report: [${e.debugStr}]`);
    });
    ic2.addEventListener('candidatepairswitch', e => {
      s_candidatepairswitchCell.innerHTML = ++s_candidatepairswitchCtr;
      console.log(`RTCIC #2==> Pair switch: [${e.debugStr}]`);
    });
    ic2.addEventListener('candidatepairdestroyed', e => {
      s_candidatepairdestroyedCell.innerHTML = ++s_candidatepairdestroyedCtr;
      console.log(`RTCIC #2==> Pair destroyed: [${e.debugStr}]`);
    });
    ic2.addEventListener('icepingproposal', e => {
      s_icepingproposalCell.innerHTML = ++s_icepingproposalCtr;
      console.log(`RTCIC #2==> Ping request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    ic2.addEventListener('iceswitchproposal', e => {
      s_iceswitchproposalCell.innerHTML = ++s_iceswitchproposalCtr;
      console.log(`RTCIC #2==> Switch request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    ic2.addEventListener('icepruneproposal', e => {
      s_icepruneproposalCell.innerHTML = ++s_icepruneproposalCtr;
      console.log(`RTCIC #2==> Prune request: [${e.debugStr}]`);
      e.preventDefault();
    });
    rtc_configuration.iceController = ic2;
  } else {
    console.log('RTCIceController unavailable');
  }
  pc2 = new RTCPeerConnection(rtc_configuration);
  console.log('Created remote peer connection object pc2');

  pc2.addEventListener('icecandidate', e => onIceCandidate(pc2, e));
  pc1.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc1, e));
  pc2.addEventListener('iceconnectionstatechange', e => onIceStateChange(pc2, e));
  pc2.addEventListener('track', gotRemoteStream);

  localStream.getTracks().forEach(track => pc1.addTrack(track, localStream));
  console.log('Added local stream to pc1');

  try {
    console.log('pc1 createOffer start');
    const offer = await pc1.createOffer(offerOptions);
    await onCreateOfferSuccess(offer);
  } catch (e) {
    onCreateSessionDescriptionError(e);
  }
}

function onCreateSessionDescriptionError(error) {
  console.log(`Failed to create session description: ${error.toString()}`);
}

async function onCreateOfferSuccess(desc) {
  console.log(`Offer from pc1\n${desc.sdp}`);
  console.log('pc1 setLocalDescription start');
  try {
    await pc1.setLocalDescription(desc);
    onSetLocalSuccess(pc1);
  } catch (e) {
    onSetSessionDescriptionError();
  }

  console.log('pc2 setRemoteDescription start');
  try {
    await pc2.setRemoteDescription(desc);
    onSetRemoteSuccess(pc2);
  } catch (e) {
    onSetSessionDescriptionError();
  }

  console.log('pc2 createAnswer start');
  // Since the 'remote' side has no media stream we need
  // to pass in the right constraints in order for it to
  // accept the incoming offer of audio and video.
  try {
    const answer = await pc2.createAnswer();
    await onCreateAnswerSuccess(answer);
  } catch (e) {
    onCreateSessionDescriptionError(e);
  }
}

function onSetLocalSuccess(pc) {
  console.log(`${getName(pc)} setLocalDescription complete`);
}

function onSetRemoteSuccess(pc) {
  console.log(`${getName(pc)} setRemoteDescription complete`);
}

function onSetSessionDescriptionError(error) {
  console.log(`Failed to set session description: ${error.toString()}`);
}

function gotRemoteStream(e) {
  if (remoteVideo.srcObject !== e.streams[0]) {
    remoteVideo.srcObject = e.streams[0];
    console.log('pc2 received remote stream');
  }
}

async function onCreateAnswerSuccess(desc) {
  console.log(`Answer from pc2:\n${desc.sdp}`);
  console.log('pc2 setLocalDescription start');
  try {
    await pc2.setLocalDescription(desc);
    onSetLocalSuccess(pc2);
  } catch (e) {
    onSetSessionDescriptionError(e);
  }
  console.log('pc1 setRemoteDescription start');
  try {
    await pc1.setRemoteDescription(desc);
    onSetRemoteSuccess(pc1);
  } catch (e) {
    onSetSessionDescriptionError(e);
  }
}

async function onIceCandidate(pc, event) {
  try {
    await (getOtherPc(pc).addIceCandidate(event.candidate));
    onAddIceCandidateSuccess(pc);
  } catch (e) {
    onAddIceCandidateError(pc, e);
  }
  console.log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

function onAddIceCandidateSuccess(pc) {
  console.log(`${getName(pc)} addIceCandidate success`);
}

function onAddIceCandidateError(pc, error) {
  console.log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
}

function onIceStateChange(pc, event) {
  if (pc) {
    console.log(`${getName(pc)} ICE state: ${pc.iceConnectionState}`);
    console.log('ICE state change event: ', event);
  }
}

function hangup() {
  console.log('Ending call');
  pc1.close();
  pc2.close();
  pc1 = null;
  pc2 = null;
  hangupButton.disabled = true;
  callButton.disabled = false;
}
