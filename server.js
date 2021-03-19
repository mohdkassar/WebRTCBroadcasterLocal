const express = require("express");
const app = express();
const { v4: uuidV4 } = require("uuid");

//https://github.com/webrtc/samples/blob/gh-pages/src/content/peerconnection/bandwidth/js/main.js

//Keep a list of the broadcasters that are connected to the websocket
let broadcasters = new Map();
//Keep a list of the watchers that are connected to the websocket
let watchers = {};

const port = 5000;

const http = require("http");
const server = http.createServer(app);

app.engine("html", require("ejs").renderFile);

app.use(express.static(__dirname + "/public"));

//Broadcaster URL
app.use("/broadcaster", (req, res) => {
  res.redirect(`/broadcast/${uuidV4()}`);
});

//Broadcaster URL with Room ID. Redirected from Broadcaster URL
app.use("/broadcast/:roomID", (req, res) => {
  res.render(__dirname + "/public/broadcast.html", {
    roomID: req.params.roomID,
  });
});

server.listen(port, () => console.log(`Server is running on port ${port}`));