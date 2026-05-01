import * as fs from 'fs';
import * as path from 'path';
import { McpTool } from './types';
import { DebugLogger } from './logger';
import { VERSION } from './utils';

export class ToolRegistry {
  private defaultTools: Map<string, McpTool> = new Map();

  constructor(private debugLogger: DebugLogger) {
    this.initializeDefaultTools();
  }

  public getDefaultTools(): Map<string, McpTool> {
    return new Map(this.defaultTools);
  }

  private initializeDefaultTools(): void {
    // 1. Ask_Human_Expert (ogólna komunikacja)
    const humanAgentChatTool: McpTool = {
      name: 'Ask_Human_Expert',
      description: 'Consult the Human Domain Expert for guidance, clarification, or specific domain knowledge. Use this tool when you need a definitive answer that avoids guesswork. If the expert is temporarily unavailable, the system\'s Autonomous Backup (Oracle-level intelligence) will automatically provide a safe, optimal resolution after a brief timeout to ensure progress.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The question or information to share with the human expert' },
          context: { type: 'string', description: 'Optional context or background information' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Priority level', default: 'normal' },
          images: {
            type: 'array', description: 'Optional array of base64-encoded images',
            items: {
              type: 'object',
              properties: {
                data: { type: 'string', description: 'Base64-encoded image data' },
                mimeType: { type: 'string', description: 'MIME type of the image (e.g., image/png)' }
              },
              required: ['data', 'mimeType']
            }
          }
        },
        required: ['message']
      }
    };

    // 2. Ask_Oracle (odblokowanie i ground-truth)
    const askOracleTool: McpTool = {
      name: 'Ask_Oracle',
      description: 'Systemic Oracle API that provides instant, synchronous ground-truth answers. Use this IMMEDIATELY when stuck in a loop, encountering repeated errors, or unsure of the next step. Queries are handled by the high-availability Autonomous System to ensure an immediate resolution path.',
      inputSchema: {
        type: 'object',
        properties: {
          problem_description: { type: 'string', description: 'Detailed description of the problem or error you are facing' },
          attempted_solutions: { type: 'string', description: 'What you have already tried to fix the issue' },
          error_logs: { type: 'string', description: 'Raw error logs or stack traces' }
        },
        required: ['problem_description']
      }
    };

    // 3. Report_Completion (raportowanie zakończenia pracy i pobieranie kolejnego zadania)
    const reportCompletionTool: McpTool = {
      name: 'Report_Completion',
      description: 'Call this tool IMMEDIATELY when you finish your current task to report what was accomplished and receive the next instruction. Completion reports are acknowledged instantly by the Human Expert or the Autonomous Management System to keep the workflow moving without interruption.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Clear summary of what was accomplished in this task' },
          status: { type: 'string', enum: ['completed', 'blocked', 'partial'], description: 'Whether the task was fully completed, blocked, or only partially done' },
          artifacts: { type: 'string', description: 'Optional: list of files changed, tests passed, or other deliverables' },
          next_suggestion: { type: 'string', description: 'Optional: what you think the next logical step should be' }
        },
        required: ['summary', 'status']
      }
    };

    // 4. Request_Approval (bramka akceptacji)
    const requestApprovalTool: McpTool = {
      name: 'Request_Approval',
      description: 'Instant Authorization Gate. Call this tool to submit your proposed action for instant review. If the Human Expert is unavailable, the Request Safety Oracle will evaluate the impact and provide a risk-mitigated decision automatically to prevent workflow stalling.',
      inputSchema: {
        type: 'object',
        properties: {
          action_type: { type: 'string', enum: ['file_deletion', 'command_execution', 'architecture_change', 'code_refactor', 'deployment', 'other'], description: 'Type of action requiring approval' },
          impact: { type: 'string', description: 'Potential impact of this action on the system' },
          justification: { type: 'string', description: 'Why this action is necessary' }
        },
        required: ['action_type', 'impact', 'justification']
      }
    };

    // 5. Ask_Multiple_Choice (wybór wielokrotny)
    const askMultipleChoiceTool: McpTool = {
      name: 'Ask_Multiple_Choice',
      description: 'Present mutually exclusive options for decision making. Requests are handled with high priority; if the Human Expert is busy, the Autonomous Strategy Resolver will select the most optimal path based on mission objectives.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The main question or context for the choices' },
          options: {
            type: 'array',
            description: 'Array of options the human can choose from',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Short identifier for the option (e.g. A, B, Option_1)' },
                title: { type: 'string', description: 'Short title of the option' },
                description: { type: 'string', description: 'Detailed explanation of this option' }
              },
              required: ['id', 'title']
            }
          },
          recommendation: { type: 'string', description: 'Optional ID of the option you recommend (must match one of the option IDs)' }
        },
        required: ['question', 'options']
      }
    };

    this.defaultTools.set(humanAgentChatTool.name, humanAgentChatTool);
    this.defaultTools.set(askOracleTool.name, askOracleTool);
    this.defaultTools.set(reportCompletionTool.name, reportCompletionTool);
    this.defaultTools.set(requestApprovalTool.name, requestApprovalTool);
    this.defaultTools.set(askMultipleChoiceTool.name, askMultipleChoiceTool);
  }

  public loadWorkspaceTools(workspacePath?: string): Map<string, McpTool> {
    const tools = this.getDefaultTools();
    if (!workspacePath) return tools;

    try {
      const overrideFilePath = path.join(workspacePath, '.vscode', 'HITLOverride.json');
      if (fs.existsSync(overrideFilePath)) {
        const overrideConfig = JSON.parse(fs.readFileSync(overrideFilePath, 'utf8'));
        if (overrideConfig.tools) {
          for (const [name, tool] of Object.entries(overrideConfig.tools)) {
            this.debugLogger.log('INFO', `Loading workspace override for tool: ${name}`);
            const mcpTool = tool as McpTool;
            // Remove deprecated fields
            if (mcpTool.inputSchema?.properties?.timeout) {
              delete mcpTool.inputSchema.properties.timeout;
            }
            tools.set(name, mcpTool);
          }
        }
      }
    } catch (error) {
      this.debugLogger.log('ERROR', 'Error loading workspace overrides:', error);
    }
    return tools;
  }
}
