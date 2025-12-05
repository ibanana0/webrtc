// pages/api/socket.js
import { Server } from 'socket.io';

const SocketHandler = (req, res) => {
  // Cek apakah socket sudah attach
  if (res.socket.server.io) {
    console.log('Socket is already attached');
    return res.end();
  }

  // Inisialisasi Socket.io server
  const io = new Server(res.socket.server);
  res.socket.server.io = io;

  io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Event: User join room
    socket.on("join", (roomName) => {
      const { rooms } = io.sockets.adapter;
      const room = rooms.get(roomName);

      // Room belum ada - user pertama
      if (room === undefined) {
        socket.join(roomName);
        socket.emit("created");
      } 
      // Room sudah ada dengan 1 user - user kedua join
      else if (room.size === 1) {
        socket.join(roomName);
        socket.emit("joined");
      } 
      // Room penuh (sudah ada 2 user)
      else {
        socket.emit("full");
      }
    });

    // Event: User siap untuk call
    socket.on("ready", (roomName) => {
      socket.broadcast.to(roomName).emit("ready");
    });

    // Event: Kirim ICE candidate ke peer
    socket.on("ice-candidate", (candidate, roomName) => {
      socket.broadcast.to(roomName).emit("ice-candidate", candidate);
    });

    // Event: Kirim offer ke peer
    socket.on("offer", (offer, roomName) => {
      socket.broadcast.to(roomName).emit("offer", offer);
    });

    // Event: Kirim answer ke peer
    socket.on("answer", (answer, roomName) => {
      socket.broadcast.to(roomName).emit("answer", answer);
    });

    // Event: User leave room
    socket.on("leave", (roomName) => {
      socket.leave(roomName);
      socket.broadcast.to(roomName).emit("leave");
    });
  });

  return res.end();
};

export default SocketHandler;
