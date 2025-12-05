// src/app/room/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Video, VideoOff, Mic, MicOff, PhoneOff, ScanEye } from 'lucide-react';

// TensorFlow.js imports
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomName = params.id as string;

  const [micActive, setMicActive] = useState(true);
  const [cameraActive, setCameraActive] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('Initializing...');

  // Object Detection State
  const [detectionEnabled, setDetectionEnabled] = useState(false);
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);

  const userVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // Canvas for overlay
  const peerVideoRef = useRef<HTMLVideoElement>(null);
  const rtcConnectionRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const userStreamRef = useRef<MediaStream | null>(null);
  const hostRef = useRef(false);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Load model on mount
    const loadModel = async () => {
      try {
        await tf.ready();
        const loadedModel = await cocoSsd.load();
        setModel(loadedModel);
        console.log('Coco-SSD model loaded');
      } catch (err) {
        console.error('Failed to load Coco-SSD model', err);
      }
    };
    loadModel();
  }, []);

  useEffect(() => {
    if (!roomName) return;

    socketRef.current = io();

    socketRef.current.emit('join', roomName);

    socketRef.current.on('created', handleRoomCreated);
    socketRef.current.on('joined', handleRoomJoined);
    socketRef.current.on('ready', initiateCall);
    socketRef.current.on('leave', onPeerLeave);
    socketRef.current.on('full', () => {
      alert('Room is full!');
      router.push('/');
    });

    socketRef.current.on('offer', handleReceivedOffer);
    socketRef.current.on('answer', handleAnswer);
    socketRef.current.on('ice-candidate', handleNewIceCandidateMsg);

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      cleanup();
    };
  }, [roomName]);

  // Object Detection Loop
  useEffect(() => {
    let animationId: number;

    const runDetection = async () => {
      if (
        detectionEnabled &&
        model &&
        peerVideoRef.current &&
        canvasRef.current &&
        peerVideoRef.current.readyState === 4
      ) {
        const video = peerVideoRef.current; // Switched to peerVideoRef
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        if (context) {
          // Set canvas dimensions to match video
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          // Detect objects
          const predictions = await model.detect(video);

          // Clear previous drawings
          context.clearRect(0, 0, canvas.width, canvas.height);

          // Draw predictions
          predictions.forEach(prediction => {
            const [x, y, width, height] = prediction.bbox;

            // Draw box
            context.strokeStyle = '#00FFFF';
            context.lineWidth = 2;
            context.strokeRect(x, y, width, height);

            // Draw label background
            context.fillStyle = '#00FFFF';
            context.fillRect(x, y, width > 50 ? width : 50, 20);

            // Draw label text
            context.fillStyle = '#000000';
            context.font = '16px Arial';
            context.fillText(
              `${prediction.class} (${Math.round(prediction.score * 100)}%)`,
              x + 5,
              y + 15
            );
          });
        }
      } else if (!detectionEnabled && canvasRef.current) {
        // Clear canvas if detection disabled
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (context) {
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }

      if (detectionEnabled) {
        animationId = requestAnimationFrame(runDetection);
      }
    };

    if (detectionEnabled) {
      runDetection();
    } else {
      // Ensure cleanup if toggled off
      if (canvasRef.current) {
        const context = canvasRef.current.getContext('2d');
        context?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [detectionEnabled, model]);


  const handleRoomCreated = () => {
    hostRef.current = true;
    setConnectionStatus('Waiting for peer to join...');

    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: { width: 1280, height: 720 }
      })
      .then((stream) => {
        userStreamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        console.error('Error accessing media devices:', err);
        alert('Please allow camera and microphone access');
      });
  };

  const handleRoomJoined = () => {
    setConnectionStatus('Peer found! Connecting...');

    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: { width: 1280, height: 720 }
      })
      .then((stream) => {
        userStreamRef.current = stream;
        if (userVideoRef.current) {
          userVideoRef.current.srcObject = stream;
        }
        socketRef.current?.emit('ready', roomName);
      })
      .catch((err) => {
        console.error('Error accessing media devices:', err);
        alert('Please allow camera and microphone access');
      });
  };

  const initiateCall = () => {
    if (hostRef.current) {
      rtcConnectionRef.current = createPeerConnection();

      userStreamRef.current?.getTracks().forEach((track) => {
        rtcConnectionRef.current?.addTrack(track, userStreamRef.current!);
      });

      rtcConnectionRef.current
        .createOffer()
        .then((offer) => {
          rtcConnectionRef.current?.setLocalDescription(offer);
          socketRef.current?.emit('offer', offer, roomName);
        })
        .catch((error) => console.error('Error creating offer:', error));
    }
  };

  const createPeerConnection = (): RTCPeerConnection => {
    const connection = new RTCPeerConnection(ICE_SERVERS);

    connection.onicecandidate = handleICECandidateEvent;
    connection.ontrack = handleTrackEvent;
    connection.onconnectionstatechange = () => {
      console.log('Connection state:', connection.connectionState);
      setConnectionStatus(`Connection: ${connection.connectionState}`);

      if (connection.connectionState === 'connected') {
        setIsConnected(true);
        setConnectionStatus('Connected');
      } else if (connection.connectionState === 'disconnected' ||
        connection.connectionState === 'failed') {
        setIsConnected(false);
        setConnectionStatus('Connection lost');
      }
    };

    return connection;
  };

  const handleReceivedOffer = (offer: RTCSessionDescriptionInit) => {
    if (!hostRef.current) {
      rtcConnectionRef.current = createPeerConnection();

      userStreamRef.current?.getTracks().forEach((track) => {
        rtcConnectionRef.current?.addTrack(track, userStreamRef.current!);
      });

      rtcConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));

      rtcConnectionRef.current
        .createAnswer()
        .then((answer) => {
          rtcConnectionRef.current?.setLocalDescription(answer);
          socketRef.current?.emit('answer', answer, roomName);
        })
        .catch((error) => console.error('Error creating answer:', error));
    }
  };

  const handleAnswer = (answer: RTCSessionDescriptionInit) => {
    rtcConnectionRef.current
      ?.setRemoteDescription(new RTCSessionDescription(answer))
      .catch((err) => console.error('Error setting remote description:', err));
  };

  const handleICECandidateEvent = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      socketRef.current?.emit('ice-candidate', event.candidate, roomName);
    }
  };

  const handleNewIceCandidateMsg = (incoming: RTCIceCandidateInit) => {
    const candidate = new RTCIceCandidate(incoming);
    rtcConnectionRef.current
      ?.addIceCandidate(candidate)
      .catch((e) => console.error('Error adding ICE candidate:', e));
  };

  const handleTrackEvent = (event: RTCTrackEvent) => {
    if (peerVideoRef.current) {
      peerVideoRef.current.srcObject = event.streams[0];
    }
  };

  const onPeerLeave = () => {
    hostRef.current = true;
    setIsConnected(false);
    setConnectionStatus('Peer left the room');

    if (peerVideoRef.current?.srcObject) {
      const stream = peerVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      peerVideoRef.current.srcObject = null;
    }

    if (rtcConnectionRef.current) {
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }
  };

  const toggleMic = () => {
    userStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !micActive;
    });
    setMicActive((prev) => !prev);
  };

  const toggleCamera = () => {
    userStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !cameraActive;
    });
    setCameraActive((prev) => !prev);
  };

  const toggleDetection = () => {
    setDetectionEnabled(prev => !prev);
  };

  const cleanup = () => {
    if (userVideoRef.current?.srcObject) {
      const stream = userVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    if (peerVideoRef.current?.srcObject) {
      const stream = peerVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }

    if (rtcConnectionRef.current) {
      rtcConnectionRef.current.close();
      rtcConnectionRef.current = null;
    }
  };

  const leaveRoom = () => {
    socketRef.current?.emit('leave', roomName);
    cleanup();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4 text-white">
          <h1 className="text-2xl font-bold">Room: {roomName}</h1>
          <p className="text-sm text-gray-400">{connectionStatus}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Card className="relative bg-gray-800 border-gray-700 overflow-hidden aspect-video">
            <video
              ref={userVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2 bg-black/70 px-3 py-1 rounded-md text-white text-sm font-medium">
              You {!cameraActive && '(Camera Off)'}
            </div>
          </Card>

          <Card className="relative bg-gray-800 border-gray-700 overflow-hidden aspect-video">
            <video
              ref={peerVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {/* Canvas Overlay for Object Detection */}
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
            {!isConnected && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                <p className="text-gray-400">Waiting for peer...</p>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/70 px-3 py-1 rounded-md text-white text-sm font-medium">
              Peer
            </div>
            {/* Detection Status Indicator */}
            {detectionEnabled && (
              <div className="absolute top-2 right-2 bg-blue-600/80 px-2 py-1 rounded text-white text-xs">
                AI Detection On
              </div>
            )}
            {!model && detectionEnabled && (
              <div className="absolute top-10 right-2 bg-yellow-600/80 px-2 py-1 rounded text-white text-xs">
                Loading Model...
              </div>
            )}
          </Card>
        </div>

        <div className="flex justify-center gap-4">
          <Button
            onClick={toggleMic}
            variant={micActive ? "default" : "destructive"}
            size="lg"
            className="rounded-full w-14 h-14 p-0"
          >
            {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </Button>

          <Button
            onClick={toggleCamera}
            variant={cameraActive ? "default" : "destructive"}
            size="lg"
            className="rounded-full w-14 h-14 p-0"
          >
            {cameraActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </Button>

          {/* Toggle Detection Button */}
          <Button
            onClick={toggleDetection}
            variant={detectionEnabled ? "secondary" : "outline"}
            size="lg"
            className="rounded-full w-14 h-14 p-0"
            title="Toggle Object Detection"
          >
            <ScanEye className={`w-5 h-5 ${detectionEnabled ? 'text-blue-500' : ''}`} />
          </Button>

          <Button
            onClick={leaveRoom}
            variant="destructive"
            size="lg"
            className="rounded-full w-14 h-14 p-0"
          >
            <PhoneOff className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}