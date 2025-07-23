import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, Scan, X, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { createWorker, PSM } from 'tesseract.js';


declare global {
  interface Window {
    Tesseract: any;
  }
}

// Load Tesseract from CDN with better error handling
const loadTesseract = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) {
      resolve(window.Tesseract);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/4.1.1/tesseract.min.js';
    script.onload = () => {
      // Wait a bit for the global to be available
      setTimeout(() => {
        if (window.Tesseract) {
          resolve(window.Tesseract);
        } else {
          reject(new Error('Tesseract failed to initialize'));
        }
      }, 100);
    };
    script.onerror = () => reject(new Error('Failed to load Tesseract script'));
    document.head.appendChild(script);
  });
};

const IndianPlateScanner: React.FC = () => {
  const [extractedText, setExtractedText] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [tesseractLoaded, setTesseractLoaded] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<any>(null);

  // Preload Tesseract on component mount
  useEffect(() => {
    const initTesseract = async () => {
      try {
        await loadTesseract();
        setTesseractLoaded(true);
      } catch (err) {
        console.error('Failed to load Tesseract:', err);
        setError('Failed to load OCR engine. Please refresh the page.');
      }
    };
    initTesseract();
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraOpen(true);
      }
    } catch (err) {
      setError('Camera access denied. Please allow camera permission.');
      console.error('Error accessing camera:', err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraOpen(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(imageDataUrl);
        stopCamera();
      }
    }
  }, [stopCamera]);

  const preprocessImage = useCallback((imageData: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 800;
      const maxHeight = 600;
      let { width, height } = img;

      // Resize if needed
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = width * ratio;
        height = height * ratio;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.warn('Canvas context is null — skipping preprocessing.');
        return resolve(imageData); // fallback to original
      }

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, width, height);

      // Enhance contrast
      const imageDataObj = ctx.getImageData(0, 0, width, height);
      const data = imageDataObj.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.2);       // R
        data[i + 1] = Math.min(255, data[i + 1] * 1.2); // G
        data[i + 2] = Math.min(255, data[i + 2] * 1.2); // B
      }
      ctx.putImageData(imageDataObj, 0, 0);

      // Return base64 string
      const processedBase64 = canvas.toDataURL('image/jpeg', 0.9);
      resolve(processedBase64);
    };

    img.onerror = () => {
      console.error('Failed to load image for preprocessing.');
      resolve(imageData); // fallback
    };

    img.src = imageData;
  });
}, []);

 const formatIndianPlate = (text: string): string | null => {
  let cleaned = text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .trim();

  const compact = cleaned.replace(/\s+/g, '');

  const patterns: RegExp[] = [
    /^([A-Z]{2})(\d{2})([A-Z]{1,2})(\d{4})$/,
    /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{3,4})$/,
    /^([A-Z]{2})(\d{2})([A-Z]{2,4})$/,
    /^([A-Z]{2})(\d{1,2})([A-Z]{1})(\d{3})$/,
    /^IND([A-Z]{2})(\d{2})([A-Z]{2})(\d{4})$/ // Matches INDRJ14CV0002
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (match) {
      return match.slice(1).join(' ');
    }
  }

  return null;
};

