import React, { useRef, useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Download } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface CircleAnalysis {
  score: number;
  completeness: number;
  roundness: number;
  symmetry: number;
}

const CircleGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [bestScore, setBestScore] = useState<number>(0);
  const [analysis, setAnalysis] = useState<CircleAnalysis | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [photocardUrl, setPhotocardUrl] = useState<string | null>(null);
  const [isPhotocardOpen, setIsPhotocardOpen] = useState(false);

  // Load best score from localStorage
  useEffect(() => {
    const savedBestScore = localStorage.getItem('circleGameBestScore');
    if (savedBestScore) {
      setBestScore(parseInt(savedBestScore, 10));
    }
  }, []);

  // Save best score to localStorage
  useEffect(() => {
    if (score !== null && score > bestScore) {
      setBestScore(score);
      localStorage.setItem('circleGameBestScore', score.toString());
      toast({
        title: "New Best Score! 🎉",
        description: `You achieved ${score} points!`,
      });
    }
  }, [score, bestScore]);

  const getCanvasCoordinates = (event: React.MouseEvent | React.TouchEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX: number, clientY: number;

    if ('touches' in event) {
      clientX = event.touches[0]?.clientX || event.changedTouches[0]?.clientX || 0;
      clientY = event.touches[0]?.clientY || event.changedTouches[0]?.clientY || 0;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    const point = getCanvasCoordinates(event);
    setIsDrawing(true);
    setCurrentPath([point]);
    setScore(null);
    setAnalysis(null);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      // Clear previous path if we are starting new
      if (currentPath.length > 0 && score !== null) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }

      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2d3748'; // Dark pencil/pen color
    }
  };

  const draw = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    if (!isDrawing) return;

    const point = getCanvasCoordinates(event);
    setCurrentPath(prev => [...prev, point]);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  };

  const stopDrawing = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    if (!isDrawing) return;

    setIsDrawing(false);
    setAttempts(prev => prev + 1);

    // Analyze the drawn circle
    if (currentPath.length > 10) {
      const analysis = analyzeCircle(currentPath);
      setAnalysis(analysis);
      setScore(analysis.score);
    } else {
      toast({
        title: "Draw a longer path",
        description: "Try drawing a complete circle for scoring.",
        variant: "destructive"
      });
    }
  };

  const analyzeCircle = (path: Point[]): CircleAnalysis => {
    if (path.length < 10) {
      return { score: 0, completeness: 0, roundness: 0, symmetry: 0 };
    }

    // Calculate center point
    const centerX = path.reduce((sum, p) => sum + p.x, 0) / path.length;
    const centerY = path.reduce((sum, p) => sum + p.y, 0) / path.length;

    // Calculate distances from center
    const distances = path.map(p =>
      Math.sqrt((p.x - centerX) ** 2 + (p.y - centerY) ** 2)
    );

    const avgRadius = distances.reduce((sum, d) => sum + d, 0) / distances.length;

    // Completeness: Check if the path forms a closed loop
    const startPoint = path[0];
    const endPoint = path[path.length - 1];
    const closureDistance = Math.sqrt(
      (startPoint.x - endPoint.x) ** 2 + (startPoint.y - endPoint.y) ** 2
    );
    const completeness = Math.max(0, 100 - (closureDistance / avgRadius) * 50);

    // Roundness: How consistent the radius is
    const radiusVariance = distances.reduce((sum, d) => sum + (d - avgRadius) ** 2, 0) / distances.length;
    const radiusStdDev = Math.sqrt(radiusVariance);
    const roundness = Math.max(0, 100 - (radiusStdDev / avgRadius) * 200);

    // Symmetry: Check angular distribution
    const angles = path.map(p => Math.atan2(p.y - centerY, p.x - centerX));
    const sortedAngles = [...angles].sort((a, b) => a - b);

    let symmetryScore = 100;
    if (sortedAngles.length > 1) {
      const expectedAngleStep = (2 * Math.PI) / sortedAngles.length;
      let angleVariance = 0;

      for (let i = 1; i < sortedAngles.length; i++) {
        const actualStep = sortedAngles[i] - sortedAngles[i - 1];
        angleVariance += (actualStep - expectedAngleStep) ** 2;
      }

      const avgAngleVariance = angleVariance / (sortedAngles.length - 1);
      symmetryScore = Math.max(0, 100 - Math.sqrt(avgAngleVariance) * 50);
    }

    // Calculate final score (weighted average)
    const finalScore = Math.round(
      completeness * 0.3 + roundness * 0.5 + symmetryScore * 0.2
    );

    return {
      score: Math.max(0, Math.min(100, finalScore)),
      completeness: Math.round(completeness),
      roundness: Math.round(roundness),
      symmetry: Math.round(symmetryScore)
    };
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    setCurrentPath([]);
    setScore(null);
    setAnalysis(null);
    setIsDrawing(false);
  }, []);

  const generatePhotocard = useCallback(() => {
    if (!analysis || !score) {
      toast({
        title: "No circle found",
        description: "Draw a circle first to generate a report!",
        variant: "destructive"
      });
      return;
    }

    const width = 600;
    const height = 800;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background
    // Dark chalkboard texture
    ctx.fillStyle = '#1a202c'; // Zinc-900 like
    ctx.fillRect(0, 0, width, height);

    // Add some noise/texture (simplified)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.fillRect(x, y, 1, 1);
    }

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // 2. Title
    ctx.font = 'bold 48px "Patrick Hand", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText("Circle Report Card", width / 2, 80);

    // 3. Draw User's Circle
    if (currentPath.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      currentPath.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });

      const pathWidth = maxX - minX;
      const pathHeight = maxY - minY;

      const targetSize = 300; // Size on photocard
      const scale = Math.min(targetSize / pathWidth, targetSize / pathHeight);

      ctx.save();
      ctx.translate(width / 2, 300); // Center of drawing area
      // Center the path itself
      ctx.translate(-(minX + pathWidth / 2) * scale, -(minY + pathHeight / 2) * scale);

      ctx.beginPath();
      currentPath.forEach((p, index) => {
        const x = p.x * scale;
        const y = p.y * scale;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#63b3ed'; // Light blue chalk
      ctx.lineWidth = 3 / scale * 2;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Grade & Score
    const grade = getGrade(score);
    const color = getGradeColor(score).replace('text-', '').replace('-400', '');
    let gradeHex = '#ffffff';
    if (color.includes('green')) gradeHex = '#48bb78';
    if (color.includes('blue')) gradeHex = '#4299e1';
    if (color.includes('yellow')) gradeHex = '#ecc94b';
    if (color.includes('red')) gradeHex = '#f56565';

    ctx.font = 'bold 120px "Patrick Hand", sans-serif';
    ctx.fillStyle = gradeHex;
    ctx.fillText(grade, width / 2, 550);

    ctx.font = '36px "Patrick Hand", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${score}% Accuracy`, width / 2, 600);

    // 5. Stats Grid
    ctx.font = '24px "Patrick Hand", sans-serif';
    ctx.fillStyle = '#cbd5e0';
    ctx.textAlign = 'left';

    const startX = 150;
    const startY = 660;
    const lineHeight = 40;

    ctx.fillText(`Roundness: ${analysis.roundness}%`, startX, startY);
    ctx.fillText(`Closure: ${analysis.completeness}%`, startX, startY + lineHeight);
    ctx.fillText(`Attempts: ${attempts}`, startX, startY + lineHeight * 2);

    // 6. Footer
    ctx.font = 'italic 20px sans-serif';
    ctx.fillStyle = '#718096';
    ctx.textAlign = 'center';
    ctx.fillText("Generated by Perfect Circle Game", width / 2, height - 40);

    setPhotocardUrl(canvas.toDataURL('image/png'));
    setIsPhotocardOpen(true);
  }, [analysis, score, currentPath, attempts]);

  const downloadPhotocard = () => {
    if (photocardUrl) {
      const link = document.createElement('a');
      link.href = photocardUrl;
      link.download = `circle-report-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Resize canvas logic
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Only update if dimensions actually changed to avoid clearing canvas unnecessarily
        if (canvasRef.current.width !== width || canvasRef.current.height !== height) {
          canvasRef.current.width = width;
          canvasRef.current.height = height;
          clearCanvas();
        }
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial resize
    handleResize();

    // Use ResizeObserver for more robust size detection
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [clearCanvas]);

  // Initial canvas setup
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = '#2d3748';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);


  const getGrade = (score: number | null): string => {
    if (score === null) return '-';
    if (score >= 97) return 'A+';
    if (score >= 93) return 'A';
    if (score >= 90) return 'A-';
    if (score >= 87) return 'B+';
    if (score >= 83) return 'B';
    if (score >= 80) return 'B-';
    if (score >= 77) return 'C+';
    if (score >= 73) return 'C';
    if (score >= 70) return 'C-';
    if (score >= 60) return 'D';
    return 'F';
  };

  const getGradeColor = (score: number | null): string => {
    if (score === null) return 'text-gray-400';
    if (score >= 90) return 'text-green-400';
    if (score >= 80) return 'text-blue-400';
    if (score >= 70) return 'text-yellow-400';
    return 'text-red-400';
  }


  return (
    <div className="chalkboard-bg min-h-screen w-full flex flex-col items-center justify-center p-4 overflow-hidden font-patrick">

      <div className="text-center mb-6 z-10">
        <div className="flex items-center justify-center gap-3">
          <svg className="w-12 h-12 text-white opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
          <h1 className="text-3xl lg:text-5xl font-bold chalk-text tracking-wider">Perfect Circle</h1>
        </div>
        <p className="text-gray-300 text-lg lg:text-xl mt-1 opacity-80">Class assignment: Draw a perfect circle.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-6xl h-full lg:h-auto z-10">

        {/* Notebook Drawing Area */}
        <div className="lg:col-span-2 relative">
          <div className="notebook-paper w-full h-[50vh] min-h-[350px] lg:h-[500px] rounded-sm relative flex flex-col items-center justify-center p-4 lg:p-8 transform -rotate-1 transition-all">

            <div
              ref={containerRef}
              className="relative w-full h-full z-20 flex items-center justify-center group cursor-crosshair"
            >
              <canvas
                ref={canvasRef}
                className="absolute inset-0 block touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />

              {!isDrawing && currentPath.length === 0 && (
                <span className="text-gray-400 text-xl lg:text-2xl group-hover:opacity-50 transition-opacity pointer-events-none select-none font-patrick text-center">
                  ( Draw a circle here )
                </span>
              )}
            </div>
          </div>

          {/* Decorations */}
          <div className="hidden sm:flex absolute -bottom-6 -right-4 w-48 h-12 bg-yellow-600 border border-yellow-800 rounded shadow-xl transform rotate-12 items-center justify-around px-2 z-30 opacity-90 pointer-events-none">
            <div className="text-[10px] text-yellow-900 font-sans font-bold">RULER 30cm</div>
            <div className="h-full border-r border-yellow-800/50"></div>
            <div className="h-1/2 border-r border-yellow-800/50"></div>
            <div className="h-full border-r border-yellow-800/50"></div>
          </div>
          <div className="absolute bottom-10 -left-6 w-8 h-20 bg-white rounded shadow-lg transform -rotate-45 z-30 pointer-events-none opacity-90"></div>

          <div className="mt-6 z-20 w-full flex justify-center gap-4">
            <button onClick={clearCanvas} className="cta cta-orange">
              <span className="span">ERASE</span>
              <span className="second">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '15px', transform: 'translateY(-1px)' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              </span>
            </button>
            <button onClick={generatePhotocard} disabled={!score} className="cta">
              <span className="span">GET YOUR REPORT</span>
              <span className="second">
                <svg
                  width="25px"
                  height="10px"
                  viewBox="0 0 66 43"
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                >
                  <g
                    id="arrow"
                    stroke="none"
                    strokeWidth="1"
                    fill="none"
                    fillRule="evenodd"
                  >
                    <path
                      className="one"
                      d="M40.1543933,3.89485454 L43.9763149,0.139296592 C44.1708311,-0.0518420739 44.4826329,-0.0518571125 44.6771675,0.139262789 L65.6916134,20.7848311 C66.0855801,21.1718824 66.0911863,21.8050225 65.704135,22.1989893 C65.7000188,22.2031791 65.6958657,22.2073326 65.6916762,22.2114492 L44.677098,42.8607841 C44.4825957,43.0519059 44.1708242,43.0519358 43.9762853,42.8608513 L40.1545186,39.1069479 C39.9575152,38.9134427 39.9546793,38.5968729 40.1481845,38.3998695 C40.1502893,38.3977268 40.1524132,38.395603 40.1545562,38.3934985 L56.9937789,21.8567812 C57.1908028,21.6632968 57.193672,21.3467273 57.0001876,21.1497035 C56.9980647,21.1475418 56.9959223,21.1453995 56.9937605,21.1432767 L40.1545208,4.60825197 C39.9574869,4.41477773 39.9546013,4.09820839 40.1480756,3.90117456 C40.1501626,3.89904911 40.1522686,3.89694235 40.1543933,3.89485454 Z"
                      fill="#FFFFFF"
                    ></path>
                    <path
                      className="two"
                      d="M20.1543933,3.89485454 L23.9763149,0.139296592 C24.1708311,-0.0518420739 24.4826329,-0.0518571125 24.6771675,0.139262789 L45.6916134,20.7848311 C46.0855801,21.1718824 46.0911863,21.8050225 45.704135,22.1989893 C45.7000188,22.2031791 45.6958657,22.2073326 45.6916762,22.2114492 L24.677098,42.8607841 C24.4825957,43.0519059 24.1708242,43.0519358 23.9762853,42.8608513 L20.1545186,39.1069479 C19.9575152,38.9134427 19.9546793,38.5968729 20.1481845,38.3998695 C20.1502893,38.3977268 20.1524132,38.395603 20.1545562,38.3934985 L36.9937789,21.8567812 C37.1908028,21.6632968 37.193672,21.3467273 37.0001876,21.1497035 C36.9980647,21.1475418 36.9959223,21.1453995 36.9937605,21.1432767 L20.1545208,4.60825197 C19.9574869,4.41477773 19.9546013,4.09820839 20.1480756,3.90117456 C20.1501626,3.89904911 20.1522686,3.89694235 20.1543933,3.89485454 Z"
                      fill="#FFFFFF"
                    ></path>
                    <path
                      className="three"
                      d="M0.154393339,3.89485454 L3.97631488,0.139296592 C4.17083111,-0.0518420739 4.48263286,-0.0518571125 4.67716753,0.139262789 L25.6916134,20.7848311 C26.0855801,21.1718824 26.0911863,21.8050225 25.704135,22.1989893 C25.7000188,22.2031791 25.6958657,22.2073326 25.6916762,22.2114492 L4.67709797,42.8607841 C4.48259567,43.0519059 4.17082418,43.0519358 3.97628526,42.8608513 L0.154518591,39.1069479 C-0.0424848215,38.9134427 -0.0453206733,38.5968729 0.148184538,38.3998695 C0.150289256,38.3977268 0.152413239,38.395603 0.154556228,38.3934985 L16.9937789,21.8567812 C17.1908028,21.6632968 17.193672,21.3467273 17.0001876,21.1497035 C16.9980647,21.1475418 16.9959223,21.1453995 16.9937605,21.1432767 L0.15452076,4.60825197 C-0.0425130651,4.41477773 -0.0453986756,4.09820839 0.148075568,3.90117456 C0.150162624,3.89904911 0.152268631,3.89694235 0.154393339,3.89485454 Z"
                      fill="#FFFFFF"
                    ></path>
                  </g>
                </svg>
              </span>
            </button>
          </div>
        </div>

        {/* Chalk Panel */}
        <div className="lg:col-span-1 flex flex-col gap-6">

          {/* Grade Panel */}
          <div className="chalk-border p-6 flex flex-col items-center justify-center bg-white/5 min-h-[200px]">
            <div className="flex items-center gap-2 mb-2 text-yellow-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
              <h3 className="text-3xl chalk-text">Your Grade</h3>
            </div>

            <div className="w-full border-b border-dashed border-white/20 my-4"></div>

            <div className="text-center w-full">
              {score === null ? (
                <>
                  <div className="inline-block p-4 rounded-full border-4 border-white/20 mb-2">
                    <div className="w-4 h-4 bg-white/20 rounded-full"></div>
                  </div>
                  <p className="text-gray-400 text-lg">Draw to get graded!</p>
                </>
              ) : (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <div className={`text-8xl font-bold ${getGradeColor(score)} mb-2 chalk-text rock-salt-regular`} style={{ textShadow: '4px 4px 0px rgba(0,0,0,0.5)' }}>
                    {getGrade(score)}
                  </div>
                  <div className="text-2xl text-white/90 chalk-text">
                    {score}% Accuracy
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Report Card */}
          <div className="chalk-border p-6 bg-white/5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-2xl chalk-text">Report Card</h3>
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z"></path></svg>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-gray-300 text-xl">Best Score:</span>
                <div className="bg-white/10 px-3 py-1 rounded border border-white/20 text-white text-xl font-mono">
                  {bestScore > 0 ? `${bestScore}%` : '-'}
                </div>
              </div>

              {/* Detailed Stats */}
              {analysis && (
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Roundness</span>
                    <span className="text-green-300">{analysis.roundness}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500/50" style={{ width: `${analysis.roundness}%` }}></div>
                  </div>

                  <div className="flex justify-between items-center text-sm pt-1">
                    <span className="text-gray-400">Closure</span>
                    <span className="text-blue-300">{analysis.completeness}%</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/50" style={{ width: `${analysis.completeness}%` }}></div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-300 text-xl">Attempts:</span>
                <div className="bg-white/10 px-3 py-1 rounded border border-white/20 text-white text-xl font-mono">{attempts}</div>
              </div>
            </div>
          </div>

          {/* Disclaimer / Instructions */}
          <div className="mt-auto opacity-70">
            <h4 className="text-xl chalk-text mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              Homework Rules
            </h4>
            <p className="text-gray-400 text-sm leading-relaxed">
              Use your mouse (or finger) to draw the most perfect circle you can on the notebook paper. The closer to 100%, the better your grade!
            </p>
          </div>

        </div>
      </div>

      <Dialog open={isPhotocardOpen} onOpenChange={setIsPhotocardOpen}>
        <DialogContent className="sm:max-w-md bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-patrick text-center">Your Report Card</DialogTitle>
            <DialogDescription className="text-center text-zinc-400">
              Here's your official result. Keep it for your records!
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-center p-4">
            {photocardUrl && (
              <img
                src={photocardUrl}
                alt="Circle Report Card"
                className="w-full h-auto rounded shadow-lg border-4 border-zinc-800"
              />
            )}
          </div>

          <DialogFooter className="sm:justify-between gap-4">
            <Button
              variant="outline"
              className="w-full text-black"
              onClick={() => setIsPhotocardOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={downloadPhotocard}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Image
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CircleGame;