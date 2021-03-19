//Keep a list of the peers connected to the broadcaster
const peerConnections = {};
//Keep a list of the socket ids of the peers connected to the proadcaster
const socketids = [];
//Maximum Bandwidth
const BANDWIDTH_LIMIT = 2000;
// We will scale the photo width to this
var width = 320;
// We will scale the photo height to this
var height = 320;
let lastResult = {};

//STUN adn TURN Server configuration
const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "turn:3.128.226.104?transport=tcp",
      username: "decentra",
      credential: "decentra1234",
    },
  ],
};

const socket = io.connect("https://3.128.226.104:4000");
document.getElementById("room ID").innerHTML = roomID;

//After a watcher answers the offer requested by the broadcaster
socket.on("answer", (id, description) => {
  peerConnections[id].setRemoteDescription(description);
});

//Bandwidth Update Function
function bandwidthUpdate(id, bandwidth) {
  //Get peer connection from ID
  const peerConnection = peerConnections[id];
  console.log("Bandwidth: " + bandwidth);
  // In Chrome, use RTCRtpSender.setParameters to change bandwidth without
  // (local) renegotiation. Note that this will be within the envelope of
  // the initial maximum bandwidth negotiated via SDP.
  if (
    (adapter.browserDetails.browser === "chrome" ||
      adapter.browserDetails.browser === "safari" ||
      (adapter.browserDetails.browser === "firefox" &&
        adapter.browserDetails.version >= 64)) &&
    "RTCRtpSender" in window &&
    "setParameters" in window.RTCRtpSender.prototype
  ) {
    const sender = peerConnection.getSenders()[0];
    const parameters = sender.getParameters();
    if (!parameters.encodings) {
      parameters.encodings = [{}];
    }
    if (bandwidth === "unlimited") {
      delete parameters.encodings[0].maxBitrate;
    } else {
      parameters.encodings[0].maxBitrate = bandwidth * 1000;
    }
    sender
      .setParameters(parameters)
      .then(() => {
        peerConnection
          .createOffer()
          .then((sdp) => peerConnection.setLocalDescription(sdp))
          .then(() => {
            console.log(".....");
            //create new description based on bandwidth
            const desc = {
              type: peerConnection.remoteDescription.type,
              sdp:
                bandwidth === "unlimited"
                  ? removeBandwidthRestriction(
                      peerConnection.remoteDescription.sdp
                    )
                  : updateBandwidthRestriction(
                      peerConnection.remoteDescription.sdp,
                      bandwidth
                    ),
            };
            console.log(
              "Applying bandwidth restriction to setRemoteDescription:\n" +
                desc.sdp
            );
            //Applying bandwidth description to setRemoteDescription
            peerConnection.setRemoteDescription(desc);
          });
      })
      .catch((e) => console.error(e));
    return;
  }
}

//Triggered if a watcher requests bandwidth update
socket.on("bandwidthUpdate", (id, bandwidth) => {
  //Call bandwidth update function
  bandwidthUpdate(id, bandwidth);
});

//Triggered after a new watcher joins the room
socket.on("watcher", (id) => {
  //Create new peer connection
  const peerConnection = new RTCPeerConnection(config);
  // const numOfWatchers = socketids.length + 1;
  // const bandwidthAllocation = BANDWIDTH_LIMIT/numOfWatchers;

  // for(var i = 0; i<socketids.length;i++){
  //   bandwidthUpdate(id,bandwidthAllocation);
  // }

  //Add the socket id
  socketids.push(id);
  //Add the new peer connection with the socket id as an identifier
  peerConnections[id] = peerConnection;

  let stream = videoElement.srcObject;
  stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

  //Triggered when the peer connection sends ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("candidate", id, event.candidate);
    }
  };
  //Broadcaster creates an offer and sends it to the watcher
  peerConnection
    .createOffer()
    .then((sdp) => peerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("offer", id, peerConnection.localDescription);
    });
});

//Triggered when the peer connection sends ICE Candidates
socket.on("candidate", (id, candidate) => {
  peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
});

//Triggered after a watcher has disconnected
socket.on("watcherDisconnect", (id) => {
  const index = socketids.indexOf(id);
  //Remove from list of socket ids
  socketids.splice(index, 1);
  //Close the peer connection and remove it from the list
  peerConnections[id].close();
  delete peerConnections[id];
  //Update the Bandwidth alloctation of the other watchers
  const numOfWatchers = socketids.length;
  const bandwidthAllocation = BANDWIDTH_LIMIT / numOfWatchers;
  //Update the bandwidth of the peer connections
  for (var i = 0; i < socketids.length; i++) {
    bandwidthUpdate(id, bandwidthAllocation);
  }
});

window.onunload = window.onbeforeunload = () => {
  socket.close();
};

