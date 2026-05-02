import * as assert from 'assert';
(global as any).__PACKAGE_VERSION__ = '0.0.0-test';
import { McpServer } from '../mcp/server';


suite('McpTools Test Suite', () => {
    let server: McpServer;

    suiteSetup(() => {
        const mockContext: any = {};
        server = new McpServer(mockContext, 'test', 3000);
    });

    test('All expected default tools are registered', () => {
        const tools = (server as any).tools as Map<string, any>;
        const expectedTools = [
            'Ask_Human_Expert',
            'Ask_Oracle',
            'Gate_Checkpoint',
            'Gate_Close',
            'Gate_Start',
            'Gate_Blocked',
            'Request_Approval',
            'Ask_Multiple_Choice'
        ];

        for (const name of expectedTools) {
            assert.ok(tools.has(name), `Tool '${name}' should be registered`);
        }
    });

    test('Ask_Multiple_Choice schema is correct', () => {
        const tools = (server as any).tools as Map<string, any>;
        const mcTool = tools.get('Ask_Multiple_Choice');
        assert.ok(mcTool, 'Ask_Multiple_Choice tool should exist');

        const schema = mcTool.inputSchema;
        assert.strictEqual(schema.type, 'object');
        assert.ok(schema.properties.question, 'Should have question property');
        assert.ok(schema.properties.options, 'Should have options property');
        assert.strictEqual(schema.properties.options.type, 'array');
        assert.ok(schema.properties.recommendation, 'Should have recommendation property');
        assert.deepStrictEqual(schema.required, ['question', 'options']);
    });

    test('Gate_Close schema is correct', () => {
        const tools = (server as any).tools as Map<string, any>;
        
        // Report_Completion should NOT exist anymore
        assert.ok(!tools.has('Report_Completion'), 'Report_Completion should no longer exist');
        
        const tool = tools.get('Gate_Close');
        assert.ok(tool, 'Gate_Close tool should exist');
        
        const schema = tool.inputSchema;
        assert.ok(schema.properties.summary, 'Should have summary property');
        assert.ok(schema.properties.final_state, 'Should have final_state property');
        assert.deepStrictEqual(schema.properties.final_state.enum, ['completed', 'partial', 'blocked']);
        assert.ok(schema.required.includes('final_state'), 'final_state should be required');
        assert.ok(schema.required.includes('summary'), 'summary should be required');
        assert.ok(schema.required.includes('requirement_coverage'), 'requirement_coverage should be required');
    });

    test('Gate_Checkpoint schema is correct', () => {
        const tools = (server as any).tools as Map<string, any>;
        const tool = tools.get('Gate_Checkpoint');
        assert.ok(tool, 'Gate_Checkpoint tool should exist');
        
        const schema = tool.inputSchema;
        assert.ok(schema.properties.checkpoint_type, 'Should have checkpoint_type property');
        assert.deepStrictEqual(schema.properties.checkpoint_type.enum, ['progress', 'risk', 'waiting_input', 'validation']);
        assert.ok(schema.required.includes('checkpoint_type'), 'checkpoint_type should be required');
    });
});
