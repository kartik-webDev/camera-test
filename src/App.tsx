import {  useRef, useState } from 'react';

export default function CameraUI() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  const startCamera = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      setStream(media);
      if (videoRef.current) {
        videoRef.current.srcObject = media;
      }
      setIsCameraOn(true);
    } catch (err) {
      console.error('Camera access error:', err);
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
    setIsCameraOn(false);
  };

  const toggleFacingMode = () => {
    stopCamera();
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageDataUrl = canvas.toDataURL('image/jpeg');
    setCapturedImage(imageDataUrl);
    stopCamera(); // optional: stop stream after capture
  };

  return (
    <div style={styles.container}>
      {!isCameraOn && (
        <button onClick={startCamera} style={styles.openBtn}>📷 Open Camera</button>
      )}

      <div style={styles.preview}>
        {isCameraOn && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={styles.video}
          />
        )}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        {capturedImage && (
          <img src={capturedImage} alt="captured" style={styles.previewImg} />
        )}
      </div>

      {isCameraOn && (
        <div style={styles.controls}>
          <button onClick={capturePhoto} style={styles.captureBtn}>📸</button>
          <button onClick={toggleFacingMode} style={styles.flipBtn}>🔄 Flip</button>
          <button onClick={stopCamera} style={styles.closeBtn}>❌ Close</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    maxWidth: '100%',
    margin: '0 auto',
    padding: '16px',
    textAlign: 'center',
  },
  openBtn: {
    padding: '12px 24px',
    fontSize: '16px',
    borderRadius: '8px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
  },
  preview: {
    marginTop: '12px',
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    aspectRatio: '9 / 16',
    objectFit: 'cover',
    borderRadius: '12px',
  },
  previewImg: {
    width: '100%',
    marginTop: '10px',
    borderRadius: '12px',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: '12px',
    gap: '10px',
  },
  captureBtn: {
    fontSize: '24px',
    padding: '10px',
    borderRadius: '50%',
    background: '#fff',
    border: '2px solid #ccc',
  },
  flipBtn: {
    fontSize: '16px',
    padding: '8px 12px',
    background: '#eee',
    borderRadius: '6px',
  },
  closeBtn: {
    fontSize: '16px',
    padding: '8px 12px',
    background: '#f44336',
    color: '#fff',
    borderRadius: '6px',
  }
};