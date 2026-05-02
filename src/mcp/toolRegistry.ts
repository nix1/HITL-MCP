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

    // 3. Gate_Checkpoint (raport postępu)
    const gateCheckpointTool: McpTool = {
      name: 'Gate_Checkpoint',
      description: 'Intermediate progress report. Use this to signal milestone completion, surfaced risks, or when waiting for specific input during a multi-step task. Does not close the task.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_version: { type: 'string', const: '1.0' },
          turn_id: { type: 'string', description: 'Unique turn identifier (UUID)' },
          task_id: { type: 'string', description: 'Stable task identifier' },
          sequence: { type: 'integer', minimum: 1 },
          timestamp_utc: { type: 'string', format: 'date-time' },
          actor: { type: 'string', const: 'assistant' },
          idempotency_key: { type: 'string' },
          checkpoint_type: { type: 'string', enum: ['progress', 'risk', 'waiting_input', 'validation'] },
          summary: { type: 'string', minLength: 1, maxLength: 500 },
          requirement_delta: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                requirement_id: { type: 'string' },
                status_before: { type: 'string', enum: ['not_started', 'in_progress', 'covered', 'blocked'] },
                status_after: { type: 'string', enum: ['not_started', 'in_progress', 'covered', 'blocked'] },
                note: { type: 'string', maxLength: 300 }
              },
              required: ['requirement_id', 'status_before', 'status_after']
            }
          },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                change_type: { type: 'string', enum: ['file_edit', 'tool_call', 'analysis', 'decision'] },
                reference: { type: 'string' },
                outcome: { type: 'string', maxLength: 300 }
              },
              required: ['change_type']
            }
          },
          blockers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                blocker_id: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                description: { type: 'string' },
                owner: { type: 'string', enum: ['assistant', 'user', 'system'] },
                unblock_hint: { type: 'string' }
              },
              required: ['blocker_id', 'severity', 'description', 'owner']
            }
          },
          next_expected_step: { type: 'string', maxLength: 300 },
          continue_possible: { type: 'boolean' }
        },
        required: ['schema_version', 'turn_id', 'task_id', 'sequence', 'timestamp_utc', 'actor', 'idempotency_key', 'checkpoint_type', 'summary', 'continue_possible']
      }
    };

    // 4. Gate_Close (formalne zamknięcie tury)
    const gateCloseTool: McpTool = {
      name: 'Gate_Close',
      description: 'Mandatory completion gate. Call this tool to formally close your turn and report final status. Final responses without a preceding Gate_Close are considered non-compliant.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_version: { type: 'string', const: '1.0' },
          turn_id: { type: 'string', description: 'Unique turn identifier (UUID)' },
          task_id: { type: 'string', description: 'Stable task identifier' },
          sequence: { type: 'integer', minimum: 1 },
          timestamp_utc: { type: 'string', format: 'date-time' },
          actor: { type: 'string', const: 'assistant' },
          idempotency_key: { type: 'string' },
          final_state: { type: 'string', enum: ['completed', 'partial', 'blocked'] },
          summary: { type: 'string', minLength: 1, maxLength: 700 },
          requirement_coverage: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              properties: {
                requirement_id: { type: 'string' },
                status: { type: 'string', enum: ['covered', 'partially_covered', 'not_covered'] },
                evidence_refs: { type: 'array', items: { type: 'string' }, minItems: 1 },
                note: { type: 'string' }
              },
              required: ['requirement_id', 'status', 'evidence_refs']
            }
          },
          artifacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                artifact_type: { type: 'string', enum: ['file', 'log', 'test', 'command', 'report'] },
                reference: { type: 'string' },
                description: { type: 'string' }
              },
              required: ['artifact_type', 'reference']
            }
          },
          validations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                check_name: { type: 'string' },
                result: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
                evidence_ref: { type: 'string' },
                details: { type: 'string' }
              },
              required: ['check_name', 'result']
            }
          },
          blocker: {
            type: 'object',
            properties: {
              blocker_id: { type: 'string' },
              description: { type: 'string' },
              owner: { type: 'string', enum: ['assistant', 'user', 'system'] },
              needed_input: { type: 'string' },
              next_unblock_step: { type: 'string' }
            },
            required: ['blocker_id', 'description', 'owner', 'needed_input', 'next_unblock_step']
          },
          next_action_owner: { type: 'string', enum: ['assistant', 'user', 'system', 'none'] },
          next_suggestion: { type: 'string', maxLength: 400 }
        },
        required: ['schema_version', 'turn_id', 'task_id', 'sequence', 'timestamp_utc', 'actor', 'idempotency_key', 'final_state', 'summary', 'requirement_coverage', 'validations', 'next_action_owner']
      }
    };

    // 5. Gate_Start (opcjonalny start zadania)
    const gateStartTool: McpTool = {
      name: 'Gate_Start',
      description: 'Optional task initiation gate. Use this to declare intent, scope, and success criteria before starting a complex task.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_version: { type: 'string', const: '1.0' },
          turn_id: { type: 'string' },
          task_id: { type: 'string' },
          sequence: { type: 'integer', minimum: 1 },
          timestamp_utc: { type: 'string', format: 'date-time' },
          actor: { type: 'string', const: 'assistant' },
          idempotency_key: { type: 'string' },
          plan_summary: { type: 'string' },
          expected_requirements: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['schema_version', 'turn_id', 'task_id', 'sequence', 'timestamp_utc', 'actor', 'idempotency_key', 'plan_summary']
      }
    };

    // 6. Gate_Blocked (dedykowany sygnał blokady)
    const gateBlockedTool: McpTool = {
      name: 'Gate_Blocked',
      description: 'Dedicated blockage signal. Use this when you are completely unable to proceed and need immediate human or system intervention.',
      inputSchema: {
        type: 'object',
        properties: {
          schema_version: { type: 'string', const: '1.0' },
          turn_id: { type: 'string' },
          task_id: { type: 'string' },
          sequence: { type: 'integer', minimum: 1 },
          timestamp_utc: { type: 'string', format: 'date-time' },
          actor: { type: 'string', const: 'assistant' },
          idempotency_key: { type: 'string' },
          blocker_details: {
            type: 'object',
            properties: {
              blocker_id: { type: 'string' },
              severity: { type: 'string', enum: ['high', 'critical'] },
              description: { type: 'string' },
              needed_input: { type: 'string' }
            },
            required: ['blocker_id', 'severity', 'description', 'needed_input']
          }
        },
        required: ['schema_version', 'turn_id', 'task_id', 'sequence', 'timestamp_utc', 'actor', 'idempotency_key', 'blocker_details']
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
    this.defaultTools.set(gateCheckpointTool.name, gateCheckpointTool);
    this.defaultTools.set(gateCloseTool.name, gateCloseTool);
    this.defaultTools.set(gateStartTool.name, gateStartTool);
    this.defaultTools.set(gateBlockedTool.name, gateBlockedTool);
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
