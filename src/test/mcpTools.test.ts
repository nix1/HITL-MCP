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
            'HITL_Chat',
            'Ask_Oracle',
            'Report_Completion',
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

    test('Report_Completion schema replaces Get_Next_Task', () => {
        const tools = (server as any).tools as Map<string, any>;
        
        // Get_Next_Task should NOT exist anymore
        assert.ok(!tools.has('Get_Next_Task'), 'Get_Next_Task should no longer exist');
        
        // Report_Completion should exist with the right schema
        const tool = tools.get('Report_Completion');
        assert.ok(tool, 'Report_Completion tool should exist');
        
        const schema = tool.inputSchema;
        assert.ok(schema.properties.summary, 'Should have summary property');
        assert.ok(schema.properties.status, 'Should have status property');
        assert.deepStrictEqual(schema.properties.status.enum, ['completed', 'blocked', 'partial']);
        assert.deepStrictEqual(schema.required, ['summary', 'status']);
    });

    test('Report_Completion has optional artifacts and next_suggestion fields', () => {
        const tools = (server as any).tools as Map<string, any>;
        const tool = tools.get('Report_Completion');
        const schema = tool.inputSchema;
        
        assert.ok(schema.properties.artifacts, 'Should have optional artifacts property');
        assert.ok(schema.properties.next_suggestion, 'Should have optional next_suggestion property');
        // These should NOT be required
        assert.ok(!schema.required.includes('artifacts'), 'artifacts should not be required');
        assert.ok(!schema.required.includes('next_suggestion'), 'next_suggestion should not be required');
    });
});
