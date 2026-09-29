// A failed agent turn survives a widget remount or page reload in this tab.
export const PENDING_AGENT_TURN_KEY = 'avengers_ai_pending_agent_turn';

export function readPendingAgentTurn(storage) {
  try {
    return JSON.parse(storage.getItem(PENDING_AGENT_TURN_KEY) || 'null');
  } catch {
    return null;
  }
}

export function matchesAgentTurn(previous, request) {
  const selectedProductId = request.selectedProductId || null;
  return previous?.text === request.text &&
      (previous.selectedProductId || null) === selectedProductId &&
      previous.sessionId === request.sessionId &&
      previous.conversationId === request.conversationId;
}

export function selectAgentTurn(previous, request, createId) {
  const selectedProductId = request.selectedProductId || null;
  if (matchesAgentTurn(previous, request)) return previous;
  return { ...request, selectedProductId, id: createId() };
}

export function clearCompletedAgentTurn(storage, turn) {
  const current = readPendingAgentTurn(storage);
  if (current?.id === turn?.id) storage.removeItem(PENDING_AGENT_TURN_KEY);
}

export function agentTurnFailure(phase, status) {
  if (phase === 'response_processing') {
    return { phase, message: 'Mình đã nhận kết quả nhưng chưa hiển thị được. Bạn gửi lại đúng tin nhắn này để mình lấy lại kết quả nhé.' };
  }
  if (status) {
    return { phase: 'server_response', message: 'Máy chủ chưa xử lý được tin nhắn. Bạn gửi lại đúng tin nhắn này để mình kiểm tra cùng lượt xử lý nhé.' };
  }
  return { phase: 'request', message: 'Kết nối bị gián đoạn nên mình chưa nhận được kết quả. Bạn gửi lại đúng tin nhắn này để mình kiểm tra cùng lượt xử lý nhé.' };
}
