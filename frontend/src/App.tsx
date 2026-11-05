import React, { useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import "./App.css";

type WebRTCSignal =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; iceCandidate: RTCIceCandidateInit };

type C2S = {
  auth: (p: { userId: string }) => void;
  signal: (p: { to: string; data: WebRTCSignal }) => void;
};

type S2C = {
  signal: (p: { from: string; data: WebRTCSignal }) => void;
};

const SignalingServerURL = "http://localhost:3000";

const ICE_SERVER_CONFIG: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

function App() {
  const [localID, setLocalID] = useState<string>(crypto.randomUUID());
  const [peerIDInput, setPeerIDInput] = useState<string>("");
  const [connStatus,setConnStatus] = React.useState<"offline" | "online" | "connecting" | "connected">("offline")
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const localSockRef = React.useRef<Socket<S2C, C2S> | null>(null);
  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  React.useEffect(()=>{
    const socket: Socket<S2C,C2S> = io(SignalingServerURL);
    localSockRef.current = socket;
    socket.emit("auth",{userId: localID});
    socket.on("signal", async({from,data})=>{
      const pc = pcRef.current;
      if(!pc) return;

      if(data.type == "offer"){
        await pc.setRemoteDescription(data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        pc.onicecandidate = (iceEvt)=>{
          if(iceEvt.candidate){
            socket.emit("signal",{
              to: from,
              data: {
                type: "ice",
                iceCandidate: iceEvt.candidate.toJSON()
              }
            })
          }
        };
        socket.emit("signal",{to: from,data: {type: "answer",sdp: answer}})
      }else if(data.type == "answer"){
        await pc.setRemoteDescription(data.sdp);
      }else if(data.type == "ice"){
        await pc.addIceCandidate(data.iceCandidate);
      }
    })
    return ()=> {
      socket.disconnect()
    }
  },[])

  async function createPeerConnection(){
    if(!localID || !localSockRef.current){
      return;
    }
    const localVideoFeed = await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    if(localVideoRef.current){
      localVideoRef.current.srcObject = localVideoFeed
    }
    const pc = new RTCPeerConnection({iceServers: ICE_SERVER_CONFIG})
    pcRef.current = pc;
    localVideoFeed.getTracks().forEach(track=> pc.addTrack(track,localVideoFeed))
    pc.ontrack = (trackEvt)=>{
      if(remoteVideoRef.current){
        remoteVideoRef.current.srcObject = trackEvt.streams[0]
        setConnStatus("connected")
      }
    }
    setConnStatus("online")
  }

  async function initiateConnection(peerId: string){
    setConnStatus("connecting")
    if(pcRef.current){
      const pc = pcRef.current

      pc.onicecandidate = (iceEvt)=>{
        if(iceEvt.candidate){
          localSockRef.current?.emit("signal",{
            to: peerId,
            data: {type: "ice", iceCandidate: iceEvt.candidate.toJSON()}
          })
        }
      }

      const sdpOffer = await pc.createOffer()
      await pc.setLocalDescription(sdpOffer)
      localSockRef.current.emit("signal",{to: peerId,data: {type:"offer",sdp:sdpOffer}})
    }
  }

  function disconnect(){
    if(pcRef.current){
      pcRef.current.close()
      pcRef.current = null
    }

    if(localVideoRef.current){
      const stream = localVideoRef.current.srcObject as MediaStream
      stream?.getTracks().forEach(track=> track.stop())
      localVideoRef.current.srcObject = null;
    }
    if(remoteVideoRef.current){
      remoteVideoRef.current.srcObject = null;
    }
    setConnStatus("offline")
  }

  return (
    <div className="mt-5 mx-5">
      <div className="flex flex-row justify-center gap-25">
        <div className="flex flex-row w-fit border-1 p-1 bg-gray-200 rounded-md">
          <span className="font-bold mr-1">Your ID:</span>
          {localID}
        </div>
        <div className="flex flex-row gap-2 items-center">
          {connStatus == "online" && (
            <input
              placeholder="Enter peer's UserID"
              type="text"
              className="bg-gray-200 rounded-md h-[33px] border-1"
              value={peerIDInput}
              onChange={(ev) => {
                setPeerIDInput(ev.target.value);
              }}
            ></input>
          )}
          {connStatus == "offline" && (
            <button
              className="bg-blue-300 rounded-md px-3 py-1 cursor-pointer hover:bg-blue-200 duration-75"
              onClick={() => {
                createPeerConnection();
              }}
            >
              Go Online
            </button>
          )}
          {connStatus == "online" && (
            <button
              className="bg-blue-300 rounded-md px-3 py-1 cursor-pointer hover:bg-blue-200 duration-75"
              onClick={() => {
                initiateConnection(peerIDInput);
              }}
            >
              Connect
            </button>
          )}
          {connStatus != "offline" && (
            <button
              className="bg-red-300 rounded-md px-3 py-1 cursor-pointer hover:bg-red-200 duration-75"
              onClick={() => {
                disconnect();
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-row mt-20 w-[100%] h-[500px] gap-10 justify-center">
        <div>
          <p className="text-center mb-1">Your Video Feed</p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            className="w-[40vw] rounded-lg bg-black"
          ></video>
        </div>
        <div>
          <p className="text-center mb-1">
            {connStatus == "connecting"
              ? "Attempting to connnect..."
              : connStatus == "connected"
                ? "Connected!"
                : "Remote Video Feed"}
          </p>
          <video
            ref={remoteVideoRef}
            autoPlay
            muted
            className="w-[40vw] rounded-lg bg-black"
          ></video>
        </div>
      </div>
    </div>
  );
}

export default App;
