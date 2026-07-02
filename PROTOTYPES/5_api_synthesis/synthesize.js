require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

// Ensure you have GEMINI_API_KEY set in your environment
const ai = new GoogleGenAI({});

async function synthesizeAPIBridge() {
  console.log("Analyzing Source and Target Network Requests...");

  // Imagine Stanley intercepted these network requests via Chrome DevTools protocol
  
  const sourceRequestInfo = `
System: Old School Gradebook (Source)
Endpoint: GET https://api.oldschool.edu/v1/teacher/2834/grades
Response Example:
{
  "status": "success",
  "data": [
    { "student_id": "STU-991", "full_name": "John Doe", "current_score": 92.5, "letter": "A" },
    { "student_id": "STU-992", "full_name": "Jane Smith", "current_score": 88.0, "letter": "B+" }
  ]
}
`;

  const targetRequestInfo = `
System: New District Portal (Destination)
Endpoint: POST https://district.newportal.gov/api/grades/sync
Headers required: Authorization: Bearer <TOKEN>, Content-Type: application/json
Expected Payload Schema:
{
  "pupilId": "string (must match STU-XXX)",
  "gradePercentage": "number (0-100)",
  "term": "string (default to 'Fall 2026')"
}
`;

  const prompt = `
You are an expert API Integration Engineer. 
I have intercepted the network requests for a source grading system and a destination grading system.
Your job is to write a standalone, production-ready Python script that acts as an API bridge between them.

Source System Info:
${sourceRequestInfo}

Target System Info:
${targetRequestInfo}

Requirements:
1. Use the 'requests' library in Python.
2. Fetch the grades from the Source System.
3. Transform the data so it matches the Target System's expected payload exactly.
4. Iterate over the transformed data and send a POST request for each student to the Target System.
5. Add basic error handling and logging (print statements are fine).
6. Output ONLY the raw Python code. Do not include markdown code blocks (like \`\`\`python), just the raw text of the script. Do not explain the code.
`;

  try {
    console.log("Asking Gemini to synthesize the Python API Bridge script...");
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    // The output should be pure Python code because of our strict prompt instructions
    const pythonScript = response.text.trim();
    
    // In a real app, Stanley would execute this script headless. For the prototype, we just save it.
    fs.writeFileSync('generated_bridge.py', pythonScript);
    
    console.log("\n--- API Synthesis Complete! ---");
    console.log("Saved the generated integration to 'generated_bridge.py'.");
    console.log("Here is a preview of what Stanley generated:");
    console.log("--------------------------------------------------");
    console.log(pythonScript);
    console.log("--------------------------------------------------");
    
  } catch (err) {
    console.error("Synthesis failed:", err);
  }
}

synthesizeAPIBridge();
