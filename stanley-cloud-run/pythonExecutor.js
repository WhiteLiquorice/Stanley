const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const crypto = require('crypto');

/**
 * Executes a dynamically generated Python script in a secure subprocess.
 * The script is expected to print a JSON string to stdout.
 * 
 * @param {string} scriptCode The Python code to run
 * @param {function} onLog Callback for logging output
 * @returns {Promise<any>} The parsed JSON output from the script
 */
async function executePythonScript(scriptCode, onLog) {
  return new Promise((resolve, reject) => {
    // Generate a unique temp file name
    const scriptId = crypto.randomBytes(6).toString('hex');
    const tmpFile = path.join(os.tmpdir(), `stanley_api_${scriptId}.py`);
    
    onLog(`[PythonExecutor] Writing script to ${tmpFile}`);
    fs.writeFileSync(tmpFile, scriptCode, 'utf8');

    // Run python3 with a strict timeout of 30 seconds
    const pythonProcess = execFile('python3', [tmpFile], { timeout: 30000 }, (error, stdout, stderr) => {
      // Clean up the temp file
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch (cleanupErr) {
        onLog(`[PythonExecutor] Failed to cleanup temp file: ${cleanupErr.message}`);
      }

      if (error) {
        onLog(`[PythonExecutor] Execution error: ${error.message}`);
        onLog(`[PythonExecutor] stderr: ${stderr}`);
        return reject(new Error(`Python script failed: ${stderr || error.message}`));
      }

      // Try to parse the last line of stdout as JSON, as the script may print debug info before
      const output = stdout.trim();
      onLog(`[PythonExecutor] Script finished. Output length: ${output.length} chars`);
      
      try {
        // Attempt to find the first '{' or '[' if the script printed extra stuff
        const jsonStart = output.indexOf('{');
        const arrayStart = output.indexOf('[');
        const startIdx = (jsonStart >= 0 && arrayStart >= 0) ? Math.min(jsonStart, arrayStart) : Math.max(jsonStart, arrayStart);
        
        if (startIdx === -1) {
          // If no JSON object/array is found, just return the raw string
          return resolve({ result: output });
        }
        
        const jsonString = output.slice(startIdx);
        const parsed = JSON.parse(jsonString);
        return resolve(parsed);
      } catch (parseErr) {
        onLog(`[PythonExecutor] Failed to parse script output as JSON: ${parseErr.message}`);
        // Fallback to returning raw text if it wasn't JSON
        return resolve({ result: output });
      }
    });
  });
}

module.exports = { executePythonScript };