const processImage = useCallback(async (imageData: string) => {
  setIsProcessing(true);
  setError('');
  setExtractedText('');

  try {
    // ✅ Preprocess image
    const processedImage = await preprocessImage(imageData);

    // ✅ Create worker once
    if (!workerRef.current) {
      workerRef.current = await createWorker('eng');
      await workerRef.current.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
      });
    }

    // ✅ Use processed image for OCR
    const result = await workerRef.current.recognize(processedImage);

    let text = result.data.text
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .trim();

    const cleanedText = formatIndianPlate(text);

    if (cleanedText) {
      setExtractedText(cleanedText);
    } else {
      setError('Could not extract valid plate number. Try again.');
    }
  } catch (err) {
    console.error('OCR Error:', err);
    setError('Failed to process image. Please try again.');
  } finally {
    setIsProcessing(false);
  }
}, [preprocessImage]);


 
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setError('');
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageData = e.target?.result as string;
        setCapturedImage(imageData);
        // Process immediately when uploaded
        processImage(imageData);
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file.');
    }
  }, [processImage]);

  const resetScanner = useCallback(() => {
    setCapturedImage(null);
    setExtractedText('');
    setError('');
    setIsProcessing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 p-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="bg-white/10 backdrop-blur-md rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center border border-white/20">
            <Scan className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Vehicle Plate Scanner</h1>
          <p className="text-blue-200 text-sm">Scan Indian vehicle number plates instantly</p>
          {!tesseractLoaded && (
            <p className="text-yellow-400 text-xs mt-2 flex items-center justify-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Loading OCR engine...
            </p>
          )}
        </div>

        {/* Main Content */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 overflow-hidden shadow-2xl">
          
          {/* Camera/Image Display */}
          <div className="relative bg-black/50 aspect-video">
            {isCameraOpen ? (
              <div className="relative w-full h-full">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-2 border-dashed border-yellow-400/50 m-4 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-yellow-400 text-sm font-medium mb-2">
                      Align number plate within frame
                    </p>
                  </div>
                </div>
              </div>
            ) : capturedImage ? (
              <div className="relative w-full h-full">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full h-full object-cover"
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                    <div className="text-center text-white">
                      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                      <p className="text-sm font-medium">Processing with Tesseract OCR...</p>
                      <p className="text-xs text-blue-200 mt-1">Analyzing image...</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-center p-6">
                <div>
                  <Camera className="w-16 h-16 text-white/50 mx-auto mb-4" />
                  <p className="text-white/70 text-sm">
                    Click camera button to start scanning
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-6 space-y-4">
            {isCameraOpen ? (
              <div className="flex gap-3">
                <button
                  onClick={capturePhoto}
                  className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white py-3 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-lg"
                >
                  <Camera className="w-5 h-5" />
                  Capture Photo
                </button>
                <button
                  onClick={stopCamera}
                  className="bg-red-500/20 text-red-400 p-3 rounded-xl hover:bg-red-500/30 transition-all duration-200 border border-red-500/30"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={startCamera}
                  disabled={isProcessing || !tesseractLoaded}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 hover:from-blue-600 hover:to-purple-700 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Camera className="w-5 h-5" />
                  Open Camera
                </button>
                
                <div className="relative">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing || !tesseractLoaded}
                    className="w-full bg-white/10 text-white py-3 px-6 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-white/20 transition-all duration-200 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Upload className="w-5 h-5" />
                    Upload Image
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>
            )}

            {/* Extracted Text Display */}
            {(extractedText || error) && (
              <div className="space-y-3">
                <label className="block text-white/80 text-sm font-medium">
                  Extracted Number Plate:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={extractedText}
                    onChange={(e) => setExtractedText(e.target.value)}
                    placeholder="Number plate text will appear here..."
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all duration-200"
                  />
                  {extractedText && (
                    <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-green-400" />
                  )}
                </div>
                
                {error && (
                  <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {(capturedImage || extractedText) && (
                <button
                  onClick={resetScanner}
                  className="flex-1 bg-white/10 text-white py-2 px-4 rounded-lg font-medium hover:bg-white/20 transition-all duration-200 border border-white/20"
                >
                  Scan Another
                </button>
              )}
              {capturedImage && !isProcessing && (
                <button
                  onClick={() => processImage(capturedImage)}
                  disabled={!tesseractLoaded}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-red-600 text-white py-2 px-4 rounded-lg font-medium hover:from-orange-600 hover:to-red-700 transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Re-scan
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-blue-200/80 text-xs leading-relaxed">
            For best results, ensure the number plate is clearly visible, well-lit, and the image is sharp. 
            The app uses Tesseract OCR to recognize Indian vehicle registration plates.
          </p>
          <p className="text-blue-300/60 text-xs">
            Supported formats: XX 00 XX 0000 • Optimized for faster processing
          </p>
        </div>

        {/* Hidden Canvas */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};

export default IndianPlateScanner;