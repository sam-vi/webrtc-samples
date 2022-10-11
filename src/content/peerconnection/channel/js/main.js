/*
 *  Copyright (c) 2021 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const startButton = document.getElementById('startButton');
const hangupButton = document.getElementById('hangupButton');
hangupButton.disabled = true;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const candidatepairaddedCell = document.getElementById('candidatepairadded');
const candidatepairreportCell = document.getElementById('candidatepairreport');
const candidatepairswitchCell = document.getElementById('candidatepairswitch');
const candidatepairdestroyedCell = document.getElementById('candidatepairdestroyed');
const icepingproposalCell = document.getElementById('icepingproposal');
const iceswitchproposalCell = document.getElementById('iceswitchproposal');
const icepruneproposalCell = document.getElementById('icepruneproposal');

let rtc_configuration;
let pc;
let localStream;
let tab_id = Math.floor(Math.random() * 90) + 11;

const signaling = new BroadcastChannel('webrtc');
signaling.onmessage = e => {
  if (!localStream) {
    console.log('not ready yet');
    return;
  }
  switch (e.data.type) {
    case 'offer':
      document.title = `${tab_id}<--  ${document.title}`;
      handleOffer(e.data);
      break;
    case 'answer':
      handleAnswer(e.data);
      break;
    case 'candidate':
      handleCandidate(e.data);
      break;
    case 'ready':
      // A second tab joined. This tab will initiate a call unless in a call already.
      if (pc) {
        console.log('already in call, ignoring');
        return;
      }
      document.title = `${tab_id}-->  ${document.title}`;
      makeCall();
      break;
    case 'bye':
      if (pc) {
        hangup();
      }
      break;
    default:
      console.log('unhandled', e);
      break;
  }
};

startButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  localVideo.srcObject = localStream;


  startButton.disabled = true;
  hangupButton.disabled = false;

  signaling.postMessage({ type: 'ready' });
};

hangupButton.onclick = async () => {
  hangup();
  signaling.postMessage({ type: 'bye' });
};

async function hangup() {
  if (pc) {
    pc.close();
    pc = null;
  }
  localStream.getTracks().forEach(track => track.stop());
  localStream = null;
  startButton.disabled = false;
  hangupButton.disabled = true;
};

function createPeerConnection() {
  if (typeof RTCIceController === 'function') {
    let candidatepairaddedCtr = 0;
    let candidatepairreportCtr = 0;
    let candidatepairswitchCtr = 0;
    let candidatepairdestroyedCtr = 0;
    let icepingproposalCtr = 0;
    let iceswitchproposalCtr = 0;
    let icepruneproposalCtr = 0;
    console.log(`Attaching an RTCIceController to ${tab_id}`);
    let ic = new RTCIceController();
    ic.addEventListener('candidatepairadded', e => {
      candidatepairaddedCell.innerHTML = ++candidatepairaddedCtr;
      console.log(`RTCIC ${tab_id}==> Pair added: [${e.debugStr}]`);
    });
    ic.addEventListener('candidatepairreport', e => {
      candidatepairreportCell.innerHTML = ++candidatepairreportCtr;
      console.log(`RTCIC ${tab_id}==> Pair report: [${e.debugStr}]`);
    });
    ic.addEventListener('candidatepairswitch', e => {
      candidatepairswitchCell.innerHTML = ++candidatepairswitchCtr;
      console.log(`RTCIC ${tab_id}==> Pair switch: [${e.debugStr}]`);
    });
    ic.addEventListener('candidatepairdestroyed', e => {
      candidatepairdestroyedCell.innerHTML = ++candidatepairdestroyedCtr;
      console.log(`RTCIC ${tab_id}==> Pair destroyed: [${e.debugStr}]`);
    });
    ic.addEventListener('icepingproposal', e => {
      icepingproposalCell.innerHTML = ++icepingproposalCtr;
      console.log(`RTCIC ${tab_id}==> Ping request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    ic.addEventListener('iceswitchproposal', e => {
      iceswitchproposalCell.innerHTML = ++iceswitchproposalCtr;
      console.log(`RTCIC ${tab_id}==> Switch request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    ic.addEventListener('icepruneproposal', e => {
      icepruneproposalCell.innerHTML = ++icepruneproposalCtr;
      console.log(`RTCIC ${tab_id}==> Prune request: [${e.debugStr}]`);
      // e.preventDefault();
    });
    rtc_configuration = { iceController: ic };
  } else {
    console.log('RTCIceController unavailable');
  }
  pc = new RTCPeerConnection(rtc_configuration);
  pc.onicecandidate = e => {
    const message = {
      type: 'candidate',
      candidate: null,
    };
    if (e.candidate) {
      message.candidate = e.candidate.candidate;
      message.sdpMid = e.candidate.sdpMid;
      message.sdpMLineIndex = e.candidate.sdpMLineIndex;
    }
    signaling.postMessage(message);
  };
  pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
}

async function makeCall() {
  await createPeerConnection();

  const offer = await pc.createOffer();
  signaling.postMessage({ type: 'offer', sdp: offer.sdp });
  await pc.setLocalDescription(offer);
}

async function handleOffer(offer) {
  if (pc) {
    console.error('existing peerconnection');
    return;
  }
  await createPeerConnection();
  await pc.setRemoteDescription(offer);

  const answer = await pc.createAnswer();
  signaling.postMessage({ type: 'answer', sdp: answer.sdp });
  await pc.setLocalDescription(answer);
}

async function handleAnswer(answer) {
  if (!pc) {
    console.error('no peerconnection');
    return;
  }
  await pc.setRemoteDescription(answer);
}

async function handleCandidate(candidate) {
  if (!pc) {
    console.error('no peerconnection');
    return;
  }
  if (!candidate.candidate) {
    await pc.addIceCandidate(null);
  } else {
    await pc.addIceCandidate(candidate);
  }
}