// Get camera and microphone
const videoElement = document.querySelector("video");
const audioSelect = document.querySelector("select#audioSource");
const videoSelect = document.querySelector("select#videoSource");
const canvas = document.getElementById("canvas");

audioSelect.onchange = getStream;
videoSelect.onchange = getStream;

getStream().then(getDevices).then(gotDevices);

function getDevices() {
  return navigator.mediaDevices.enumerateDevices();
}

function gotDevices(deviceInfos) {
  window.deviceInfos = deviceInfos;
  for (const deviceInfo of deviceInfos) {
    const option = document.createElement("option");
    option.value = deviceInfo.deviceId;
    if (deviceInfo.kind === "audioinput") {
      option.text = deviceInfo.label || `Microphone ${audioSelect.length + 1}`;
      audioSelect.appendChild(option);
    } else if (deviceInfo.kind === "videoinput") {
      option.text = deviceInfo.label || `Camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    }
  }
  // window.setInterval(function () {
  //   takepicture();
  // }, 5000);
}

function getStream() {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  const audioSource = audioSelect.value;
  const videoSource = videoSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    video: { deviceId: videoSource ? { exact: videoSource } : undefined },
  };
  return navigator.mediaDevices
    .getUserMedia(constraints)
    .then(gotStream)
    .catch(handleError);
}

function gotStream(stream) {
  window.stream = stream;
  audioSelect.selectedIndex = [...audioSelect.options].findIndex(
    (option) => option.text === stream.getAudioTracks()[0].label
  );
  videoSelect.selectedIndex = [...videoSelect.options].findIndex(
    (option) => option.text === stream.getVideoTracks()[0].label
  );
  videoElement.srcObject = stream;
  socket.emit("broadcaster", roomID);
}

//Take Picture Function to send it to the AI Models
function takepicture() {
  console.log("test");
  var context = canvas.getContext("2d");
  if (width && height) {
    console.log("test");

    canvas.width = width;
    canvas.height = height;
    context.drawImage(videoElement, 0, 0, width, height);

    var data = canvas.toDataURL("image/png");
    photo.setAttribute("src", data);
  }
}

function handleError(error) {
  console.error("Error: ", error);
}

//Bandwidth Update Function for Adding a restriction to the SDP
function updateBandwidthRestriction(sdp, bandwidth) {
  console.log("Updating Bandwidth");
  let modifier = "AS";
  if (adapter.browserDetails.browser === "firefox") {
    bandwidth = (bandwidth >>> 0) * 1000;
    modifier = "TIAS";
  }
  if (sdp.indexOf("b=" + modifier + ":") === -1) {
    // insert b= after c= line.
    sdp = sdp.replace(
      /c=IN (.*)\r\n/,
      "c=IN $1\r\nb=" + modifier + ":" + bandwidth + "\r\n"
    );
  } else {
    sdp = sdp.replace(
      new RegExp("b=" + modifier + ":.*\r\n"),
      "b=" + modifier + ":" + bandwidth + "\r\n"
    );
  }
  return sdp;
}

//Removing Bandwidth Restriction from the SDP
function removeBandwidthRestriction(sdp) {
  return sdp.replace(/b=AS:.*\r\n/, "").replace(/b=TIAS:.*\r\n/, "");
}

//Getting the Bit Rate of the peer connections and printing them
window.setInterval(() => {
  for (var i = 0; i < socketids.length; i++) {
    var socket = socketids[i];
    var peerConnection = peerConnections[socket];
    if (!peerConnection) {
      return;
    }
    const sender = peerConnection.getSenders()[0];
    if (!sender) {
      return;
    }
    sender.getStats().then((res) => {
      res.forEach((report) => {
        let bytes;
        let headerBytes;
        let packets;
        if (report.type === "outbound-rtp") {
          if (report.isRemote) {
            return;
          }
          var now = report.timestamp;
          bytes = report.bytesSent;
          headerBytes = report.headerBytesSent;

          packets = report.packetsSent;
          if (
            lastResult[peerConnection] &&
            lastResult[peerConnection].has(report.id)
          ) {
            console.log("report id");

            // calculate bitrate
            var bitrate =
              (8 *
                (bytes - lastResult[peerConnection].get(report.id).bytesSent)) /
              (now - lastResult[peerConnection].get(report.id).timestamp);
            var headerrate =
              (8 *
                (headerBytes -
                  lastResult[peerConnection].get(report.id).headerBytesSent)) /
              (now - lastResult[peerConnection].get(report.id).timestamp);

            // append to chart
            console.log("Bit Rate: " + bitrate);
            console.log("Header Rate: " + headerrate);
          }
        }
      });
      lastResult[peerConnection] = res;
    });
  }
}, 2000);
