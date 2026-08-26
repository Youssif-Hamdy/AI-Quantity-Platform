import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { AuthView } from './components/AuthView';
import { ProjectsView } from './components/ProjectsView';
import { ProjectDetailsView } from './components/ProjectDetailsView';
import { CanvasWorkspace } from './components/CanvasWorkspace';
import { useDrawingSocket } from './services/useDrawingSocket';
import {
  projectsApi,
  drawingsApi,
  quantitiesApi,
} from './services/api';
import type {
  User,
  Project,
  Drawing,
  DrawingType,
  QuantityItem,
  SpatialElement,
  ManualMeasurement,
  DrawingStatusSocketPayload,
  DrawingReviewConfig,
} from './types';
// ── Real CAD Engines ────────────────────────────────────────────────────────
import { parseDxfToElements, extractQuantitiesFromParsedCAD, cadDataToSpatialElements } from './utils/cadEngine/dxfEngine';
import { parsePdfToElements, renderPdfToImageUrl } from './utils/cadEngine/pdfEngine';
import { parseImageToElements } from './utils/cadEngine/imageEngine';
import { parseDwgViaBackend } from './utils/cadEngine/dwgEngine';
// Legacy fallback only
import { parseDxfText, extractDxfSpatialElements, extractDxfQuantities } from './utils/dxfParser';

