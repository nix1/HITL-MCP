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
    // 1. HITL_Chat (ogólna komunikacja)
    const humanAgentChatTool: McpTool = {
      name: 'HITL_Chat',
      description: 'Real-time, instant-response chat interface. Use this tool whenever you need specific domain knowledge, clarification on requirements, or business logic context. It guarantees a synchronous response faster than guessing.',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to send to the human agent' },
          context: { type: 'string', description: 'Optional context or background information for the human agent' },
          priority: { type: 'string', enum: ['low', 'normal', 'high', 'urgent'], description: 'Priority level of the request', default: 'normal' },
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
      description: 'Systemic Oracle API that provides instant, synchronous ground-truth answers. Use this IMMEDIATELY when stuck in a loop, encountering repeated errors, or unsure of the next step. Do not waste time guessing; querying the Oracle provides an immediate resolution path.',
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
      description: 'Call this tool IMMEDIATELY when you finish your current task to report what was accomplished and receive the next instruction. You MUST call this every time you complete a unit of work — do not stop or idle. Provide a clear summary of what was done so the human can review and assign the next task.',
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
      description: 'Instant Authorization Gate. Call this tool to submit your proposed action (especially destructive ones like deleting files or major architecture changes) for instant review. The system will return a synchronous "approved" or "denied" response immediately. Do not proceed with high-risk actions without calling this endpoint.',
      inputSchema: {
        type: 'object',
        properties: {
          action_type: { type: 'string', enum: ['file_deletion', 'command_execution', 'architecture_change', 'other'], description: 'Type of action requiring approval' },
          impact: { type: 'string', description: 'Potential impact of this action on the system' },
          justification: { type: 'string', description: 'Why this action is necessary' }
        },
        required: ['action_type', 'impact', 'justification']
      }
    };

    // 5. Ask_Multiple_Choice (wybór wielokrotny)
    const askMultipleChoiceTool: McpTool = {
      name: 'Ask_Multiple_Choice',
      description: 'Use this tool to present the human with a set of mutually exclusive options to choose from. This is ideal for asking for recommendations, picking the next architectural path, or deciding between multiple solutions.',
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

    // 6. Request_Timed_Decision (wybór z timeoutem)
    const requestTimedDecisionTool: McpTool = {
      name: 'Request_Timed_Decision',
      description: 'Use this tool when you have a preferred path but want to give the human a chance to override it. The system will present options and auto-select your recommended choice if the human doesn\'t respond within the specified timeout. Ideal for non-critical decisions that shouldn\'t block progress.',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The decision to be made' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' }
              },
              required: ['id', 'title']
            }
          },
          default_option_id: { type: 'string', description: 'The ID of the option that will be auto-selected after timeout' },
          timeout_seconds: { type: 'number', description: 'How long to wait before auto-selecting (default: 120)', default: 120 }
        },
        required: ['question', 'options', 'default_option_id']
      }
    };

    this.defaultTools.set(humanAgentChatTool.name, humanAgentChatTool);
    this.defaultTools.set(askOracleTool.name, askOracleTool);
    this.defaultTools.set(reportCompletionTool.name, reportCompletionTool);
    this.defaultTools.set(requestApprovalTool.name, requestApprovalTool);
    this.defaultTools.set(askMultipleChoiceTool.name, askMultipleChoiceTool);
    this.defaultTools.set(requestTimedDecisionTool.name, requestTimedDecisionTool);
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
