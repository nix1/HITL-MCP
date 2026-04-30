import * as assert from 'assert';

// Import the ChatManager directly — it has no VS Code dependency
// We need to use a relative path that works from the compiled output
import { ChatManager } from '../mcp/chatManager';

suite('ChatManager', () => {
  let chatManager: ChatManager;

  setup(() => {
    chatManager = new ChatManager(); // no logger needed for tests
  });

  suite('getSession', () => {
    test('creates a new session on first access', () => {
      const session = chatManager.getSession('test-session');
      assert.strictEqual(session.sessionId, 'test-session');
      assert.strictEqual(session.messages.length, 0);
      assert.strictEqual(session.pendingRequests.size, 0);
      assert.strictEqual(session.isActive, true);
    });

    test('returns the same session on repeated access', () => {
      const session1 = chatManager.getSession('test-session');
      const session2 = chatManager.getSession('test-session');
      assert.strictEqual(session1, session2);
    });

    test('updates lastActivity on access', () => {
      const session = chatManager.getSession('test-session');
      const firstAccess = session.lastActivity;

      // Small delay to ensure timestamp changes
      const session2 = chatManager.getSession('test-session');
      assert.ok(session2.lastActivity >= firstAccess);
    });
  });

  suite('addMessage', () => {
    test('adds a message to session history', () => {
      chatManager.addMessage('s1', {
        id: '1',
        sender: 'agent',
        content: 'Hello',
        timestamp: new Date(),
        type: 'text'
      });

      const messages = chatManager.getMessages('s1');
      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].content, 'Hello');
    });

    test('returns a copy of messages (not a reference)', () => {
      chatManager.addMessage('s1', {
        id: '1',
        sender: 'agent',
        content: 'Hello',
        timestamp: new Date(),
        type: 'text'
      });

      const messages = chatManager.getMessages('s1');
      messages.push({
        id: '2',
        sender: 'user',
        content: 'Injected',
        timestamp: new Date(),
        type: 'text'
      });

      // Original should be unaffected
      assert.strictEqual(chatManager.getMessages('s1').length, 1);
    });

    test('enforces max message limit (FIFO)', () => {
      // ChatManager has maxMessagesPerSession = 50
      for (let i = 0; i < 60; i++) {
        chatManager.addMessage('s1', {
          id: `msg-${i}`,
          sender: 'agent',
          content: `Message ${i}`,
          timestamp: new Date(),
          type: 'text'
        });
      }

      const messages = chatManager.getMessages('s1');
      assert.strictEqual(messages.length, 50);
      // First message should be msg-10 (oldest 10 were trimmed)
      assert.strictEqual(messages[0].id, 'msg-10');
      assert.strictEqual(messages[49].id, 'msg-59');
    });
  });

  suite('pendingRequests', () => {
    test('adds and retrieves pending requests', () => {
      chatManager.addPendingRequest('s1', 'req-1', { tool: 'chat' });
      assert.strictEqual(chatManager.hasPendingRequests('s1'), true);

      const pending = chatManager.getPendingRequests('s1');
      assert.strictEqual(pending.size, 1);
      assert.deepStrictEqual(pending.get('req-1'), { tool: 'chat' });
    });

    test('returns a copy of pending requests', () => {
      chatManager.addPendingRequest('s1', 'req-1', { tool: 'chat' });
      const pending = chatManager.getPendingRequests('s1');
      pending.set('injected', { tool: 'fake' });

      assert.strictEqual(chatManager.getPendingRequests('s1').size, 1);
    });

    test('removes pending requests', () => {
      chatManager.addPendingRequest('s1', 'req-1', { tool: 'chat' });
      const removed = chatManager.removePendingRequest('s1', 'req-1');
      assert.strictEqual(removed, true);
      assert.strictEqual(chatManager.hasPendingRequests('s1'), false);
    });

    test('returns false when removing non-existent request', () => {
      const removed = chatManager.removePendingRequest('s1', 'non-existent');
      assert.strictEqual(removed, false);
    });

    test('getLatestPendingRequest returns the most recent', () => {
      chatManager.addPendingRequest('s1', 'req-1', { order: 1 });
      chatManager.addPendingRequest('s1', 'req-2', { order: 2 });

      const latest = chatManager.getLatestPendingRequest('s1');
      assert.ok(latest);
      assert.strictEqual(latest.requestId, 'req-2');
      assert.deepStrictEqual(latest.data, { order: 2 });
    });

    test('getLatestPendingRequest returns null for empty session', () => {
      const latest = chatManager.getLatestPendingRequest('empty-session');
      assert.strictEqual(latest, null);
    });
  });

  suite('findPendingRequest', () => {
    test('finds a request across all sessions', () => {
      chatManager.addPendingRequest('s1', 'req-1', { session: 's1' });
      chatManager.addPendingRequest('s2', 'req-2', { session: 's2' });

      const found = chatManager.findPendingRequest('req-2');
      assert.ok(found);
      assert.strictEqual(found.sessionId, 's2');
      assert.deepStrictEqual(found.data, { session: 's2' });
    });

    test('returns null when request not found', () => {
      const found = chatManager.findPendingRequest('non-existent');
      assert.strictEqual(found, null);
    });
  });

  suite('session management', () => {
    test('getActiveSessions returns active session IDs', () => {
      chatManager.getSession('s1');
      chatManager.getSession('s2');

      const active = chatManager.getActiveSessions();
      assert.ok(active.includes('s1'));
      assert.ok(active.includes('s2'));
    });

    test('deactivateSession marks session as inactive', () => {
      chatManager.getSession('s1');
      chatManager.deactivateSession('s1');

      const active = chatManager.getActiveSessions();
      assert.ok(!active.includes('s1'));
    });

    test('getSessionState returns correct summary', () => {
      chatManager.addMessage('s1', {
        id: '1',
        sender: 'agent',
        content: 'Hello',
        timestamp: new Date(),
        type: 'text'
      });
      chatManager.addPendingRequest('s1', 'req-1', { tool: 'chat' });

      const state = chatManager.getSessionState('s1');
      assert.strictEqual(state.sessionId, 's1');
      assert.strictEqual(state.messageCount, 1);
      assert.strictEqual(state.pendingRequestCount, 1);
      assert.strictEqual(state.isActive, true);
      assert.ok(state.latestPendingRequest);
      assert.strictEqual(state.latestPendingRequest!.requestId, 'req-1');
    });

    test('getMemoryStats returns correct totals', () => {
      chatManager.getSession('s1');
      chatManager.getSession('s2');
      chatManager.addMessage('s1', {
        id: '1',
        sender: 'agent',
        content: 'Hello',
        timestamp: new Date(),
        type: 'text'
      });
      chatManager.addPendingRequest('s1', 'req-1', { tool: 'chat' });
      chatManager.deactivateSession('s2');

      const stats = chatManager.getMemoryStats();
      assert.strictEqual(stats.totalSessions, 2);
      assert.strictEqual(stats.activeSessions, 1);
      assert.strictEqual(stats.totalMessages, 1);
      assert.strictEqual(stats.totalPendingRequests, 1);
    });
  });
});