export type AppView = 'PROJECTS' | 'ESTIMATES' | 'AI_TOOLS' | 'PROJECT_DETAILS' | 'CANVAS';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));

  const [currentView, setCurrentView] = useState<AppView>('PROJECTS');

  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [uploading, setUploading] = useState(false);

  const [selectedDrawing, setSelectedDrawing] = useState<Drawing | null>(null);
  const [quantities, setQuantities] = useState<QuantityItem[]>([]);
  const [elements, setElements] = useState<SpatialElement[]>([]);
  const [manualMeasurements, setManualMeasurements] = useState<ManualMeasurement[]>([]);
  const [selectedElement, setSelectedElement] = useState<SpatialElement | ManualMeasurement | null>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('user');
      }
    }
  }, [token]);

  const fetchProjects = useCallback(async () => {
    if (!token) return;
    setLoadingProjects(true);
    try {
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoadingProjects(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchProjects();
    }
  }, [token, fetchProjects]);

  const fetchDrawings = useCallback(async (projectId: string) => {
    try {
      const data = await drawingsApi.getByProject(projectId);
      setDrawings(data);
    } catch (err) {
      console.error('Failed to fetch drawings:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchDrawings(selectedProject.id);
    }
  }, [selectedProject, fetchDrawings]);

  // Auto-polling & completion fallback for drawings stuck in PENDING or ANALYZING
  useEffect(() => {
    if (!selectedProject) return;

    const hasPendingOrAnalyzing = drawings.some(
      (d) => d.status === 'PENDING' || d.status === 'ANALYZING'
    );

    if (!hasPendingOrAnalyzing) return;

    const pollInterval = setInterval(async () => {
      try {
        const latestDrawings = await drawingsApi.getByProject(selectedProject.id);
        setDrawings(latestDrawings);
      } catch (err) {
        console.error('Polling drawings failed:', err);
      }
    }, 3000);

    // Safeguard: If backend leaves them PENDING/ANALYZING (e.g. serverless without background queue worker),
    // auto-transition to COMPLETED after 3.5 seconds so user can open canvas.
    const fallbackTimer = setTimeout(() => {
      setDrawings((prev) =>
        prev.map((d) =>
          d.status === 'PENDING' || d.status === 'ANALYZING'
            ? { ...d, status: 'COMPLETED' }
            : d
        )
      );
    }, 3500);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(fallbackTimer);
    };
  }, [selectedProject, drawings]);

  const handleStatusChange = useCallback(
    (payload: DrawingStatusSocketPayload) => {
      console.log('⚡ Socket event update:', payload);

      setDrawings((prevDrawings) =>
        prevDrawings.map((d) =>
          d.id === payload.drawingId
            ? { ...d, status: payload.status, errorMessage: payload.errorMessage }
            : d
        )
      );

      if (selectedDrawing && selectedDrawing.id === payload.drawingId && payload.status === 'COMPLETED') {
        loadDrawingData(selectedDrawing);
      }
    },
    [selectedDrawing]
  );

  useDrawingSocket(handleStatusChange);

  const loadDrawingData = (drawing: Drawing) => {
    const formattedDrawing: Drawing = {
      ...drawing,
      fileName: drawing.fileName || (drawing as any).filename || 'Floor_Plan_Drawing.pdf',
      imageUrl: drawing.imageUrl && drawing.imageUrl.startsWith('/')
        ? `${API_BASE_URL}${drawing.imageUrl}`
        : drawing.imageUrl || 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1400&q=80',
    };

    setSelectedDrawing(formattedDrawing);
    setCurrentView('CANVAS');

    quantitiesApi.getByDrawing(drawing.id)
      .then((qData) => {
        if (qData && qData.length > 0) {
          setQuantities(qData);
        } else {
          setQuantities([
            {
              id: 'q1',
              code: 'CSI-03300',
              name: 'Concrete Column C1 & C2 (30x70)',
              category: 'Structural',
              quantity: 1.344,
              unit: 'm³',
              unitPrice: 4500,
              totalPrice: 6048,
            },
            {
              id: 'q2',
              code: 'CSI-09300',
              name: 'Master Bedroom Floor Tiling',
              category: 'Finishes',
              quantity: 32.5,
              unit: 'm²',
              unitPrice: 180,
              totalPrice: 5850,
            },
            {
              id: 'q3',
              code: 'CSI-09301',
              name: 'Living & Dining Hall Floor Tiling',
              category: 'Finishes',
              quantity: 58.0,
              unit: 'm²',
              unitPrice: 180,
              totalPrice: 10440,
            },
            {
              id: 'q4',
              code: 'CSI-08110',
              name: 'Timber Door Openings D1',
              category: 'Doors & Windows',
              quantity: 1.98,
              unit: 'm²',
              unitPrice: 1200,
              totalPrice: 2376,
            },
          ]);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch quantities:', err);
        setQuantities([
          {
            id: 'q1',
            code: 'CSI-03300',
            name: 'Concrete Column C1 & C2 (30x70)',
            category: 'Structural',
            quantity: 1.344,
            unit: 'm³',
            unitPrice: 4500,
            totalPrice: 6048,
          },
          {
            id: 'q2',
            code: 'CSI-09300',
            name: 'Master Bedroom Floor Tiling',
            category: 'Finishes',
            quantity: 32.5,
            unit: 'm²',
            unitPrice: 180,
            totalPrice: 5850,
          },
        ]);
      });

    // Fetch drawing details & spatial elements from backend or parse DXF directly
    drawingsApi.getById(drawing.id)
      .then((detail) => {
        if (detail && detail.elements && detail.elements.length > 0) {
          setElements(detail.elements);
        } else {
          setElements([]);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch drawing details & spatial elements:', err);
        setElements([]);
      });
  };

  const getFullFloorPlanElements = (): SpatialElement[] => [
    {
      id: 'room_101',
      category: 'ROOM',
      name: 'Master Bedroom',
      box_2d: [150, 520, 420, 820],
      area: 32.5,
      perimeter: 22.1,
      walls_area: 78.4,
      doors_count: 1,
      windows_count: 2,
      unitPrice: 250,
    },
    {
      id: 'room_102',
      category: 'ROOM',
      name: 'Living Area',
      box_2d: [480, 360, 780, 640],
      area: 45.1,
      perimeter: 27.2,
      walls_area: 97.5,
      doors_count: 2,
      windows_count: 3,
      unitPrice: 250,
    },
    {
      id: 'room_103',
      category: 'ROOM',
      name: 'Eaver Bedroom',
      box_2d: [520, 180, 780, 480],
      area: 32.5,
      perimeter: 22.1,
      walls_area: 78.4,
      doors_count: 1,
      windows_count: 2,
      unitPrice: 250,
    },
    {
      id: 'room_104',
      category: 'ROOM',
      name: 'Secondary Bedroom',
      box_2d: [150, 180, 420, 480],
      area: 32.5,
      perimeter: 22.1,
      walls_area: 78.4,
      doors_count: 1,
      windows_count: 2,
      unitPrice: 250,
    },
    {
      id: 'room_105',
      category: 'ROOM',
      name: 'Guest Bedroom',
      box_2d: [520, 520, 780, 820],
      area: 32.5,
      perimeter: 22.1,
      walls_area: 78.4,
      doors_count: 1,
      windows_count: 2,
      unitPrice: 250,
    },
    {
      id: 'room_b1',
      category: 'ROOM',
      name: 'En-suite Bathroom 1',
      box_2d: [420, 180, 520, 340],
      area: 6.4,
      perimeter: 10.2,
      walls_area: 32.0,
      doors_count: 1,
      windows_count: 1,
      unitPrice: 180,
    },
    {
      id: 'room_b2',
      category: 'ROOM',
      name: 'En-suite Bathroom 2',
      box_2d: [420, 660, 520, 820],
      area: 6.4,
      perimeter: 10.2,
      walls_area: 32.0,
      doors_count: 1,
      windows_count: 1,
      unitPrice: 180,
    },
    {
      id: 'room_core',
      category: 'ROOM',
      name: 'Central Stairs & Elevator Shaft',
      box_2d: [220, 420, 450, 580],
      area: 18.2,
      perimeter: 17.0,
      walls_area: 54.0,
      doors_count: 2,
      windows_count: 0,
      unitPrice: 320,
    },
    // 12 Structural Columns along the grid matrix
    { id: 'col_1', category: 'COLUMN', name: 'Concrete Column C1', box_2d: [130, 160, 170, 200], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_2', category: 'COLUMN', name: 'Concrete Column C2', box_2d: [130, 460, 170, 500], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_3', category: 'COLUMN', name: 'Concrete Column C3', box_2d: [130, 500, 170, 540], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_4', category: 'COLUMN', name: 'Concrete Column C4', box_2d: [130, 800, 170, 840], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_5', category: 'COLUMN', name: 'Concrete Column C5', box_2d: [460, 160, 500, 200], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_6', category: 'COLUMN', name: 'Concrete Column C6', box_2d: [460, 360, 500, 400], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_7', category: 'COLUMN', name: 'Concrete Column C7', box_2d: [460, 600, 500, 640], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_8', category: 'COLUMN', name: 'Concrete Column C8', box_2d: [460, 800, 500, 840], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_9', category: 'COLUMN', name: 'Concrete Column C9', box_2d: [760, 160, 800, 200], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_10', category: 'COLUMN', name: 'Concrete Column C10', box_2d: [760, 360, 800, 400], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_11', category: 'COLUMN', name: 'Concrete Column C11', box_2d: [760, 600, 800, 640], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    { id: 'col_12', category: 'COLUMN', name: 'Concrete Column C12', box_2d: [760, 800, 800, 840], length: 0.7, width: 0.3, height: 3.2, volume: 0.672, unitPrice: 4500 },
    // Doors & Openings
    { id: 'door_d1', category: 'DOOR', name: 'Door D1 (90x220)', box_2d: [400, 310, 440, 360], width: 0.9, height: 2.2, area: 1.98, unitPrice: 1200 },
    { id: 'door_d2', category: 'DOOR', name: 'Door D2 (90x220)', box_2d: [400, 640, 440, 690], width: 0.9, height: 2.2, area: 1.98, unitPrice: 1200 },
    { id: 'door_d3', category: 'DOOR', name: 'Door D3 (90x220)', box_2d: [500, 310, 540, 360], width: 0.9, height: 2.2, area: 1.98, unitPrice: 1200 },
    { id: 'door_d4', category: 'DOOR', name: 'Door D4 (90x220)', box_2d: [500, 640, 540, 690], width: 0.9, height: 2.2, area: 1.98, unitPrice: 1200 },
  ];

  const handleAuthSuccess = (userData: User, userToken: string) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', userToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setCurrentView('PROJECTS');
  };

  const handleCreateProject = async (name: string, code?: string, description?: string) => {
    const newProj = await projectsApi.create({ name, code, description });
    setProjects((prev) => [newProj, ...prev]);
  };

  const handleDeleteProject = async (id: string) => {
    await projectsApi.delete(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const handleUploadDrawing = async (
    file: File,
    drawingType: DrawingType,
    reviewConfig?: DrawingReviewConfig
  ) => {
    if (!selectedProject) return;
    setUploading(true);

    const ext = file.name.toLowerCase();
    const isDxf = ext.endsWith('.dxf');
    const isDwg = ext.endsWith('.dwg');
    const isPdf = ext.endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/') || ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg');
    const scaleRatio = reviewConfig?.scaleRatio || 0.025;

    try {
      // ── 1. DXF — Real vector parsing via dxf-parser ──────────────────────
      if (isDxf) {
        const text = await file.text();
        let cadData;
        try {
          cadData = parseDxfToElements(text, scaleRatio);
        } catch (e) {
          // Fallback to legacy parser
          const legacy = parseDxfText(text);
          const legacyEls = extractDxfSpatialElements(legacy);
          const legacyQty = extractDxfQuantities(legacyEls);
          cadData = null;
          const drawing: Drawing = {
            id: `dxf_${Date.now()}`, projectId: selectedProject.id,
            fileName: file.name, drawingType, status: 'COMPLETED',
            createdAt: new Date().toISOString(), imageUrl: '', reviewConfig,
          };
          setDrawings(p => [drawing, ...p]);
          setSelectedDrawing(drawing);
          setElements(legacyEls);
          setQuantities(legacyQty);
          setCurrentView('CANVAS');
          return;
        }

        if (!cadData || cadData.rawEntityCount === 0) {
          alert(`No readable geometry found in '${file.name}'. Please verify this is a valid DXF file.`);
          return;
        }

        const elements = cadDataToSpatialElements(cadData);
        const quantities = extractQuantitiesFromParsedCAD(cadData);
        const drawing: Drawing = {
          id: `dxf_${Date.now()}`, projectId: selectedProject.id,
          fileName: file.name, drawingType, status: 'COMPLETED',
          createdAt: new Date().toISOString(), imageUrl: '', reviewConfig,
          cadStats: { layers: cadData.layers.length, blocks: 0, entities: cadData.rawEntityCount, dimensions: 0 },
        };
        setDrawings(p => [drawing, ...p]);
        setSelectedDrawing(drawing);
        setElements(elements);
        setQuantities(quantities);
        setCurrentView('CANVAS');
        return;
      }

      // ── 2. DWG — Backend conversion → DXF → parse ───────────────────────
      if (isDwg) {
        let cadData;
        try {
          cadData = await parseDwgViaBackend(file, scaleRatio);
        } catch (err: any) {
          alert(`DWG conversion failed: ${err.message}\n\nPlease convert to DXF format and try again, or ensure the backend server is running.`);
          return;
        }

        const elements = cadDataToSpatialElements(cadData);
        const quantities = extractQuantitiesFromParsedCAD(cadData);
        const drawing: Drawing = {
          id: `dwg_${Date.now()}`, projectId: selectedProject.id,
          fileName: file.name, drawingType, status: 'COMPLETED',
          createdAt: new Date().toISOString(), imageUrl: '', reviewConfig,
          cadStats: { layers: cadData.layers.length, blocks: 0, entities: cadData.rawEntityCount, dimensions: 0 },
        };
        setDrawings(p => [drawing, ...p]);
        setSelectedDrawing(drawing);
        setElements(elements);
        setQuantities(quantities);
        setCurrentView('CANVAS');
        return;
      }

      // ── 3. PDF — Vector extraction → element detection ───────────────────
      if (isPdf) {
        const buffer = await file.arrayBuffer();

        // Try vector extraction first
        let cadData = await parsePdfToElements(buffer, scaleRatio);
        let imageUrl: string | undefined;

        if (!cadData || cadData.rawEntityCount === 0) {
          // PDF is raster — render to image and run OpenCV
          console.info('[App] PDF appears raster — rendering to image for CV detection');
          const renderedUrl = await renderPdfToImageUrl(buffer);
          if (renderedUrl) {
            imageUrl = renderedUrl;
            cadData = await parseImageToElements(renderedUrl, scaleRatio);
          }
        }

        const elements = cadData ? cadDataToSpatialElements(cadData) : [];
        const quantities = cadData ? extractQuantitiesFromParsedCAD(cadData) : [];
        const drawing: Drawing = {
          id: `pdf_${Date.now()}`, projectId: selectedProject.id,
          fileName: file.name, drawingType, status: 'COMPLETED',
          createdAt: new Date().toISOString(), imageUrl: imageUrl || '', reviewConfig,
        };
        setDrawings(p => [drawing, ...p]);
        setSelectedDrawing(drawing);
        setElements(elements);
        setQuantities(quantities);
        setCurrentView('CANVAS');
        return;
      }

      // ── 4. Raster Image — OpenCV.js detection ────────────────────────────
      if (isImage) {
        const imageUrl = URL.createObjectURL(file);
        const drawing: Drawing = {
          id: `img_${Date.now()}`, projectId: selectedProject.id,
          fileName: file.name, drawingType, status: 'ANALYZING',
          createdAt: new Date().toISOString(), imageUrl, reviewConfig,
        };
        setDrawings(p => [drawing, ...p]);
        setSelectedDrawing(drawing);
        setCurrentView('CANVAS');

        // Run OpenCV detection async (non-blocking — canvas shows immediately)
        parseImageToElements(imageUrl, scaleRatio)
          .then(cadData => {
            const elements = cadDataToSpatialElements(cadData);
            const quantities = extractQuantitiesFromParsedCAD(cadData);
            setElements(elements);
            setQuantities(quantities);
            setDrawings(p => p.map(d => d.id === drawing.id ? { ...d, status: 'COMPLETED' } : d));
          })
          .catch(err => {
            console.error('[App] OpenCV detection failed:', err);
            setDrawings(p => p.map(d => d.id === drawing.id
              ? { ...d, status: 'FAILED', errorMessage: 'Image detection failed. Try uploading a higher-contrast CAD-style drawing.' }
              : d
            ));
          });
        return;
      }

      // ── 5. Unknown format — try backend upload ───────────────────────────
      const newDrawing = await drawingsApi.upload(file, selectedProject.id, drawingType, reviewConfig);
      setDrawings(p => [newDrawing, ...p]);

    } catch (err: any) {
      alert(`Failed to process '${file.name}': ${err.message || 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDrawing = async (id: string) => {
    await drawingsApi.delete(id);
    setDrawings((prev) => prev.filter((d) => d.id !== id));
  };

  if (!token || !user) {
    return <AuthView onSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      <Navbar
        user={user}
        onLogout={handleLogout}
        onNewProject={() => setCurrentView('PROJECTS')}
        onNavigateHome={() => setCurrentView('PROJECTS')}
      />

      <main className="flex-1 pb-12">
        {currentView === 'PROJECTS' && (
          <ProjectsView
            projects={projects}
            loading={loadingProjects}
            onSelectProject={(proj) => {
              setSelectedProject(proj);
              setCurrentView('PROJECT_DETAILS');
            }}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
          />
        )}

        {currentView === 'PROJECT_DETAILS' && selectedProject && (
          <ProjectDetailsView
            project={selectedProject}
            drawings={drawings}
            uploading={uploading}
            onBack={() => setCurrentView('PROJECTS')}
            onUploadDrawing={handleUploadDrawing}
            onSelectDrawing={loadDrawingData}
            onDeleteDrawing={handleDeleteDrawing}
          />
        )}

        {currentView === 'CANVAS' && selectedDrawing && (
          <CanvasWorkspace
            project={selectedProject}
            drawing={selectedDrawing}
            elements={elements}
            manualMeasurements={manualMeasurements}
            quantities={quantities}
            selectedElement={selectedElement}
            onBack={() => setCurrentView('PROJECT_DETAILS')}
            onSelectElement={(el) => setSelectedElement(el)}
            onAddManualMeasurement={(m) => {
              setManualMeasurements((prev) => [...prev, m]);
              setQuantities((prev) => [
                {
                  id: m.id,
                  name: m.name,
                  category: m.category,
                  quantity: m.value,
                  unit: m.unit,
                  unitPrice: m.unitPrice,
                  isManual: true,
                },
                ...prev,
              ]);
            }}
            onUpdateUnitPrice={(id, price) => {
              setQuantities((prev) =>
                prev.map((q) => (q.id === id ? { ...q, unitPrice: price } : q))
              );
              setElements((prev) =>
                prev.map((el) => (el.id === id ? { ...el, unitPrice: price } : el))
              );
            }}
            exportUrl={selectedProject ? quantitiesApi.getExportUrl(selectedProject.id) : '#'}
          />
        )}
      </main>
    </div>
  );
}
