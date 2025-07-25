import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, SwitchCamera, X, ChevronLeft, ChevronRight, Trash2, Scan, Copy, Check } from 'lucide-react';

// Load Tesseract from CDN
declare global {
  interface Window {
    Tesseract: any;
  }
}

// Load Tesseract script
const loadTesseract = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Tesseract'));
    document.head.appendChild(script);
  });
};

interface CameraConstraints {
  video: {
    width: { ideal: number };
    height: { ideal: number };
    facingMode: 'user' | 'environment';
  };
}

interface CapturedPhoto {
  id: string;
  dataUrl: string;
  timestamp: Date;
  extractedText?: string;
}

type CameraFacing = 'user' | 'environment';

const ModernCameraApp: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('environment');
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [showGallery, setShowGallery] = useState<boolean>(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);
  const [showFullscreen, setShowFullscreen] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [showScanResult, setShowScanResult] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [tesseractLoaded, setTesseractLoaded] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<{
    camera: PermissionState | null;
  }>({ camera: null });

  // Check camera permissions
  const checkPermissions = useCallback(async (): Promise<void> => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      setPermissions(prev => ({ ...prev, camera: result.state }));
      
      result.addEventListener('change', () => {
        setPermissions(prev => ({ ...prev, camera: result.state }));
      });
    } catch (err) {
      console.warn('Permissions API not supported');
    }
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (): Promise<void> => {
    try {
      setError('');
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: CameraConstraints = {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: cameraFacing
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsStreaming(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
      setError(errorMessage);
      setIsStreaming(false);
    }
  }, [cameraFacing]);

  // Stop camera stream
  const stopCamera = useCallback((): void => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  // Switch camera (front/back)
  const switchCamera = useCallback((): void => {
    setCameraFacing(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  // Capture photo
  const capturePhoto = useCallback((): void => {
    if (!videoRef.current || !canvasRef.current || !isStreaming) return;

    setIsCapturing(true);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    // Create photo object
    const photo: CapturedPhoto = {
      id: Date.now().toString(),
      dataUrl,
      timestamp: new Date()
    };

    setCapturedPhotos(prev => [photo, ...prev]);
    
    setTimeout(() => setIsCapturing(false), 200);
  }, [isStreaming]);

  // Enhanced OCR preprocessing
  const preprocessImage = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    console.log(preprocessImage)

    // Convert to grayscale and increase contrast
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      
      // Increase contrast (simple thresholding)
      const enhanced = gray > 128 ? 255 : 0;
      
      data[i] = enhanced;     // Red
      data[i + 1] = enhanced; // Green
      data[i + 2] = enhanced; // Blue
      // Alpha remains unchanged
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // Utility to validate and format Indian number plates
  const validateIndianPlate = (rawText: string): string | null => {
    // Clean and normalize OCR input
    const cleaned = rawText
      .replace(/\s+/g, '')           // Remove spaces
      .toUpperCase()                 // Normalize case
      .replace(/[^A-Z0-9]/g, '')     // Remove non-alphanumerics
      .replace(/O/g, '0')            // O → 0
      .replace(/I/g, '1')            // I → 1
      .replace(/Z/g, '2')            // Z → 2
      .replace(/S/g, '5');           // S → 5

    // Flexible regex patterns for Indian plates
    const platePatterns = [
      /^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/,     // HR26AB1234
      /^[A-Z]{2}\d{2}\d{4}$/,               // HR261234 (old format)
      /^[A-Z]{3}\d{4}$/,                    // ABC1234 (some special formats)
    ];

    for (const pattern of platePatterns) {
      if (pattern.test(cleaned)) {
        // Format the matched plate
        if (cleaned.length >= 8) {
          // Standard format: XX00XX0000
          const state = cleaned.substring(0, 2);
          const district = cleaned.substring(2, 4);
          const series = cleaned.substring(4, cleaned.length - 4);
          const number = cleaned.substring(cleaned.length - 4);
          return `${state} ${district} ${series} ${number}`;
        } else if (cleaned.length === 7) {
          // Old format: XX000000
          const state = cleaned.substring(0, 2);
          const number = cleaned.substring(2);
          return `${state} ${number}`;
        }
        return cleaned; // Return as-is if format is unclear
      }
    }

    return null;
  };

  // Enhanced OCR preprocessing for number plates
  const preprocessImageForOCR = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convert to grayscale and enhance contrast
    for (let i = 0; i < data.length; i += 4) {
      // Apply weighted grayscale conversion
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      
      // Enhance contrast using simple thresholding
      const enhanced = gray > 120 ? 255 : 0;
      
      data[i] = enhanced;     // Red
      data[i + 1] = enhanced; // Green  
      data[i + 2] = enhanced; // Blue
      // Alpha remains unchanged
    }

    ctx.putImageData(imageData, 0, 0);
  };

  // Real OCR using Tesseract.js
  const performTesseractOCR = async (imageDataUrl: string): Promise<string> => {
    try {
      if (!window.Tesseract) {
        throw new Error('Tesseract not loaded');
      }

      // Create image element
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageDataUrl;
      });

      // Create canvas for preprocessing
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('Canvas context not available');
      }

      // Set canvas size and draw image
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Preprocess image for better OCR
      preprocessImageForOCR(canvas, ctx);

      // Configure Tesseract for number plate recognition
      const { data: { text, confidence } } = await window.Tesseract.recognize(
        canvas,
        'eng',
        {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
            }
          },
          config: {
            // Optimize for number plates
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
            tessedit_pageseg_mode: '8', // Single uniform block of text
            preserve_interword_spaces: '1',
            tessedit_do_invert: '0',
          }
        }
      );

      console.log(`OCR Confidence: ${confidence}%`);
      
      if (!text || text.trim().length === 0) {
        throw new Error('No text detected in image');
      }

      return text.trim();
    } catch (error) {
      console.error('Tesseract OCR Error:', error);
      throw new Error('Failed to extract text from image. Please ensure the number plate is clearly visible.');
    }
  };

  // Enhanced number plate scanning
  const scanNumberPlate = useCallback(async (): Promise<void> => {
    if (capturedPhotos.length === 0 || selectedPhotoIndex >= capturedPhotos.length) return;

    setIsScanning(true);
    setError('');

    try {
      const photo = capturedPhotos[selectedPhotoIndex];
      
      // Use Tesseract OCR
      const extractedRawText = await performTesseractOCR(photo.dataUrl);
      
      if (!extractedRawText.trim()) {
        setError('No text detected. Please ensure the number plate is clearly visible and try again.');
        return;
      }

      const formattedPlate = validateIndianPlate(extractedRawText) || extractedRawText.trim();

      setExtractedText(formattedPlate);

      setCapturedPhotos(prev =>
        prev.map((p, index) =>
          index === selectedPhotoIndex
            ? { ...p, extractedText: formattedPlate }
            : p
        )
      );

      setShowScanResult(true);
    } catch (err) {
      console.error('OCR Error:', err);
      setError('Failed to scan number plate. Please try again with a clearer image.');
    } finally {
      setIsScanning(false);
    }
  }, [capturedPhotos, selectedPhotoIndex]);

  // Copy text to clipboard
  const copyToClipboard = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(extractedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [extractedText]);

  // Delete photo
  const deletePhoto = useCallback((photoId: string): void => {
    setCapturedPhotos(prev => {
      const newPhotos = prev.filter(photo => photo.id !== photoId);
      // Adjust selected index if necessary
      if (selectedPhotoIndex >= newPhotos.length && newPhotos.length > 0) {
        setSelectedPhotoIndex(newPhotos.length - 1);
      } else if (newPhotos.length === 0) {
        setShowGallery(false);
        setShowFullscreen(false);
        setShowScanResult(false);
      }
      return newPhotos;
    });
  }, [selectedPhotoIndex]);

  // Navigate to previous photo
  const previousPhoto = useCallback((): void => {
    setSelectedPhotoIndex(prev => 
      prev > 0 ? prev - 1 : capturedPhotos.length - 1
    );
    setShowScanResult(false);
  }, [capturedPhotos.length]);

  // Navigate to next photo
  const nextPhoto = useCallback((): void => {
    setSelectedPhotoIndex(prev => 
      prev < capturedPhotos.length - 1 ? prev + 1 : 0
    );
    setShowScanResult(false);
  }, [capturedPhotos.length]);

  // Open fullscreen view
  const openFullscreen = useCallback((index: number): void => {
    setSelectedPhotoIndex(index);
    setShowFullscreen(true);
    setShowScanResult(false);
  }, []);

  // Load Tesseract on component mount
  useEffect(() => {
    const initTesseract = async () => {
      try {
        await loadTesseract();
        setTesseractLoaded(true);
        console.log('Tesseract loaded successfully');
      } catch (error) {
        console.error('Failed to load Tesseract:', error);
        setError('Failed to load OCR engine. Please refresh the page.');
      }
    };

    initTesseract();
  }, []);

  // Effects
  useEffect(() => {
    checkPermissions();
    return () => stopCamera();
  }, [checkPermissions, stopCamera]);

  useEffect(() => {
    if (isStreaming) {
      startCamera();
    }
  }, [cameraFacing, startCamera, isStreaming]);

  // Reset scan result when photo changes
  useEffect(() => {
    setShowScanResult(false);
    setExtractedText('');
  }, [selectedPhotoIndex]);

  if (permissions.camera === 'denied') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center text-white">
          <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2">Camera Access Denied</h2>
          <p className="text-gray-300 mb-4">Please allow camera access to use this feature</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Camera view */}
      <div className="relative w-full h-screen">
        {error ? (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center">
              <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={startCamera}
                className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
            />
            <canvas ref={canvasRef} className="hidden" />
          </>
        )}

        {/* Top controls */}
        <div className="absolute top-0 left-0 right-0 p-4 z-20">
          <div className="flex justify-between items-center">
            <div className="w-12"></div> {/* Spacer */}

            <div className="flex items-center space-x-2">
              {isStreaming && (
                <span className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-md">
                  LIVE
                </span>
              )}
            </div>

            <button
              onClick={() => setShowGallery(true)}
              className="p-3 rounded-full bg-black/30 backdrop-blur-md text-white transition-all hover:bg-black/50"
              disabled={capturedPhotos.length === 0}
            >
              <div className="relative">
                {capturedPhotos.length > 0 && (
                  <>
                    <div className="w-8 h-8 rounded bg-white/20 border-2 border-white/50" />
                    <span className="absolute -top-2 -right-2 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {capturedPhotos.length}
                    </span>
                  </>
                )}
                {capturedPhotos.length === 0 && (
                  <div className="w-8 h-8 rounded bg-gray-600/50 border-2 border-gray-400/50" />
                )}
              </div>
            </button>
          </div>
        </div>

        {/* Scan Result Input on Main Screen */}
        {showScanResult && (
          <div className="absolute top-20 left-4 right-4 z-30">
            <div className="bg-gray-900/95 backdrop-blur-md rounded-lg p-4 border border-gray-700">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white text-lg font-semibold">Scanned Number Plate</h3>
                <button
                  onClick={() => setShowScanResult(false)}
                  className="p-1 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="relative">
                <input
                  type="text"
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-mono"
                  placeholder="No text extracted"
                />
                {extractedText && (
                  <button
                    onClick={copyToClipboard}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 text-gray-400 hover:text-white transition-colors"
                  >
                    {isCopied ? (
                      <Check className="w-5 h-5 text-green-500" />
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
              
              {isCopied && (
                <p className="text-green-400 text-sm mt-2">✓ Copied to clipboard!</p>
              )}
            </div>
          </div>
        )}

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
          <div className="flex justify-center items-center space-x-8">
            {/* Switch camera button */}
            <button
              onClick={switchCamera}
              disabled={!isStreaming}
              className="p-4 rounded-full bg-black/30 backdrop-blur-md text-white transition-all hover:bg-black/50 disabled:opacity-50"
            >
              <SwitchCamera className="w-7 h-7" />
            </button>

            {/* Capture button */}
            <button
              onClick={isStreaming ? capturePhoto : startCamera}
              disabled={isCapturing}
              className={`relative w-20 h-20 rounded-full border-4 border-white transition-all ${
                isCapturing ? 'scale-90' : 'hover:scale-105 active:scale-95'
              } ${isStreaming ? 'bg-white' : 'bg-red-600'}`}
            >
              {isStreaming ? (
                <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-red-600" />
                </div>
              ) : (
                <Camera className="w-8 h-8 text-white mx-auto" />
              )}
            </button>

            {/* Scan button - Always visible when photos exist and Tesseract is loaded */}
            {capturedPhotos.length > 0 && tesseractLoaded && (
              <button
                onClick={scanNumberPlate}
                disabled={isScanning}
                className={`p-4 rounded-full backdrop-blur-md text-white transition-all ${
                  isScanning 
                    ? 'bg-gray-600/50 cursor-not-allowed' 
                    : 'bg-blue-600/90 hover:bg-blue-600 active:scale-95'
                }`}
              >
                <Scan className={`w-7 h-7 ${isScanning ? 'animate-pulse' : ''}`} />
              </button>
            )}

            {/* Loading indicator for Tesseract */}
            {capturedPhotos.length > 0 && !tesseractLoaded && (
              <div className="p-4 rounded-full bg-yellow-600/90 backdrop-blur-md text-white">
                <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {/* Stop camera button - only show when camera is on and no photos */}
            {isStreaming && capturedPhotos.length === 0 && (
              <button
                onClick={stopCamera}
                className="p-4 rounded-full bg-black/30 backdrop-blur-md text-white transition-all hover:bg-black/50"
              >
                <X className="w-7 h-7" />
              </button>
            )}

            {/* Spacer when needed */}
            {!isStreaming && capturedPhotos.length === 0 && <div className="w-16"></div>}
          </div>
          
          {/* Scan status indicator */}
          {isScanning && (
            <div className="text-center mt-4">
              <p className="text-white text-sm bg-blue-600/80 backdrop-blur-md px-4 py-2 rounded-full inline-block">
                {tesseractLoaded ? 'Scanning Number Plate...' : 'Loading OCR Engine...'}
              </p>
            </div>
          )}

          {/* Tesseract loading indicator */}
          {!tesseractLoaded && !isScanning && (
            <div className="text-center mt-4">
              <p className="text-white text-sm bg-yellow-600/80 backdrop-blur-md px-4 py-2 rounded-full inline-block">
                Loading OCR Engine...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gallery modal */}
      {showGallery && !showFullscreen && (
        <div className="absolute inset-0 bg-black z-40">
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center p-4 border-b border-gray-800">
              <h2 className="text-white text-xl font-semibold">Gallery ({capturedPhotos.length})</h2>
              <button
                onClick={() => setShowGallery(false)}
                className="p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {capturedPhotos.length === 0 ? (
                <div className="text-center text-gray-400 mt-20">
                  <Camera className="w-16 h-16 mx-auto mb-4" />
                  <p>No photos captured yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {capturedPhotos.map((photo, index) => (
                    <div key={photo.id} className="relative">
                      <img
                        src={photo.dataUrl}
                        alt={`Captured ${photo.timestamp.toLocaleString()}`}
                        className="w-full aspect-square object-cover rounded-lg cursor-pointer"
                        onClick={() => openFullscreen(index)}
                      />
                      {photo.extractedText && (
                        <div className="absolute top-2 right-2 bg-green-600 text-white text-xs px-2 py-1 rounded">
                          Scanned
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen photo viewer */}
      {showFullscreen && capturedPhotos.length > 0 && (
        <div className="absolute inset-0 bg-black z-50">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex justify-between items-center p-4">
              <button
                onClick={() => setShowFullscreen(false)}
                className="p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              
              <span className="text-white text-lg font-medium">
                {selectedPhotoIndex + 1} of {capturedPhotos.length}
              </span>
              
              <button
                onClick={() => deletePhoto(capturedPhotos[selectedPhotoIndex].id)}
                className="p-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-6 h-6" />
              </button>
            </div>

            {/* Photo container */}
            <div className="flex-1 relative flex items-center justify-center">
              <img
                src={capturedPhotos[selectedPhotoIndex].dataUrl}
                alt={`Photo ${selectedPhotoIndex + 1}`}
                className="max-w-full max-h-full object-contain"
              />

              {/* Navigation arrows */}
              {capturedPhotos.length > 1 && (
                <>
                  <button
                    onClick={previousPhoto}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <ChevronLeft className="w-8 h-8" />
                  </button>
                  
                  <button
                    onClick={nextPhoto}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <ChevronRight className="w-8 h-8" />
                  </button>
                </>
              )}
            </div>

            {/* Bottom controls with Scan Button */}
            <div className="p-4 space-y-4">
              {/* Scan Button */}
              <div className="flex justify-center">
                <button
                  onClick={scanNumberPlate}
                  disabled={isScanning || !tesseractLoaded}
                  className={`flex items-center space-x-2 px-8 py-4 rounded-lg font-semibold text-lg transition-all ${
                    isScanning || !tesseractLoaded
                      ? 'bg-gray-600 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  } text-white shadow-lg`}
                >
                  <Scan className={`w-6 h-6 ${isScanning ? 'animate-pulse' : ''}`} />
                  <span>
                    {!tesseractLoaded ? 'Loading OCR...' : 
                     isScanning ? 'Scanning Number Plate...' : 
                     'Scan Number Plate'}
                  </span>
                </button>
              </div>

              {/* Photo info */}
              <div className="text-center text-gray-400">
                <p className="text-sm">{capturedPhotos[selectedPhotoIndex].timestamp.toLocaleString()}</p>
                {capturedPhotos[selectedPhotoIndex].extractedText && (
                  <p className="text-xs text-green-400 mt-1">✓ Already scanned</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModernCameraApp;