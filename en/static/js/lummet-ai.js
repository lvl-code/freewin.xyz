/* =====================================================
   LUMMET AI — Frontend Chat Widget
   Level.casino AI Intelligence Assistant
   ===================================================== */

(function () {
  'use strict';

  let isOpen = false;
  let isStreaming = false;
  let sessionId = null;
  let messages = [];

  let button, window, messagesEl, inputEl, sendBtn, clearBtn, closeBtn;

  function init() {
    const siteOrigin = window.location.origin;
    const siteHostname = window.location.hostname;
    if (document.querySelector('.lummet-ai-root')) return;

    if (!document.querySelector('link[href*="lummet-ai.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/static/css/lummet-ai.css';
      document.head.appendChild(link);
    }

    const root = document.createElement('div');
    root.className = 'lummet-ai-root';
    root.innerHTML = `
      <button class="lummet-ai-button" aria-label="Open Lummet AI Assistant" title="Lummet AI">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 8V4H8"></path>
          <rect x="4" y="8" width="16" height="12" rx="2"></rect>
          <path d="M2 14h2"></path>
          <path d="M20 14h2"></path>
          <path d="M15 13v2"></path>
          <path d="M9 13v2"></path>
        </svg>
      </button>

      <div class="lummet-ai-window" role="dialog" aria-label="Lummet AI Chat" aria-hidden="true">
        <div class="lummet-ai-header">
          <div class="lummet-ai-header-info">
            <div class="lummet-ai-avatar">✦</div>
            <div class="lummet-ai-title-block">
              <h3>Lummet AI</h3>
              <span><span class="lummet-ai-status-dot"></span> Your iGaming Intelligence Assistant</span>
            </div>
          </div>
          <div class="lummet-ai-header-actions">
            <button class="lummet-ai-header-btn lummet-ai-clear" aria-label="Clear conversation" title="Clear chat">↻</button>
            <button class="lummet-ai-header-btn lummet-ai-close" aria-label="Close chat" title="Close">✕</button>
          </div>
        </div>

        <div class="lummet-ai-messages" id="lummetMessages">
          <div class="lummet-ai-welcome">
            <div class="lummet-ai-welcome-icon">✦</div>
            <h4>Hi, I'm Lummet AI</h4>
            <p>I can help you explore casino reviews, compare casinos, check bonuses, and find information on ${siteHostname}.</p>
          </div>
          <div class="lummet-ai-suggestions">
            <button class="lummet-ai-suggestion-chip" data-prompt="Show me the best casinos">Best casinos</button>
            <button class="lummet-ai-suggestion-chip" data-prompt="What casino reviews are available?">Casino reviews</button>
            <button class="lummet-ai-suggestion-chip" data-prompt="Which casinos are available in my country?">Available in my country</button>
            <button class="lummet-ai-suggestion-chip" data-prompt="Tell me about crypto casinos">Crypto casinos</button>
          </div>
        </div>

        <div class="lummet-ai-input-area">
          <textarea class="lummet-ai-input" id="lummetInput" placeholder="Ask about casinos, reviews, bonuses..." rows="1" aria-label="Message input"></textarea>
          <button class="lummet-ai-send" id="lummetSend" aria-label="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>

        <div class="lummet-ai-footer">
          Powered by <a href="${siteOrigin}">${siteHostname}</a> · Editorial content only · 18+
        </div>
      </div>
    `;

    document.body.appendChild(root);

    button = root.querySelector('.lummet-ai-button');
    window = root.querySelector('.lummet-ai-window');
    messagesEl = root.querySelector('#lummetMessages');
    inputEl = root.querySelector('#lummetInput');
    sendBtn = root.querySelector('#lummetSend');
    clearBtn = root.querySelector('.lummet-ai-clear');
    closeBtn = root.querySelector('.lummet-ai-close');

    button.addEventListener('click', toggleWindow);
    closeBtn.addEventListener('click', closeWindow);
    clearBtn.addEventListener('click', clearConversation);
    sendBtn.addEventListener('click', sendMessage);
    inputEl.addEventListener('keydown', handleKeyDown);
    inputEl.addEventListener('input', autoResize);

    root.querySelectorAll('.lummet-ai-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        inputEl.value = chip.dataset.prompt;
        sendMessage();
      });
    });

    sessionId = 'lummet-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function toggleWindow() { isOpen ? closeWindow() : openWindow(); }

  function openWindow() {
    isOpen = true;
    window.classList.add('open');
    window.setAttribute('aria-hidden', 'false');
    button.classList.add('active');
    setTimeout(() => inputEl.focus(), 200);
  }

  function closeWindow() {
    isOpen = false;
    window.classList.remove('open');
    window.setAttribute('aria-hidden', 'true');
    button.classList.remove('active');
  }

  function autoResize() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function sendMessage() {
    const text = inputEl.value.trim();
    if (!text || isStreaming) return;

    const welcome = messagesEl.querySelector('.lummet-ai-welcome');
    const suggestions = messagesEl.querySelector('.lummet-ai-suggestions');
    if (welcome) welcome.remove();
    if (suggestions) suggestions.remove();

    addMessage(text, 'user');
    messages.push({ role: 'user', content: text });

    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.disabled = true;
    sendBtn.disabled = true;
    isStreaming = true;

    showTyping();

    try {
      const response = await fetch('/en/api/v1/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: sessionId })
      });

      if (!response.ok) throw new Error('Stream request failed');

      const contentType = response.headers.get('Content-Type') || '';

      if (contentType.includes('text/event-stream')) {
        await handleStreamResponse(response);
      } else {
        const data = await response.json();
        hideTyping();
        const answer = data.answer || 'I could not generate a response.';
        addMessage(answer, 'ai');
        messages.push({ role: 'assistant', content: answer });
      }
    } catch (error) {
      console.error('Lummet stream error:', error);
      try {
        const response = await fetch('/en/api/v1/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, session_id: sessionId })
        });
        const data = await response.json();
        hideTyping();
        const answer = data.answer || 'I could not find that information.';
        addMessage(answer, 'ai');
        messages.push({ role: 'assistant', content: answer });
      } catch (fallbackError) {
        hideTyping();
        addMessage('Sorry, something went wrong. Please try again.', 'ai');
      }
    } finally {
      isStreaming = false;
      inputEl.disabled = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  async function handleStreamResponse(response) {
    hideTyping();

    const bubble = document.createElement('div');
    bubble.className = 'lummet-msg lummet-msg-ai';
    messagesEl.appendChild(bubble);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') {
              fullText += data.content;
              bubble.innerHTML = renderMarkdown(fullText);
              scrollToBottom();
            } else if (data.type === 'done') {
              if (data.session_id) sessionId = data.session_id;
            } else if (data.type === 'error') {
              bubble.innerHTML = renderMarkdown(data.content || 'An error occurred.');
            }
          } catch (e) {}
        }
      }
    }

    messages.push({ role: 'assistant', content: fullText });
    addFollowUpSuggestions();
  }

  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `lummet-msg lummet-msg-${type}`;
    if (type === 'ai') {
      msg.innerHTML = renderMarkdown(text);
    } else {
      msg.textContent = text;
    }
    messagesEl.appendChild(msg);
    scrollToBottom();
  }

  function addFollowUpSuggestions() {
    const existing = messagesEl.querySelector('.lummet-ai-suggestions');
    if (existing) existing.remove();

    const suggestions = document.createElement('div');
    suggestions.className = 'lummet-ai-suggestions';
    suggestions.style.marginTop = '4px';

    const chips = [
      { label: 'Compare casinos', prompt: 'Compare the casinos you mentioned' },
      { label: 'Show bonuses', prompt: 'What bonuses do these casinos offer?' },
      { label: 'Payment methods', prompt: 'What payment methods are available?' },
      { label: 'More details', prompt: 'Tell me more about the first one' }
    ];

    chips.forEach(chip => {
      const btn = document.createElement('button');
      btn.className = 'lummet-ai-suggestion-chip';
      btn.textContent = chip.label;
      btn.addEventListener('click', () => {
        inputEl.value = chip.prompt;
        sendMessage();
      });
      suggestions.appendChild(btn);
    });

    messagesEl.appendChild(suggestions);
    scrollToBottom();
  }

  function showTyping() {
    const typing = document.createElement('div');
    typing.className = 'lummet-typing';
    typing.id = 'lummetTyping';
    typing.innerHTML = `
      <div class="lummet-typing-dot"></div>
      <div class="lummet-typing-dot"></div>
      <div class="lummet-typing-dot"></div>
    `;
    messagesEl.appendChild(typing);
    scrollToBottom();
  }

  function hideTyping() {
    const typing = document.getElementById('lummetTyping');
    if (typing) typing.remove();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function clearConversation() {
    messagesEl.innerHTML = `
      <div class="lummet-ai-welcome">
        <div class="lummet-ai-welcome-icon">✦</div>
        <h4>Hi, I'm Lummet AI</h4>
        <p>I can help you explore casino reviews, compare casinos, check bonuses, and find information on ${siteHostname}.</p>
      </div>
      <div class="lummet-ai-suggestions">
        <button class="lummet-ai-suggestion-chip" data-prompt="Show me the best casinos">Best casinos</button>
        <button class="lummet-ai-suggestion-chip" data-prompt="What casino reviews are available?">Casino reviews</button>
        <button class="lummet-ai-suggestion-chip" data-prompt="Which casinos are available in my country?">Available in my country</button>
        <button class="lummet-ai-suggestion-chip" data-prompt="Tell me about crypto casinos">Crypto casinos</button>
      </div>
    `;

    messagesEl.querySelectorAll('.lummet-ai-suggestion-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        inputEl.value = chip.dataset.prompt;
        sendMessage();
      });
    });

    messages = [];

    try {
      await fetch('/en/api/v1/ai/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
    } catch (e) {}
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Markdown links
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Plain URLs
    html = html.replace(
      /(^|[\s(])((?:https?:\/\/)[^\s<>"']+)/g,
      function (_, prefix, url) {
        let punctuation = '';

        // Remove sentence punctuation from the end of the URL.
        while (/[.,!?;:)]$/.test(url)) {
          punctuation = url.slice(-1) + punctuation;
          url = url.slice(0, -1);
        }

        return prefix +
          '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' +
          url +
          '</a>' +
          punctuation;
      }
    );

    html = html.replace(/^[\s]*[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/<br>(<(?:ul|pre|ol))/g, '$1');
    html = html.replace(/(<\/(?:ul|pre|ol)>)<br>/g, '$1');

    return html;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
