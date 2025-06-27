import { useEffect, useRef, useState } from 'react';

export default function CameraUI() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);

  const startCamera = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = media;
        videoRef.current.play();
      }
      setStream(media);
    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
  };

  const flipCamera = () => {
    stopCamera();
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
    setTimeout(() => {
      startCamera();
    }, 300);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imgUrl = canvas.toDataURL('image/jpeg');
    setCapturedImage(imgUrl);
    stopCamera();
    setIsCameraOn(false);
  };

  useEffect(() => {
    if (isCameraOn) {
      startCamera();
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode, isCameraOn]);

  return (
    <div style={styles.container}>
      {!isCameraOn && !capturedImage && (
        <button style={styles.actionBtn} onClick={() => setIsCameraOn(true)}>
          📷 Capture Photo
        </button>
      )}

      {isCameraOn && (
        <>
          <video ref={videoRef} playsInline autoPlay muted style={styles.video} />
          <div style={styles.controls}>
            <button style={styles.btn} onClick={capturePhoto}>📸</button>
            <button style={styles.btn} onClick={flipCamera}>🔄</button>
          </div>
        </>
      )}

      {capturedImage && (
        <div>
          <img src={capturedImage} alt="Captured" style={styles.previewImg} />
          <div style={styles.controls}>
            <button style={styles.btn} onClick={() => setCapturedImage(null)}>
              🔁 Retake
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '1rem',
    textAlign: 'center',
    maxWidth: '480px',
    margin: '0 auto',
  },
  video: {
    width: '100%',
    borderRadius: '12px',
    background: '#000',
    aspectRatio: '9 / 16',
    objectFit: 'cover',
  },
  previewImg: {
    width: '100%',
    borderRadius: '12px',
    marginTop: '12px',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    gap: '1rem',
    marginTop: '1rem',
  },
  btn: {
    fontSize: '1.2rem',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#f1f1f1',
    cursor: 'pointer',
  },
  actionBtn: {
    fontSize: '1.1rem',
    padding: '12px 24px',
    borderRadius: '8px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
  }
};