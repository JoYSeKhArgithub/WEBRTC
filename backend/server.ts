import express from 'express';
import http from 'http';
import { Socket,Server as SocketioServer } from 'socket.io';

type WebRTCSignal = {type: "offer",sdp: any} | {type: "answer", sdp: any} | {type: "ice",candidate: any}

type C2S = {
    auth: (p: {userId:string}) => void;
    signal: (p:{to: string, data: WebRTCSignal})=> void
}

type S2C = {
    signal: (p: {to: string,data: WebRTCSignal}) => void
}

const app = express();
const server = http.createServer(app);

const ioServer = new SocketioServer<C2S,S2C>(
    server,
    {
        cors:{
            origin: "*"
        }
    }
)

const userToSocket = new Map<string,string>();
const socketToUser = new Map<string,string>();

ioServer.on('connection',(socket: Socket<C2S,S2C>)=>{
    console.log(`Socket: ${socket.id} connected`);

    socket.on('auth',({userId})=>{
        userToSocket.set(userId,socket.id);
        socketToUser.set(socket.id,userId);
    })

    socket.on("signal",({to,data})=>{
        const senderUserId = socketToUser.get(socket.id);
        const targetSocketId = userToSocket.get(to);

        if(!senderUserId){
            console.log("Signal from unauthenticated socket");
            return;
        }

        if(!targetSocketId){
            console.log(`Target user not found :${to}`);
            return;
        }

        ioServer.to(targetSocketId).emit("signal",{from: senderUserId,data});
    })

    socket.on("disconnect",()=>{
        const userId = socketToUser.get(socket.id);
        if(userId){
            userToSocket.delete(userId)
            socketToUser.delete(socket.id)
            console.log(`User disconnected, ID : ${userId}`)
        }
    })
})

const PORT = 3000;
server.listen(PORT,()=>{
    console.log(`Server launched on port : ${PORT}`)
})
