// src/app/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function Home() {
  const router = useRouter();
  const [roomName, setRoomName] = useState('');

  const joinRoom = () => {
    const finalRoomName = roomName.trim() || Math.random().toString(36).slice(2, 10);
    router.push(`/room/${finalRoomName}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            WebRTC Video Call
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Room Name (optional)
            </label>
            <Input
              type="text"
              placeholder="Enter room name..."
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              className="w-full"
            />
          </div>
          <Button 
            onClick={joinRoom} 
            className="w-full"
            size="lg"
          >
            Join Room
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Share the room name with someone to start a video call
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
