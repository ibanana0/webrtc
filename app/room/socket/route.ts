// src/app/api/socket/route.ts
import { Server as SocketIOServer } from 'socket.io';

// Type untuk socket server
declare global {
  var io: SocketIOServer | undefined;
}

export async function GET() {
  if (!global.io) {
    console.log('Initializing Socket.io server...');
    
    // Di Next.js App Router, kita perlu approach berbeda
    // Karena API routes adalah serverless, Socket.io tidak bisa langsung digunakan
    // Kita perlu custom server atau menggunakan alternatif
    
    return new Response(
      JSON.stringify({ 
        error: 'Socket.io requires custom server with App Router' 
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
