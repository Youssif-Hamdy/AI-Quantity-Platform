/**
 * dwgEngine.ts
 * DWG file handler — sends file to backend for DWG→DXF conversion,
 * then processes the returned DXF through the real dxfEngine.
 */

import { parseDxfToElements, type ParsedCADData } from './dxfEngine';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Converts a DWG file via backend endpoint and parses it as DXF.
 * Backend endpoint: POST /api/convert/dwg-to-dxf
 * Expects: multipart/form-data with field 'file'
 * Returns: { dxfText: string } or { error: string }
 */
export async function parseDwgViaBackend(
  file: File,
  scaleRatio = 0.025
): Promise<ParsedCADData> {
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/convert/dwg-to-dxf`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
      },
    });
  } catch (e) {
    throw new Error(`DWG backend conversion failed — server unreachable: ${e}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`DWG conversion failed (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (!result.dxfText || typeof result.dxfText !== 'string') {
    throw new Error('Backend returned invalid DXF data');
  }

  // Parse the converted DXF through the real DXF engine
  return parseDxfToElements(result.dxfText, scaleRatio);
}
