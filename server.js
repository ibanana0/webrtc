// server.js
/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer: createHttpServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all interfaces
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  let server;
  let protocol = 'http';

  // Check for SSL certificates
  const keyPath = path.join(__dirname, 'localhost.key');
  const certPath = path.join(__dirname, 'localhost.crt');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const httpsOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    server = createHttpsServer(httpsOptions, async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    });
    protocol = 'https';
    console.log('> Using HTTPS with self-signed certificates');
  } else {
    server = createHttpServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('internal server error');
      }
    });
    console.log('> No certificates found, using HTTP');
  }

  // Setup Socket.io
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on('join', (roomName) => {
      const { rooms } = io.sockets.adapter;
      const room = rooms.get(roomName);

      if (room === undefined) {
        socket.join(roomName);
        socket.emit('created');
        console.log(`Room ${roomName} created by ${socket.id}`);
      } else if (room.size === 1) {
        socket.join(roomName);
        socket.emit('joined');
        console.log(`${socket.id} joined room ${roomName}`);
      } else {
        socket.emit('full');
        console.log(`Room ${roomName} is full`);
      }
    });

    socket.on('ready', (roomName) => {
      socket.broadcast.to(roomName).emit('ready');
    });

    socket.on('ice-candidate', (candidate, roomName) => {
      socket.broadcast.to(roomName).emit('ice-candidate', candidate);
    });

    socket.on('offer', (offer, roomName) => {
      socket.broadcast.to(roomName).emit('offer', offer);
    });

    socket.on('answer', (answer, roomName) => {
      socket.broadcast.to(roomName).emit('answer', answer);
    });

    socket.on('leave', (roomName) => {
      socket.leave(roomName);
      socket.broadcast.to(roomName).emit('leave');
    });

    socket.on('disconnecting', () => {
      const rooms = [...socket.rooms];
      rooms.forEach((room) => {
        if (room !== socket.id) {
          socket.to(room).emit('leave');
          console.log(`User ${socket.id} left room ${room} (disconnecting)`);
        }
      });
    });

    socket.on('disconnect', () => {
      console.log(`User Disconnected: ${socket.id}`);
    });
  });

  server
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on ${protocol}://${hostname}:${port}`);

      // Print local network IP
      const { networkInterfaces } = require('os');
      const nets = networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
          if (net.family === 'IPv4' && !net.internal) {
            console.log(`> Local Network: ${protocol}://${net.address}:${port}`);
          }
        }
      }
    });
});
