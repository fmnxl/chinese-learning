<script lang="ts">
	import { 
		chatOpen, chatContext, chatMessages, isStreaming,
		closeChat, getApiKey, setApiKey, buildContextMessage,
		SYSTEM_PROMPT, OPENROUTER_API_URL, MODEL,
		type ChatMessage
	} from '$lib/stores/chat';
	
	let inputValue = '';
	let apiKeyInput = '';
	let showSettings = false;
	let messagesDiv: HTMLDivElement;
	
	$: if ($chatOpen && typeof window !== 'undefined') {
		apiKeyInput = getApiKey() || '';
	}
	
	const quickPrompts = [
		'Explain the components',
		'Give me a mnemonic',
		'Show example sentences',
		'What\'s the etymology?'
	];
	
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}
	
	function formatMarkdown(text: string): string {
		// Simple markdown formatting
		return text
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*/g, '<em>$1</em>')
			.replace(/`(.+?)`/g, '<code>$1</code>')
			.replace(/\n/g, '<br>');
	}
	
	function saveApiKey() {
		setApiKey(apiKeyInput);
		showSettings = false;
	}
	
	function sendQuickPrompt(prompt: string) {
		inputValue = prompt;
		sendMessage();
	}
	
	async function sendMessage() {
		if (!inputValue.trim() || $isStreaming) return;
		
		const apiKey = getApiKey();
		if (!apiKey) {
			showSettings = true;
			return;
		}
		
		const userMessage = inputValue.trim();
		inputValue = '';
		
		// Add user message
		chatMessages.update(msgs => [...msgs, { role: 'user', content: userMessage }]);
		
		isStreaming.set(true);
		
		// Add placeholder for assistant
		chatMessages.update(msgs => [...msgs, { role: 'assistant', content: '...' }]);
		
		try {
			const ctx = $chatContext;
			if (!ctx) throw new Error('No context');
			
			const contextMsg = buildContextMessage(ctx);
			const allMsgs = $chatMessages.slice(0, -1); // Exclude placeholder
			
			const messages = [
				{ role: 'system', content: SYSTEM_PROMPT + '\n\n' + contextMsg },
				...allMsgs.map(m => ({ role: m.role, content: m.content }))
			];
			
			const response = await fetch(OPENROUTER_API_URL, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': window.location.origin,
					'X-Title': 'Chinese Radicals Learning App'
				},
				body: JSON.stringify({
					model: MODEL,
					messages,
					stream: true
				})
			});
			
			if (!response.ok) {
				const error = await response.text();
				throw new Error(`API error: ${response.status}`);
			}
			
			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let fullResponse = '';
			
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				
				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');
				
				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = line.slice(6);
						if (data === '[DONE]') continue;
						
						try {
							const json = JSON.parse(data);
							const content = json.choices?.[0]?.delta?.content;
							if (content) {
								fullResponse += content;
								chatMessages.update(msgs => {
									const updated = [...msgs];
									updated[updated.length - 1] = { role: 'assistant', content: fullResponse };
									return updated;
								});
								// Scroll to bottom
								if (messagesDiv) {
									messagesDiv.scrollTop = messagesDiv.scrollHeight;
								}
							}
						} catch (e) {
							// Skip invalid JSON
						}
					}
				}
			}
			
		} catch (error: any) {
			chatMessages.update(msgs => {
				const updated = [...msgs];
				updated[updated.length - 1] = { role: 'assistant', content: `Error: ${error.message}` };
				return updated;
			});
		} finally {
			isStreaming.set(false);
		}
	}
	
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	}
	
	// Resize functionality
	let panelWidth = 450;
	let isResizing = false;
	let startX = 0;
	let startWidth = 0;
	let chatPanel: HTMLDivElement;
	
	// Load saved width on mount
	$: if ($chatOpen && typeof window !== 'undefined') {
		const saved = localStorage.getItem('chat_panel_width');
		if (saved) {
			panelWidth = parseInt(saved, 10) || 450;
		}
	}
	
	function startResize(e: MouseEvent) {
		isResizing = true;
		startX = e.clientX;
		startWidth = panelWidth;
		document.addEventListener('mousemove', handleMouseMove);
		document.addEventListener('mouseup', stopResize);
		e.preventDefault();
	}
	
	function handleMouseMove(e: MouseEvent) {
		if (!isResizing) return;
		const deltaX = startX - e.clientX;
		const newWidth = Math.min(Math.max(startWidth + deltaX, 320), window.innerWidth * 0.8);
		panelWidth = newWidth;
	}
	
	function stopResize() {
		if (isResizing) {
			isResizing = false;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', stopResize);
			localStorage.setItem('chat_panel_width', String(panelWidth));
		}
	}
</script>

