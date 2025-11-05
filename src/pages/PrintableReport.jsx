
import React, { useState, useEffect } from 'react';
import { Project } from '@/entities/Project';
import { Button } from '@/components/ui/button';
import { Printer, Download, Users, Volume2, AlertTriangle } from 'lucide-react';
import PlanViewDrawing from '../components/report/PlanViewDrawing';
import ElevationDrawing from '../components/report/ElevationDrawing';

export default function PrintableReport() {
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProject();
  }, []);

  const loadProject = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const urlParams = new URLSearchParams(window.location.search);
      const projectId = urlParams.get('project');
      
      if (!projectId) {
        setError("No project ID provided in URL");
        setLoading(false);
        return;
      }

      const projectData = await Project.filter({ id: projectId });
      
      if (projectData && projectData.length > 0) {
        setProject(projectData[0]);
      } else {
        setError("Project not found");
      }
    } catch (err) {
      console.error("Error loading project:", err);
      setError("Failed to load project data");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const downloadCSV = (data, filename) => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log("No data to export");
      return;
    }
    
    try {
      const headers = Object.keys(data[0]);
      const csvContent = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => {
            const value = row[header];
            return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value;
          }).join(',')
        )
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error downloading CSV:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading installation report...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Report Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={() => window.history.back()} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Safe data extraction with defaults
  const projectName = project.name || 'Untitled Project';
  const clientName = project.client_name;
  const roomLength = project.room_length || 6;
  const roomWidth = project.room_width || 4;
  const roomHeight = project.room_height || 2.8;
  const selectedSpeakers = project.selected_speakers || [];
  const seatingPositions = project.seating_positions || [];
  const screenSize = project.screen_size || 120;
  const roomOrientation = project.room_orientation || 'length_front';
  const screenWall = project.screen_wall || 'front';
  const screenHeight = project.screen_height_from_floor || 0.5;
  const aspectRatio = project.aspect_ratio || '16:9';
  const dolbyConfig = project.dolby_config;

  return (
    <div className="min-h-screen bg-white text-black relative">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break-before { page-break-before: always; }
          .page-break-inside-avoid { page-break-inside: avoid; }
        }
      `}</style>

      {/* Print Header with Logo */}
      <div className="flex justify-between items-start mb-8 p-6 print:p-4">
        <div>
          <h1 className="text-2xl font-bold font-header text-[#1B1A1A] mb-2">
            Professional Cinema Installation Report
          </h1>
          <p className="text-[#3E4349] font-body">
            {project.name} - {project.client_name}
          </p>
        </div>
        <div className="flex-shrink-0">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/0150b9da7_Artcousticlogo_grey.png"
            alt="Artcoustic"
            className="w-[120px] h-auto opacity-60"
            style={{ filter: 'grayscale(60%)' }}
          />
        </div>
      </div>

      {/* Header - No Print */}
      <div className="no-print p-6 border-b bg-gray-50">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Installation Report</h1>
            <p className="text-gray-600">{projectName}</p>
          </div>
          <div className="flex gap-2">
            {seatingPositions.length > 0 && (
              <Button 
                onClick={() => downloadCSV(seatingPositions, `${projectName}_seating_positions.csv`)} 
                variant="outline"
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Seating CSV
              </Button>
            )}
            {selectedSpeakers.length > 0 && (
              <Button 
                onClick={() => downloadCSV(selectedSpeakers, `${projectName}_speaker_positions.csv`)} 
                variant="outline"
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Speaker CSV
              </Button>
            )}
            <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              <Printer className="w-4 h-4 mr-2" />
              Print Report
            </Button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pb-6 border-b-2 border-gray-200">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{projectName}</h1>
          {clientName && (
            <h2 className="text-xl text-gray-600 mb-2">Client: {clientName}</h2>
          )}
          <div className="text-sm text-gray-500">
            <p>Generated: {new Date().toLocaleDateString()}</p>
            <p>Room: {roomLength}m × {roomWidth}m × {roomHeight}m</p>
            {dolbyConfig && <p>Audio: Dolby {dolbyConfig}</p>}
          </div>
        </div>

        {/* Plan View */}
        <section className="mb-12 page-break-inside-avoid">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-900">Plan View</h2>
          <div className="flex justify-center">
            <PlanViewDrawing
              roomDimensions={{ length: roomLength, width: roomWidth, height: roomHeight }}
              seatingPositions={seatingPositions}
              placedSpeakers={selectedSpeakers}
              screenSize={screenSize}
              screenWall={screenWall}
              roomOrientation={roomOrientation}
            />
          </div>
        </section>

        {/* Wall Elevations */}
        <section className="mb-12 page-break-before">
          <h2 className="text-2xl font-bold text-center mb-8 text-gray-900">Wall Elevations</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {['front', 'back', 'left', 'right'].map(wall => (
              <div key={wall} className="page-break-inside-avoid">
                <ElevationDrawing
                  wall={wall}
                  roomDimensions={{ length: roomLength, width: roomWidth, height: roomHeight }}
                  placedSpeakers={selectedSpeakers}
                  screenSize={screenSize}
                  screenWall={screenWall}
                  roomOrientation={roomOrientation}
                  screenHeight={screenHeight}
                  aspectRatio={aspectRatio}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Data Tables */}
        <section className="mb-12 page-break-before">
          <h2 className="text-2xl font-bold mb-6 text-gray-900">Installation Data</h2>
          
          {/* Speaker Positions */}
          {selectedSpeakers.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4 flex items-center text-gray-800">
                <Volume2 className="w-5 h-5 mr-2" />
                Speaker Positions
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-3 text-left font-semibold">Position</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">X (m)</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">Y (m)</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">Z (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSpeakers.map((speaker, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="border border-gray-300 p-3 capitalize">
                          {(speaker.position || 'Unknown').replace(/_/g, ' ')}
                        </td>
                        <td className="border border-gray-300 p-3 text-center">
                          {(speaker.x || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 p-3 text-center">
                          {(speaker.y || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 p-3 text-center">
                          {(speaker.z || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Seating Positions */}
          {seatingPositions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4 flex items-center text-gray-800">
                <Users className="w-5 h-5 mr-2" />
                Seating Positions
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-300 p-3 text-left font-semibold">Name</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">X (m)</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">Y (m)</th>
                      <th className="border border-gray-300 p-3 text-center font-semibold">Z (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seatingPositions.map((seat, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                        <td className="border border-gray-300 p-3">
                          {seat.name || `Seat ${index + 1}`}
                        </td>
                        <td className="border border-gray-300 p-3 text-center">
                          {(seat.x || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 p-3 text-center">
                          {(seat.y || 0).toFixed(2)}
                        </td>
                        <td className="border border-gray-300 p-3 text-center">
                          {(seat.z || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-gray-500 border-t pt-4">
          <p>Generated by Artcoustic Cinema Designer - Professional Cinema Design Tool</p>
        </footer>
      </div>
    </div>
  );
}
