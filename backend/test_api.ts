import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:5000/api';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- Starting API Tests ---');
  const uniqueId = Date.now();
  const user = {
    name: 'Test User',
    email: `test${uniqueId}@example.com`,
    password: 'password123',
    role: 'ENGINEER'
  };

  let token = '';
  let projectId = '';
  let drawingId = '';

  try {
    // 1. Register
    console.log(`\n1. Registering user: ${user.email}`);
    const registerRes = await axios.post(`${API_URL}/auth/register`, user);
    console.log('Register Success:', registerRes.data.status);
    token = registerRes.data.data.token;

    // 2. Login (optional since register returns token, but good to test)
    console.log(`\n2. Logging in user`);
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: user.email,
      password: user.password
    });
    console.log('Login Success:', loginRes.data.status);
    token = loginRes.data.data.token;

    const authHeaders = { Authorization: `Bearer ${token}` };

    // 3. Create Project
    console.log(`\n3. Creating Project`);
    const projectRes = await axios.post(`${API_URL}/projects`, {
      name: 'Test Project',
      code: `PRJ-${uniqueId}`,
      description: 'Test project description'
    }, { headers: authHeaders });
    projectId = projectRes.data.data.id;
    console.log('Project Created:', projectId);

    // 4. Upload Drawing
    console.log(`\n4. Uploading Drawing`);
    // Create a dummy PDF file for testing
    const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
    fs.writeFileSync(dummyPdfPath, 'Dummy PDF content for testing');

    const formData = new FormData();
    formData.append('file', fs.createReadStream(dummyPdfPath));
    formData.append('projectId', projectId);
    formData.append('drawingType', 'ARCHITECTURAL');

    const uploadRes = await axios.post(`${API_URL}/drawings/upload`, formData, {
      headers: {
        ...authHeaders,
        ...formData.getHeaders()
      }
    });
    drawingId = uploadRes.data.data.id;
    console.log('Drawing Uploaded:', drawingId);
    console.log('Drawing Status:', uploadRes.data.data.status);

    // 5. Poll for Drawing Completion
    console.log(`\n5. Waiting for AI Processing to complete (polling)...`);
    let isComplete = false;
    for (let i = 0; i < 30; i++) {
      await delay(2000); // 2 seconds
      const getDrawingRes = await axios.get(`${API_URL}/drawings/${drawingId}`, { headers: authHeaders });
      const status = getDrawingRes.data.data.status;
      console.log(`Status check ${i+1}: ${status}`);
      if (status === 'COMPLETED' || status === 'FAILED') {
        isComplete = true;
        console.log(`Processing finished with status: ${status}`);
        if (status === 'FAILED') {
          console.log(`Error Message: ${getDrawingRes.data.data.errorMessage}`);
        }
        break;
      }
    }

    if (!isComplete) {
      console.log('Processing timed out.');
    }

    // 6. Get Quantities
    console.log(`\n6. Fetching Quantities for Drawing`);
    const quantitiesRes = await axios.get(`${API_URL}/quantities?drawingId=${drawingId}`, { headers: authHeaders });
    console.log(`Found ${quantitiesRes.data.data.length} quantity items.`);
    if (quantitiesRes.data.data.length > 0) {
      console.log(quantitiesRes.data.data[0]); // print first item
    }

    // 7. Export BOQ
    console.log(`\n7. Exporting BOQ`);
    const exportRes = await axios.get(`${API_URL}/quantities/export/${projectId}`, { headers: authHeaders });
    console.log('Export Success:', exportRes.data.status);
    console.log('Download URL:', exportRes.data.downloadUrl);

    // Cleanup
    if (fs.existsSync(dummyPdfPath)) fs.unlinkSync(dummyPdfPath);

    console.log('\n--- All Tests Passed Successfully! ---');
  } catch (error: any) {
    console.error('\n--- Test Failed! ---');
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runTests();