{#if $chatOpen}
	<div class="chat-overlay" on:click={closeChat} on:keydown={() => {}}></div>
	<div class="chat-panel" bind:this={chatPanel} style="width: {panelWidth}px" class:resizing={isResizing}>
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div class="chat-resize-handle" class:active={isResizing} on:mousedown={startResize}></div>
		<div class="chat-header">
			<h3>Ask about {$chatContext?.char || ''}</h3>
			<button class="close-btn" on:click={closeChat}>×</button>
		</div>
		
		{#if showSettings}
			<div class="settings-panel">
				<h4>API Settings</h4>
				<p>Enter your OpenRouter API key:</p>
				<input 
					type="password" 
					bind:value={apiKeyInput}
					placeholder="sk-or-..."
				/>
				<div class="settings-actions">
					<button on:click={() => showSettings = false}>Cancel</button>
					<button class="primary" on:click={saveApiKey}>Save</button>
				</div>
			</div>
		{:else}
			<div class="chat-messages" bind:this={messagesDiv}>
				<div class="chat-message assistant">
					👋 Ask me anything about <strong>{$chatContext?.char}</strong>
					({$chatContext?.pinyin || ''})!
					<br><br>
					I can explain etymology, components, usage, and mnemonics.
				</div>
				
				{#each $chatMessages as msg}
					<div class="chat-message {msg.role}">
						{#if msg.role === 'assistant'}
							{@html formatMarkdown(msg.content)}
						{:else}
							{escapeHtml(msg.content)}
						{/if}
					</div>
				{/each}
			</div>
			
			<div class="quick-prompts">
				{#each quickPrompts as prompt}
					<button on:click={() => sendQuickPrompt(prompt)}>{prompt}</button>
				{/each}
			</div>
			
			<div class="chat-input-area">
				<input
					type="text"
					bind:value={inputValue}
					on:keydown={handleKeydown}
					placeholder="Ask a question..."
					disabled={$isStreaming}
				/>
				<button on:click={sendMessage} disabled={$isStreaming}>
					{$isStreaming ? '...' : 'Send'}
				</button>
			</div>
			
			<button class="settings-btn" on:click={() => showSettings = true}>
				⚙️ Settings
			</button>
		{/if}
	</div>
{/if}

<style>
	.chat-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.5);
		z-index: 999;
	}
	
	.chat-panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		max-width: 100vw;
		background: var(--bg-card);
		border-left: 1px solid var(--border);
		z-index: 1000;
		display: flex;
		flex-direction: column;
	}
	
	.chat-panel.resizing {
		transition: none;
		user-select: none;
	}
	
	.chat-resize-handle {
		position: absolute;
		left: 0;
		top: 0;
		width: 6px;
		height: 100%;
		cursor: ew-resize;
		background: transparent;
		z-index: 10;
	}
	
	.chat-resize-handle:hover,
	.chat-resize-handle.active {
		background: var(--accent);
	}
	
	.chat-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid var(--border);
	}
	
	.chat-header h3 {
		margin: 0;
		font-size: 1.125rem;
	}
	
	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	
	.chat-messages {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	
	.chat-message {
		padding: 0.75rem 1rem;
		border-radius: 12px;
		max-width: 90%;
	}
	
	.chat-message.user {
		background: var(--accent);
		color: white;
		align-self: flex-end;
	}
	
	.chat-message.assistant {
		background: var(--bg-card);
		color: var(--text-primary);
		align-self: flex-start;
	}
	
	.quick-prompts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border);
	}
	
	.quick-prompts button {
		padding: 0.375rem 0.75rem;
		font-size: 0.75rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 16px;
		color: var(--text-secondary);
		cursor: pointer;
	}
	
	.quick-prompts button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	
	.chat-input-area {
		display: flex;
		gap: 0.5rem;
		padding: 1rem;
		border-top: 1px solid var(--border);
	}
	
	.chat-input-area input {
		flex: 1;
		padding: 0.75rem 1rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-primary);
		font-size: 0.875rem;
	}
	
	.chat-input-area button {
		padding: 0.75rem 1.5rem;
		background: var(--accent);
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 500;
		cursor: pointer;
	}
	
	.chat-input-area button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	
	.settings-btn {
		padding: 0.5rem;
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		text-align: center;
	}
	
	.settings-panel {
		padding: 1.5rem;
	}
	
	.settings-panel h4 {
		margin: 0 0 0.5rem;
	}
	
	.settings-panel p {
		color: var(--text-secondary);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}
	
	.settings-panel input {
		width: 100%;
		padding: 0.75rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-primary);
		margin-bottom: 1rem;
	}
	
	.settings-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}
	
	.settings-actions button {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		cursor: pointer;
	}
	
	.settings-actions button.primary {
		background: var(--accent);
		border: none;
		color: white;
	}
	
	.settings-actions button:not(.primary) {
		background: var(--bg-card);
		border: 1px solid var(--border);
		color: var(--text-secondary);
	}
</style>
