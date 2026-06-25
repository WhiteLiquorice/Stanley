import express, { Request, Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { StanleyAutomationAgent } from './automationAgent';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Singleton instance of the Stanley Automation Agent
let agent: StanleyAutomationAgent | null = null;

function getAgent(): StanleyAutomationAgent {
  if (!agent) {
    agent = new StanleyAutomationAgent();
  }
  return agent;
}

// 1. Initialize browser session
app.post('/api/initialize', async (req: Request, res: Response) => {
  const { startUrl } = req.body as { startUrl?: string };
  try {
    const currentAgent = getAgent();
    await currentAgent.initialize(startUrl);
    res.status(200).json({ success: true, message: "Stanley browser instance initialized." });
  } catch (err) {
    const error = err as Error;
    console.error("[Stanley Server] Initialize failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Execute JavaScript invisibly in the page console
app.post('/api/console', async (req: Request, res: Response) => {
  const { jsCode } = req.body as { jsCode?: string };
  if (!jsCode) {
    res.status(400).json({ success: false, error: "Missing jsCode parameter." });
    return;
  }

  try {
    const currentAgent = getAgent();
    const result = await currentAgent.executeInvisibleConsoleCommand(jsCode);
    const logs = currentAgent.getConsoleLogs();
    res.status(200).json({ ...result, logs });
  } catch (err) {
    const error = err as Error;
    console.error("[Stanley Server] Command execution failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Fetch buffered console logs
app.get('/api/logs', (req: Request, res: Response) => {
  try {
    const logs = getAgent().getConsoleLogs();
    res.status(200).json({ success: true, logs });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Clear console logs buffer
app.post('/api/logs/clear', (req: Request, res: Response) => {
  try {
    getAgent().clearConsoleLogs();
    res.status(200).json({ success: true, message: "Console logs cleared." });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. Retrieve base64 screenshot of active viewport
app.get('/api/screenshot', async (req: Request, res: Response) => {
  try {
    const currentAgent = getAgent();
    const screenshot = await currentAgent.captureViewportBase64();
    res.status(200).json({ success: true, screenshot: `data:image/png;base64,${screenshot}` });
  } catch (err) {
    const error = err as Error;
    console.error("[Stanley Server] Screenshot retrieval failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. Run one step of LLM reasoning & auto-execution
app.post('/api/step', async (req: Request, res: Response) => {
  const { goal } = req.body as { goal?: string };
  if (!goal) {
    res.status(400).json({ success: false, error: "Missing goal parameter." });
    return;
  }

  try {
    const currentAgent = getAgent();
    // Step 1: Query Gemini Vision to determine the next action
    console.log(`[Stanley Server] Thinking next step for goal: "${goal}"`);
    const action = await currentAgent.determineNextAction(goal);

    console.log(`[Stanley Server] Action selected: ${action.actionType} | Payload: ${action.payload}`);

    // Step 2: Auto-execute the action if requested
    let executionResult: unknown = null;
    let executionError: string | undefined;

    if (action.actionType === 'execute_js') {
      const exec = await currentAgent.executeInvisibleConsoleCommand(action.payload);
      executionResult = exec.result;
      executionError = exec.error;
    } else if (action.actionType === 'navigate') {
      await currentAgent.navigate(action.payload);
    } else if (action.actionType === 'wait') {
      const waitMs = parseInt(action.payload, 10) || 2000;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    const logs = currentAgent.getConsoleLogs();
    const nextScreenshot = await currentAgent.captureViewportBase64();

    res.status(200).json({
      success: true,
      thought: action.thought,
      actionType: action.actionType,
      payload: action.payload,
      executionResult,
      executionError,
      logs,
      screenshot: `data:image/png;base64,${nextScreenshot}`
    });
  } catch (err) {
    const error = err as Error;
    console.error("[Stanley Server] Step execution failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. Cleanup session
app.post('/api/cleanup', async (req: Request, res: Response) => {
  try {
    if (agent) {
      await agent.cleanup();
      agent = null;
    }
    res.status(200).json({ success: true, message: "Stanley browser process closed." });
  } catch (err) {
    const error = err as Error;
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Stanley Backend] Server is running on http://localhost:${PORT}`);
});
