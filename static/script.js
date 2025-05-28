$(document).ready(function() {
    console.log("Document ready triggered.");
    console.log("Sidebar toggle button jQuery object:", $('#sidebar-toggle'));
    console.log("Sidebar toggle button exists in DOM (length > 0):", $('#sidebar-toggle').length > 0);
    if ($('#sidebar-toggle').length > 0) {
        console.log("Sidebar toggle display style:", $('#sidebar-toggle').css('display'));
        console.log("Sidebar toggle visibility style:", $('#sidebar-toggle').css('visibility'));
        console.log("Sidebar toggle opacity style:", $('#sidebar-toggle').css('opacity'));
    }

    const appContainer = $('#app-container');
    const userInput = $('#user-input');
    const userInputLabel = $('#user-input-label'); 
    const sendButton = $('#send-button');
    const chatHistory = $('#chat-history');
    const initialChatContent = $('.initial-chat-content'); // For initial view
    const suggestionCards = $('.example-prompt-card');

    let currentCrawledContent = ""; 
    let isProcessing = false; 
    let currentStreamReader = null; // Added to hold the current stream reader

    const chatHistoryList = $('#chat-history-list'); 
    const newChatButton = $('#new-chat-button'); 
    const sidebarToggle = $('#sidebar-toggle');

    // --- START: Initialize Sidebar State from localStorage ---
    try {
        const initialSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (initialSidebarCollapsed) {
            if (!appContainer.hasClass('sidebar-collapsed')) {
                appContainer.addClass('sidebar-collapsed');
            }
        } else {
            // If localStorage says not collapsed, ensure the class is removed
            // This handles cases where the class might have been added by other means or localStorage was cleared
            if (appContainer.hasClass('sidebar-collapsed')) {
                appContainer.removeClass('sidebar-collapsed');
            }
        }
    } catch (e) {
        console.error("Error accessing localStorage for sidebar state:", e);
    }
    // --- END: Initialize Sidebar State from localStorage ---

    const STORAGE_KEY = 'chatAppSessions';
    let chatSessions = []; // { id: string, title: string, messages: [{text: string, sender: string, isHtml: boolean}] }
    let currentSessionId = null;
    let currentProductData = null; // To store parsed product data
    let productViewActive = false; // Flag to track if product view is active
    const PRODUCT_JSON_MARKER = "PRODUCT_JSON_START:";

    // --- Session Management ---
    function saveChatSessions() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(chatSessions));
    }

    function loadChatSessions() {
        const storedSessions = localStorage.getItem(STORAGE_KEY);
        if (storedSessions) {
            chatSessions = JSON.parse(storedSessions);
            if (chatSessions.length > 0) {
                currentSessionId = chatSessions[chatSessions.length - 1].id;
            }
        }
        if (chatSessions.length === 0) {
            createNewSession();
        }
    }

    function generateSessionId() {
        return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    function createNewSession() {
        deactivateProductViewMode(); // Ensure product view is off for new sessions
        const newId = generateSessionId();
        const newSession = {
            id: newId,
            title: "新对话", 
            messages: []
        };
        chatSessions.push(newSession);
        currentSessionId = newId;
        
        chatHistory.empty().hide(); // Clear main chat and hide it
        $('.center-welcome-block').show(); // Show the welcome block for new chats

        appContainer.addClass('initial-view'); 
        isProcessing = false; 

        renderChatHistoryList();
        setActiveSessionInList(newId); 
        saveChatSessions(); 

        console.log("Created new session:", newId);
        userInput.val(''); 
        userInputLabel.show(); 
        userInput.focus(); 
        // addInitialAssistantMessageDOM(); // Decide if needed for a brand new, empty session
    }

    function renderChatHistoryList() {
        chatHistoryList.empty();
        if (chatSessions.length === 0) {
            chatHistoryList.append('<div class="p-2 text-gray-400 text-sm">没有历史对话</div>');
            return;
        }
        for (let i = chatSessions.length - 1; i >= 0; i--) {
            const session = chatSessions[i];
            const listItem = $('<div></div>')
                .addClass('chat-history-item group flex justify-between items-center p-2 cursor-pointer hover:bg-gray-500 rounded text-sm truncate')
                .attr('title', session.title)
                .attr('data-session-id', session.id)
                .on('click', function() {
                    if (isProcessing) {
                        console.log("Cannot switch session while AI is processing.");
                        return; 
                    }
                    loadSession($(this).attr('data-session-id'));
                });
    
            const titleSpan = $('<span></span>') 
                .addClass('flex-grow min-w-0')
                .text(session.title || `对话 ${session.id.substring(0, 8)}`)
            
            const deleteButton = $('<button class="delete-session-btn flex-shrink-0 p-1 hover:text-red-400 focus:outline-none"></button>') 
                .html('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.197-2.326.368a.75.75 0 00-.524.728v.001l.002.002.002.002a.75.75 0 00.523.728C4.42 6.198 5.205 6.318 6 6.395V14.5A2.5 2.5 0 008.5 17h3a2.5 2.5 0 002.5-2.5V6.395c.795-.077 1.58-.197 2.326-.368a.75.75 0 00.524-.728v-.001l-.002-.002-.002-.002a.75.75 0 00-.523-.728C15.58 4.39 14.795 4.27 14 4.198V3.75A2.75 2.75 0 0011.25 1h-2.5zM7.5 3.75c0-.69.56-1.25 1.25-1.25h2.5c.69 0 1.25.56 1.25 1.25v.418A24.307 24.307 0 0010 4.51a24.306 24.306 0 00-2.5-.342V3.75zM8.75 8.25a.75.75 0 00-1.5 0v5a.75.75 0 001.5 0v-5zm2.5 0a.75.75 0 00-1.5 0v5a.75.75 0 001.5 0v-5z" clip-rule="evenodd" /></svg>')
                .attr('data-session-id-delete', session.id)
                .on('click', function(e) {
                    e.stopPropagation(); 
                    const sessionIdToDelete = $(this).attr('data-session-id-delete');
                    // Add confirmation dialog
                    if (confirm("你确定要删除这条对话记录吗？")) {
                        deleteSession(sessionIdToDelete);
                    }
                });
    
            listItem.append(titleSpan);
            listItem.append(deleteButton);
    
            if (session.id === currentSessionId) {
                listItem.addClass('selected bg-gray-600 font-semibold');
            }
            chatHistoryList.append(listItem);
        }
    }

    function deleteSession(sessionId) {
        chatSessions = chatSessions.filter(session => session.id !== sessionId);
        saveChatSessions();
        renderChatHistoryList(); 
    
        if (currentSessionId === sessionId) { 
            if (chatSessions.length > 0) {
                loadSession(chatSessions[chatSessions.length - 1].id);
            } else {
                createNewSession();
            }
        } else if (chatSessions.length === 0) {
             createNewSession();
        }
    }

    function setActiveSessionInList(sessionId) {
        chatHistoryList.find('.chat-history-item').removeClass('selected bg-gray-600 font-semibold');
        chatHistoryList.find(`.chat-history-item[data-session-id="${sessionId}"]`).addClass('selected bg-gray-600 font-semibold');
    }

    function loadSession(sessionId) {
        const session = chatSessions.find(s => s.id === sessionId);
        if (!session) {
            if (chatSessions.length > 0) {
                loadSession(chatSessions[0].id); // Fallback to first session
            } else {
                createNewSession(); // Or create a new one if none exist
            }
            return;
        }
        currentSessionId = sessionId;
        chatHistory.empty(); 

        if (session.messages.length === 0) {
            $('.center-welcome-block').show(); // Show welcome message for empty sessions
            chatHistory.hide();
            appContainer.addClass('initial-view');
            isProcessing = false;
        } else {
            $('.center-welcome-block').hide(); // Hide welcome message
            chatHistory.show();
            session.messages.forEach(msg => {
                // console.log("Loading message from session. Sender:", msg.sender, "Text:", msg.text.substring(0, 20)); // DEBUG LINE
                
                // Corrected logic: If isHtml is true, msg.text is already HTML.
                addMessageToChatDOM(msg.text, msg.sender, msg.isHtml);
            });
            appContainer.removeClass('initial-view');
            isProcessing = false; // Ensure isProcessing is false when just loading a session
        }
        
        renderChatHistoryList(); 
        setActiveSessionInList(sessionId);
        console.log("Loaded session:", sessionId);
        userInput.focus();
    }
    
    // Renamed original addMessageToChat to addMessageToChatDOM
    function addMessageToChatDOM(message, sender, isHtml = false) {
        const messageWrapper = $('<div></div>').addClass('message-wrapper'); // New wrapper for icon and bubble
        const messageDiv = $('<div></div>').addClass('message');
        const messageContentDiv = $('<div></div>').addClass('message-content');

        let iconSvg = '';
        if (sender === 'user') {
            messageWrapper.addClass('user-message-wrapper');
            messageDiv.addClass('user-message');
            iconSvg = '<svg class="message-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
        } else {
            messageWrapper.addClass('assistant-message-wrapper');
            messageDiv.addClass('assistant-message');
            iconSvg = '<svg class="message-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#10B981"><path d="M19 11h-1.7c0-1.02-.26-1.97-.72-2.8l1.22-1.22c.39-.39.39-1.02 0-1.41a.996.996 0 00-1.41 0l-1.22 1.22C14.37 6.26 13.42 6 12.4 6H11V4c0-.55-.45-1-1-1s-1 .45-1 1v2H7.6c-1.02 0-1.97.26-2.8.72L3.59 5.51a.996.996 0 00-1.41 0c-.39.39-.39 1.02 0 1.41l1.22 1.22c-.46.83-.72 1.78-.72 2.8H1c-.55 0-1 .45-1 1s.45 1 1 1h1.7c0 1.02.26 1.97.72 2.8L2.2 17.29c-.39.39-.39 1.02 0 1.41.2.2.45.29.71.29s.51-.1.71-.29l1.22-1.22c.83.46 1.78.72 2.8.72H9v2c0 .55.45 1 1 1s1-.45 1-1v-2h1.4c1.02 0 1.97-.26 2.8-.72l1.22 1.22c.2.2.45.29.71.29s.51-.1.71-.29c.39-.39.39-1.02 0-1.41l-1.22-1.22c.46-.83.72-1.78.72-2.8H21c.55 0 1-.45 1-1s-.45-1-1-1zM8 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm8 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>';
        }
        
        messageWrapper.append(iconSvg); // Add icon to the new wrapper

        if (isHtml) {
            messageContentDiv.html(message);
        } else {
            const escapedMessage = $('<div>').text(message).html();
            messageContentDiv.html(escapedMessage.replace(/\\n/g, '<br>'));
        }

        messageDiv.append(messageContentDiv);
        messageWrapper.append(messageDiv); // Add message bubble to the new wrapper
        chatHistory.append(messageWrapper); // Append the new wrapper to chat history

        if (chatHistory.is(':visible')) {
            // Conditional auto-scroll
            const chatHistoryEl = chatHistory[0];
            const isNearBottom = (chatHistoryEl.scrollHeight - chatHistoryEl.scrollTop - chatHistoryEl.clientHeight) < 50; // 50px threshold
            if (isNearBottom) {
                chatHistory.scrollTop(chatHistoryEl.scrollHeight);
            }
        }
        return messageDiv; // Return the message bubble div, though wrapper might be more useful now
    }
    
    // New function to add message to current session and then to DOM
    function addMessageToCurrentSession(messageText, sender, isHtml = false, interimId = null) {
        let session = chatSessions.find(s => s.id === currentSessionId);
        if (!session) {
            createNewSession();
            session = chatSessions.find(s => s.id === currentSessionId);
            if (!session) {
                return null;
            }
        }

        const messageData = { text: messageText, sender: sender, isHtml: isHtml, interimId: interimId };
        session.messages.push(messageData);

        if (sender === 'user' && session.messages.filter(m => m.sender === 'user').length === 1 && !productViewActive) {
            session.title = messageText.substring(0, 25) + (messageText.length > 25 ? "..." : "");
            renderChatHistoryList(); 
        }
        
        saveChatSessions();
        const messageElement = addMessageToChatDOM(messageText, sender, isHtml); // Add to DOM and get element

        return { messageData, messageElement }; // Return both data and element
    }

    // Function to update a message in the current session by its interimId
    function updateMessageInCurrentSession(interimId, newText, newIsHtml) {
        const session = chatSessions.find(s => s.id === currentSessionId);
        if (!session) return;

        const messageIndex = session.messages.findIndex(m => m.interimId === interimId);
        if (messageIndex > -1) {
            session.messages[messageIndex].text = newText;
            session.messages[messageIndex].isHtml = newIsHtml;
            delete session.messages[messageIndex].interimId; // Remove interimId after update
            saveChatSessions();
        }
    }

    userInput.on('input focus blur', function() {
        if ($(this).val().trim() !== '' || $(this).is(':focus')) {
            userInputLabel.hide();
        } else {
            userInputLabel.show();
        }
    });
    if (userInput.val().trim() !== '') { 
        userInputLabel.hide();
    }

    suggestionCards.on('click', function() {
        const promptText = $(this).data('prompt');
        if (promptText) {
            userInput.val(promptText);
            userInput.trigger('input'); // Ensure height adjustment and label logic runs
            userInput.focus();
            
            // Ensure welcome block is hidden and chat area is properly set up
            // $('.center-welcome-block').hide(); // This was hiding the welcome block too early
            chatHistory.show(); // Make sure chat history is visible
            // appContainer.removeClass('initial-view'); // If suggestions are clicked, it's not initial view
        }
    });
    
    sendButton.on('click', handleSendMessage);
    userInput.on('keypress', function(e) {
        if (e.which === 13 && !e.shiftKey) { 
            e.preventDefault(); 
            handleSendMessage();
        }
    });

    async function handleSendMessage() {
        const userMessage = userInput.val().trim();
        if (!userMessage) return;

        // Save user message to current session and add to DOM via addMessageToCurrentSession
        const { messageElement: userMessageElement } = addMessageToCurrentSession(userMessage, 'user');
        // addMessageToChatDOM(userMessage, 'user'); // This call was redundant

        // Update session title if it's the first user message and not in product view
        const currentSession = chatSessions.find(s => s.id === currentSessionId);
        if (currentSession && currentSession.messages.filter(m => m.sender === 'user').length === 1 && !productViewActive) {
            const firstWords = userMessage.split(' ').slice(0, 5).join(' ');
            currentSession.title = firstWords;
            renderChatHistoryList(); // Re-render to show new title
            setActiveSessionInList(currentSessionId); // Keep current session selected
            saveChatSessions();
        }
        
        userInput.val('');
        adjustTextareaHeight(); 
        userInputLabel.show(); 
        $('.center-welcome-block').hide(); // Hide welcome block once chat starts
        chatHistory.show(); // Ensure chat history is visible
        
        appContainer.removeClass('initial-view');
        
        const assistantInterimId = `assistant-response-${Date.now()}`;
        let assistantMessageElement; // Declare here for broader scope including finally
        
        let accumulatedCrawlAnimationContent = ""; 
        let accumulatedThinkContent = ""; 
        let accumulatedAnswerContent = ""; 
        let accumulatedLLMResponseContent = "";
        let firstMeaningfulChunkReceived = false;
        let userCancelled = false;

        try {
            isProcessing = true; 
            sendButton.hide(); 
            $('#stop-button').show(); 
            chatHistoryList.addClass('processing-active'); 
            
            const tempAssistantData = addMessageToCurrentSession('', 'assistant', true, assistantInterimId);
            assistantMessageElement = tempAssistantData.messageElement;
            const messageContentDiv = assistantMessageElement.find('.message-content');
            
            // Setup structured divs
            messageContentDiv.html(`
                <div class="stream-status-placeholder text-sm text-gray-400 p-2">正在连接并准备数据... <div class="loader-small-dots inline-block"></div></div>
                <div class="stream-warnings-container hidden text-xs text-yellow-500 p-1 my-1 border border-yellow-600 rounded"></div>
                <div class="crawl-xml-animation-status-container hidden text-sm text-gray-400 p-1 my-1"></div>
                <div class="crawl-xml-think-container hidden"></div>
                <div class="crawl-xml-answer-container hidden"></div>
                <div class="ai-llm-response-container hidden"></div>
                <div class="references-container hidden text-xs p-1 mt-2 border-t border-gray-600"></div>
            `);
            chatHistory.scrollTop(chatHistory[0].scrollHeight); 
            
            accumulatedThinkContent = ""; 
            accumulatedAnswerContent = ""; 
            accumulatedLLMResponseContent = "";
            firstMeaningfulChunkReceived = false;
            
            const messagesForApi = currentSession.messages 
                .filter(msg => msg.text.trim() !== '' && msg.interimId !== assistantInterimId) 
                .map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'assistant',
                    content: msg.text // Assuming msg.text is raw text for API
                }));

            console.log("Sending to /api/chat:", JSON.stringify(messagesForApi));

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                },
                body: JSON.stringify({ messages: messagesForApi })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response not OK:', response.status, response.statusText, errorText);
                messageContentDiv.html(`<p class="text-red-400">服务器错误: ${response.status} ${errorText || response.statusText}</p>`);
                updateMessageInCurrentSession(assistantInterimId, `服务器错误: ${response.status} ${errorText || response.statusText}`, false);
            } else {
                console.log('Response headers:', Object.fromEntries(response.headers.entries()));
                const reader = response.body.getReader();
                currentStreamReader = reader; 
                const decoder = new TextDecoder();
                let buffer = '';

                console.log("Starting to read from SSE stream...");
                while (true) {
                    let value, done;
                    try {
                        const readResult = await reader.read();
                        value = readResult.value;
                        done = readResult.done;
                        if (value) {
                            const decodedChunk = decoder.decode(value, {stream: true});
                            console.log("SSE Raw Chunk Received (decoded):", decodedChunk.substring(0, 200) + (decodedChunk.length > 200 ? "..." : ""));
                        } else if (done) {
                            console.log("SSE Stream read() signaled done and no pending value.");
                        }
                    } catch (readError) {
                        console.error("Error reading from stream:", readError);
                        if (assistantMessageElement && assistantMessageElement.length && !messageContentDiv.find('.text-red-400').length) {
                            messageContentDiv.append(`<p class="text-red-500">Error reading stream: ${readError.message}</p>`);
                        }
                        updateMessageInCurrentSession(assistantInterimId, `Stream read error: ${readError.message}`, false);
                        break;
                    }

                    if (done) {
                        console.log("SSE Stream finished (reader.read() returned done: true).");
                        // Finalize content from accumulators
                        if (messageContentDiv.find('.crawl-xml-think-container').is(':visible')) {
                            messageContentDiv.find('.crawl-xml-think-container .text-content').text(accumulatedThinkContent);
                        }
                        if (messageContentDiv.find('.crawl-xml-answer-container').is(':visible')) {
                            const answerContainerDone = messageContentDiv.find('.crawl-xml-answer-container .text-content');
                            if (accumulatedAnswerContent) answerContainerDone.html(marked.parse(accumulatedAnswerContent));
                            else if (answerContainerDone.html().includes('<span class="temp-cursor-answer">▋</span>')) answerContainerDone.html(''); // Clear if only cursor
                        }
                        if (messageContentDiv.find('.ai-llm-response-container').is(':visible')) {
                            messageContentDiv.find('.ai-llm-response-container .text-content').html(marked.parse(accumulatedLLMResponseContent));
                        }
                        messageContentDiv.find('.temp-cursor-answer, .temp-cursor-llm, .temp-cursor-think, .loader-small-dots').remove();
                        
                        // Construct final HTML for storage
                        let finalHtmlToStore = "";
                        if (messageContentDiv.find('.stream-warnings-container').is(':visible') && messageContentDiv.find('.stream-warnings-container').html().trim()) {
                            finalHtmlToStore += `<div class="stream-warnings-container">${messageContentDiv.find('.stream-warnings-container').html()}</div>`;
                        }
                        if (messageContentDiv.find('.crawl-xml-think-container').is(':visible') && messageContentDiv.find('.crawl-xml-think-container .text-content').html() && messageContentDiv.find('.crawl-xml-think-container .text-content').html().trim()) {
                            finalHtmlToStore += `<div class="crawl-xml-think-container">${messageContentDiv.find('.crawl-xml-think-container').html()}</div>`;
                        }
                        if (messageContentDiv.find('.crawl-xml-answer-container').is(':visible') && messageContentDiv.find('.crawl-xml-answer-container .text-content').html() && messageContentDiv.find('.crawl-xml-answer-container .text-content').html().trim()) {
                            finalHtmlToStore += `<div class="crawl-xml-answer-container">${messageContentDiv.find('.crawl-xml-answer-container').html()}</div>`;
                        }
                        if (messageContentDiv.find('.ai-llm-response-container').is(':visible') && messageContentDiv.find('.ai-llm-response-container .text-content').html() && messageContentDiv.find('.ai-llm-response-container .text-content').html().trim()) {
                            finalHtmlToStore += `<div class="ai-llm-response-container">${messageContentDiv.find('.ai-llm-response-container').html()}</div>`;
                        }
                        // Add references to storage if visible and has content
                        if (messageContentDiv.find('.references-container').is(':visible') && messageContentDiv.find('.references-container').html().trim()) {
                            finalHtmlToStore += `<div class="references-container">${messageContentDiv.find('.references-container').html()}</div>`;
                        }
                        
                        if (!finalHtmlToStore.trim() && messageContentDiv.find('.stream-status-placeholder').is(':visible')) {
                            finalHtmlToStore = messageContentDiv.find('.stream-status-placeholder').html();
                        } else if (!finalHtmlToStore.trim()) {
                            finalHtmlToStore = "(无有效输出)";
                        }
                        updateMessageInCurrentSession(assistantInterimId, finalHtmlToStore, true);
                        break; 
                    }

                    buffer += decoder.decode(value, { stream: true });
                    let eolIndex;
                    while ((eolIndex = buffer.indexOf('\n')) >= 0) { 
                        const line = buffer.substring(0, eolIndex).trim(); 
                        buffer = buffer.substring(eolIndex + 1);

                        if (line.startsWith("data: ")) {
                            const jsonStr = line.substring(5).trim();
                            if (jsonStr) {
                                try {
                                    const data = JSON.parse(jsonStr);
                                    console.log("Processing SSE data (after JSON.parse):", data);

                                    if (!firstMeaningfulChunkReceived) {
                                        if (data.type === 'think_start' || data.type === 'answer_start' || data.type === 'ai_response' || 
                                            (data.type === 'answer_chunk' && data.content_type === 'text') || (data.type === 'think_chunk')) {
                                            messageContentDiv.find('.stream-status-placeholder').hide();
                                            firstMeaningfulChunkReceived = true;
                                        }
                                    }

                                    if (data.type === 'crawling_animation') {
                                        const animationContainer = messageContentDiv.find('.crawl-xml-animation-status-container').removeClass('hidden');
                                        let animText = data.message || "";
                                        if (data.current_reference) {
                                            animText = `正在检索: <span class="font-mono text-xs bg-gray-700 p-0.5 rounded">${data.current_reference.substring(0, 60) + (data.current_reference.length > 60 ? '...' : '')}</span>`;
                                            const refsContainer = messageContentDiv.find('.references-container').removeClass('hidden');
                                            
                                            let linkUrl = data.current_reference; 
                                            let linkText = data.current_reference;
                                            
                                            // Regex to find URL within the last parentheses: (https://...) or (http://...)
                                            const urlInParensRegex = /\((https?:\/\/[^\s()]+)\)$/;
                                            const match = data.current_reference.match(urlInParensRegex);

                                            if (match && match[1]) {
                                                linkUrl = match[1];
                                                linkText = data.current_reference.substring(0, data.current_reference.lastIndexOf('(')).trim();
                                            } else {
                                                // Fallback to previous logic if regex doesn't match (e.g. no parens or different format)
                                                const lastOpenParen = data.current_reference.lastIndexOf('(');
                                                const lastCloseParen = data.current_reference.lastIndexOf(')');
                                                if (lastOpenParen !== -1 && lastCloseParen > lastOpenParen && lastCloseParen === data.current_reference.length - 1) {
                                                    const potentialUrl = data.current_reference.substring(lastOpenParen + 1, lastCloseParen);
                                                    if (potentialUrl.toLowerCase().startsWith('http')) {
                                                        linkUrl = potentialUrl;
                                                        linkText = data.current_reference.substring(0, lastOpenParen).trim();
                                                    } else {
                                                        // If content in parens is not a valid URL, try to find a bare URL in the whole string
                                                        const bareUrlRegex = /(https?:\/\/[^\s)]+)/gi;
                                                        const bareMatches = data.current_reference.match(bareUrlRegex);
                                                        if (bareMatches && bareMatches.length > 0) {
                                                            linkUrl = bareMatches[bareMatches.length - 1];
                                                            // linkText remains data.current_reference in this specific fallback
                                                        }
                                                    }
                                                } else {
                                                    // Final fallback: try to find any bare URL in the string
                                                    const bareUrlRegex = /(https?:\/\/[^\s)]+)/gi;
                                                    const bareMatches = data.current_reference.match(bareUrlRegex);
                                                    if (bareMatches && bareMatches.length > 0) {
                                                        linkUrl = bareMatches[bareMatches.length - 1];
                                                        // linkText remains data.current_reference
                                                    }
                                                }
                                            }

                                            const link = $('<a>')
                                                .attr('href', linkUrl)
                                                .attr('target', '_blank')
                                                .addClass('block text-blue-400 hover:text-blue-300 hover:underline break-all p-0.5 mb-0.5')
                                                .text(linkText);
                                            refsContainer.append(link);
                                        }
                                        if (data.status === 'InProgress') {
                                            animationContainer.html(`${animText} <div class="loader-small-dots inline-block"></div>`);
                                        } else if (data.status === 'Completed') {
                                            animationContainer.html(`${animText || '检索动画完成.'}`);
                                            setTimeout(() => animationContainer.fadeOut(500, function() { $(this).html('').show().addClass('hidden'); }), 1500);
                                        }
                                    } else if (data.type === 'think_start') {
                                        messageContentDiv.find('.crawl-xml-think-container').removeClass('hidden').html('<p class="stage-title text-sm font-semibold text-gray-400 mb-1">📝 思考中...</p><div class="text-content text-xs text-gray-200 opacity-80 whitespace-pre-wrap bg-gray-800 p-2 rounded"></div>');
                                        accumulatedThinkContent = "";
                                    } else if (data.type === 'think_chunk') {
                                        accumulatedThinkContent += data.content;
                                        messageContentDiv.find('.crawl-xml-think-container .text-content').text(accumulatedThinkContent + '▋');
                                    } else if (data.type === 'think_end') {
                                        messageContentDiv.find('.crawl-xml-think-container .text-content').text(accumulatedThinkContent);
                                    } else if (data.type === 'answer_start') {
                                        messageContentDiv.find('.crawl-xml-answer-container').removeClass('hidden').html('<p class="stage-title text-sm font-semibold text-gray-400 mt-2 mb-1">💡 总结 (来自搜索到的资料):</p><div class="text-content prose prose-sm dark:prose-invert max-w-none"></div>');
                                        accumulatedAnswerContent = "";
                                    } else if (data.type === 'answer_chunk') {
                                        const answerContentDiv = messageContentDiv.find('.crawl-xml-answer-container .text-content');
                                        if (data.content_type === 'text') {
                                            accumulatedAnswerContent += data.content;
                                            answerContentDiv.html(marked.parse(accumulatedAnswerContent + '<span class="temp-cursor-answer">▋</span>'));
                                        } else if (data.content_type === 'image' && data.html) {
                                            if (accumulatedAnswerContent) { // Render pending text first
                                                answerContentDiv.html(marked.parse(accumulatedAnswerContent)); // Remove cursor from text
                                                accumulatedAnswerContent = ""; // Reset as text is rendered, it's now part of the DOM
                                            } 
                                            // Instead of just appending to DOM, add to accumulated content string
                                            // so it gets parsed and included by marked, ensuring it persists with text.
                                            accumulatedAnswerContent += data.html; 
                                            answerContentDiv.html(marked.parse(accumulatedAnswerContent + '<span class="temp-cursor-answer">▋</span>'));
                                        }
                                    } else if (data.type === 'answer_end') {
                                        const answerContentDivEnd = messageContentDiv.find('.crawl-xml-answer-container .text-content');
                                        if (accumulatedAnswerContent) {
                                            answerContentDivEnd.html(marked.parse(accumulatedAnswerContent));
                                        }
                                        answerContentDivEnd.find('.temp-cursor-answer').remove();
                                    } else if (data.type === 'ai_response') {
                                        console.log('Received AI response chunk:', data.content); // 添加调试日志
                                        const llmContainer = messageContentDiv.find('.ai-llm-response-container').removeClass('hidden');
                                        if (llmContainer.is(':empty') || !llmContainer.find('.text-content').length) {
                                            llmContainer.html('<p class="stage-title text-sm font-semibold text-gray-400 mt-3 pt-3 border-t border-gray-600 mb-1">🤖 AI 回复:</p><div class="text-content prose prose-sm dark:prose-invert max-w-none"></div>');
                                        }
                                        accumulatedLLMResponseContent += data.content;
                                        
                                        // 添加调试日志
                                        console.log('Current accumulated content:', accumulatedLLMResponseContent);
                                        
                                        // 只解析新增的内容
                                        const newContent = marked.parse(data.content);
                                        console.log('Parsed new content:', newContent); // 添加调试日志
                                        
                                        const textContent = llmContainer.find('.text-content');
                                        textContent.append(newContent);
                                        
                                        // 添加调试日志
                                        console.log('Updated text content:', textContent.html());
                                        
                                        // 自动滚动到底部
                                        chatHistory.scrollTop(chatHistory[0].scrollHeight);
                                    } else if (data.type === 'warning') {
                                        console.warn("Server warning:", data.message);
                                        const warningsContainer = messageContentDiv.find('.stream-warnings-container').removeClass('hidden');
                                        warningsContainer.append(`<p>${data.message}</p>`);
                                    } else if (data.type === 'error') {
                                        let errorDisplay = data.message || "处理时发生未知错误";
                                        if (data.details) errorDisplay += ` (详情: ${data.details})`;
                                        if (data.source) errorDisplay = `[${data.source}] ${errorDisplay}`;
                                        
                                        // Clear all staged content and show only error
                                        messageContentDiv.empty().html(`<p class="text-red-400 p-2">${errorDisplay}</p>`);
                                        updateMessageInCurrentSession(assistantInterimId, errorDisplay, false);
                                        if (currentStreamReader) { await currentStreamReader.cancel("StreamErrorFromServer"); currentStreamReader = null; }
                                    } else if (data.type === 'stream_end' || data.event === 'close') {
                                        // This logic is largely covered by the `done` block now.
                                        // Remove cursors explicitly here as well for safety.
                                        messageContentDiv.find('.temp-cursor-think, .temp-cursor-answer, .temp-cursor-llm, .loader-small-dots').remove();
                                        console.log("SSE stream explicitly closed by server event or comprehensive stream ended message received.");
                                        // The main 'done' block will handle final message saving.
                                        if (currentStreamReader) { 
                                            try { await currentStreamReader.cancel("StreamClosedByServerSideEvent"); } catch(e){}
                                            currentStreamReader = null; 
                                        }
                                    }
                                    // Removed old generic data.content handling to avoid conflict with new types.
                                } catch (e) {
                                    console.error("Error parsing JSON from stream chunk or processing data:", jsonStr, "CHUNK PARSE ERROR:", e);
                                    // Avoid overwriting a more specific error message if already set
                                    if (!messageContentDiv.find('.text-red-400').length) {
                                       messageContentDiv.append(`<p class="text-red-500">前端处理流数据时出错: ${e.message}</p>`);
                                    }
                                }
                            } 
                        } 
                        if (chatHistory.is(':visible')) {
                            // Conditional auto-scroll
                            const chatHistoryEl = chatHistory[0];
                            const isNearBottom = (chatHistoryEl.scrollHeight - chatHistoryEl.scrollTop - chatHistoryEl.clientHeight) < 50; // 50px threshold
                            if (isNearBottom) {
                                chatHistory.scrollTop(chatHistoryEl.scrollHeight);
                            }
                        }
                    } 
                } 
            } 
        } catch (error) {
            console.error('Error in handleSendMessage (outer try):', error);
            if (error.name === 'AbortError' || (error.message && (error.message.includes("aborted") || error.message.includes("cancelled")))) {
                if (error.message === "StreamClosedByServerEvent" || error.message === "StreamErrorFromServer") {
                    // These are specific cases where the loop was intentionally broken by an event or error from server
                    console.log(`SSE stream processing ended by server: ${error.message}`);
                } else {
                    userCancelled = true;
                    const userCancelledMsg = "对话已由用户中断。";
                    if (assistantMessageElement && assistantMessageElement.length) {
                        assistantMessageElement.find('.message-content').html(`<p class="text-yellow-400">${userCancelledMsg}</p>`);
                    }
                    updateMessageInCurrentSession(assistantInterimId, userCancelledMsg, false);
                }
            } else {
                const genericErrMsg = '与助手连接时发生未知错误: ' + error.message;
                if (assistantMessageElement && assistantMessageElement.length) {
                    assistantMessageElement.find('.message-content').html(genericErrMsg);
                    updateMessageInCurrentSession(assistantInterimId, genericErrMsg, false);
                } else {
                    addMessageToChatDOM(genericErrMsg, 'assistant');
                }
            }
            // deactivateProductViewMode(); // Ensure this is called if you have it
        } finally {
            isProcessing = false; 
            sendButton.show(); 
            $('#stop-button').hide(); 
            chatHistoryList.removeClass('processing-active'); 
            
            // Ensure final state of cursors and content
            if (assistantMessageElement) {
                 assistantMessageElement.find('.temp-cursor-think, .temp-cursor-answer, .temp-cursor-llm, .loader-small-dots, .stream-status-placeholder.hidden:empty').remove();
                 // If a placeholder was hidden but content never arrived, it might be empty and hidden.
                 // If it was never hidden (meaning no content chunks came), it should be cleared by the 'done' logic or error logic.

                // Finalize content if not already done by stream_end or error events
                // This is a fallback if stream breaks unexpectedly without 'done' or proper end event
                const mcDiv = assistantMessageElement.find('.message-content');
                if (mcDiv.find('.crawl-xml-think-container .text-content:contains("▋")').length) {
                     mcDiv.find('.crawl-xml-think-container .text-content').text(accumulatedThinkContent);
                }
                if (mcDiv.find('.crawl-xml-answer-container .text-content:contains("▋")').length) {
                     mcDiv.find('.crawl-xml-answer-container .text-content').html(marked.parse(accumulatedAnswerContent));
                }
                if (mcDiv.find('.ai-llm-response-container .text-content:contains("▋")').length) {
                     mcDiv.find('.ai-llm-response-container .text-content').html(marked.parse(accumulatedLLMResponseContent));
                }
            }

            if (currentStreamReader && !userCancelled) { 
                try { 
                    if (currentStreamReader.locked) { 
                       console.log("Finalizing stream: reader was still locked, attempting cancel.");
                       await currentStreamReader.cancel("FinallyBlockCleanup"); 
                    }
                } catch(e){ 
                    console.warn("Reader cancel failed in finally block:", e.message);
                } 
            }
            currentStreamReader = null; 

            if (chatHistory.is(':visible')) {
                chatHistory.scrollTop(chatHistory[0].scrollHeight);
            }
        }
    }

    function tryParseProductJsonFromStream(responseText) {
        const markerIndex = responseText.indexOf(PRODUCT_JSON_MARKER);
        let textBeforeJson = responseText;
        let jsonData = null;

        if (markerIndex !== -1) {
            textBeforeJson = responseText.substring(0, markerIndex).trim();
            const jsonString = responseText.substring(markerIndex + PRODUCT_JSON_MARKER.length).trim();
            try {
                jsonData = JSON.parse(jsonString);
                console.log("Parsed product JSON in tryParseProductJsonFromStream:", jsonData); // Log parsed JSON
                // Basic validation for expected structure
                if (typeof jsonData.product_name === 'undefined') {
                    console.warn("Parsed JSON, but product_name is missing.", jsonData); // Log warning for missing product_name
                    // jsonData = null; // Invalid structure, treat as no JSON
                }
            } catch (e) {
                console.error("Failed to parse product JSON from stream in tryParseProductJsonFromStream:", e, "\nString was:", jsonString); // Log JSON parsing failure
                jsonData = null;
            }
        }
        return { textBeforeJson, jsonData };
    }

    function handleProductData(productJson, assistantMsgElement) {
        currentProductData = productJson;
        if (productJson && productJson.product_name) {
            activateProductViewMode(productJson, assistantMsgElement);
        } else {
            deactivateProductViewMode();
        }
    }

    function activateProductViewMode(productData, assistantMsgElement) {
        if (productViewActive) return; // Already active
        productViewActive = true;

        appContainer.removeClass('initial-view').addClass('product-view-active');
        sidebarToggle.trigger('click'); // Attempt to hide sidebar if it's not already hidden by CSS
        // Or more directly if sidebar-collapsed class is reliable:
        if (!appContainer.hasClass('sidebar-collapsed')) {
             appContainer.addClass('sidebar-collapsed');
             // Update toggle button icon if needed, assuming toggleSidebar() handles it
             const sidebarToggleIcon = sidebarToggle.find('svg');
             if (sidebarToggleIcon) {
                // This is a simplified way to set the icon; toggleSidebar might be better if it has logic
                sidebarToggle.html('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>');
             }
        }

        // Add crawling status message below the AI's response
        if (assistantMsgElement && assistantMsgElement.length) {
            // Remove any existing status messages from this element
            assistantMsgElement.find('.crawling-status-message').remove(); 
            const statusMessage = $('<div class="crawling-status-message text-sm text-gray-500 dark:text-gray-400 mt-2 flex items-center"></div>');
            statusMessage.html(
                '<div class="loader-small mr-2"></div>' + 
                `正在爬取关于 "<strong>${productData.product_name}</strong>" 的相关信息...`
            );
            assistantMsgElement.append(statusMessage);
            chatHistory.scrollTop(chatHistory[0].scrollHeight);
        }

        // Update browser view placeholder
        $('#browser-url-display').val(productData.product_name + " - 内容抓取中");
        $('#browser-view-content').html('<p class="text-gray-500 dark:text-gray-400">正在加载预览...</p>');

        // Potentially load/display productData in the browser-view-content or trigger actual crawling here
        // For now, we just show the product name in the fake URL bar
    }

    function deactivateProductViewMode() {
        if (!productViewActive) return; // Already inactive
        productViewActive = false;
        currentProductData = null;
        appContainer.removeClass('product-view-active');
        // Decide if we need to bring back initial-view or processing states based on chat history
        if (chatHistory.children().length <= 1 && !$('.user-message').length) { // Only initial welcome or one assistant message
            appContainer.addClass('initial-view');
        }
        
        // Remove crawling status messages from all assistant messages
        $('.assistant-message .crawling-status-message').remove();
    }

    function adjustTextareaHeight() {
        userInput.css('height', 'auto'); 
        let scrollHeight = userInput[0].scrollHeight;
        // Ensure maxHeight is a number; default to a reasonable value if CSS is not loaded/parsed
        let maxHeight = parseInt(userInput.css('max-height')) || 200; 

        if (scrollHeight > maxHeight) {
            userInput.css('height', maxHeight + 'px');
            userInput.css('overflow-y', 'auto'); 
        } else {
            userInput.css('height', scrollHeight + 'px');
            userInput.css('overflow-y', 'hidden'); 
        }
    }
    userInput.on('input', adjustTextareaHeight);
    

    // --- Sidebar Toggle Functionality ---
    function toggleSidebar() {
        appContainer.toggleClass('sidebar-collapsed');
        const isNowCollapsed = appContainer.hasClass('sidebar-collapsed');
        
        try {
            localStorage.setItem('sidebarCollapsed', isNowCollapsed); // Save the new state
        } catch (e) {
            console.error("Error saving sidebar state to localStorage:", e);
        }

        if (isNowCollapsed) {
            sidebarToggle.html('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>'); // Show hamburger icon
        } else {
            sidebarToggle.html('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>'); // Show back arrow icon
        }
    }

    // Event listener for the sidebar toggle button
    // Ensure this is correctly selecting the button
    // It might be better to attach the event listener directly like this:
    $('body').on('click', '#sidebar-toggle', function() {
        toggleSidebar();
    });
    
    // Initial check for sidebar state (e.g., if saved in localStorage)
    // This block now correctly reflects the state potentially set by localStorage initialization
    if ($('#app-container').hasClass('sidebar-collapsed')) {
        sidebarToggle.html('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>');
    } else {
        sidebarToggle.html('<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>');
    }

    // Initial load logic
    loadChatSessions(); // This will create a new session if none exist.
    renderChatHistoryList(); // Render whatever sessions were loaded/created.
    
    if (currentSessionId) {
        loadSession(currentSessionId); // Load the current (likely a new or last) session.
    } else if (chatSessions.length > 0) {
        // Fallback if currentSessionId wasn't set but sessions exist (should be rare)
        loadSession(chatSessions[chatSessions.length - 1].id);
    } else {
        // This case should ideally not be reached if loadChatSessions ensures a session.
        // createNewSession(); // As a last resort, though loadChatSessions should handle it.
    }
    adjustTextareaHeight(); // Initial adjustment for textarea

    newChatButton.on('click', function() {
        let existingEmptyNewChatId = null;
        // Iterate from most recent to oldest to find the last empty "新对话"
        for (let i = chatSessions.length - 1; i >= 0; i--) {
            const session = chatSessions[i];
            if (session.title === "新对话" && session.messages.length === 0) {
                existingEmptyNewChatId = session.id;
                break; // Found the most recent one
            }
        }

        if (existingEmptyNewChatId) {
            // If the found session is already the current one, loadSession will just refresh it.
            // If it's a different empty "新对话", it will switch to it.
            loadSession(existingEmptyNewChatId);
        } else {
            createNewSession();
        }
    });
    
    console.log("Initial chatSessions on complete load:", JSON.parse(JSON.stringify(chatSessions)));
    console.log("Initial currentSessionId on complete load:", currentSessionId);

    // Stop button functionality
    $('#stop-button').on('click', function() {
        if (currentStreamReader) {
            console.log("Stop button clicked, attempting to cancel stream.");
            currentStreamReader.cancel().then(() => {
                console.log("Stream cancelled by user.");
                // The main handleSendMessage error handling and finally block will update the UI.
            }).catch(err => {
                console.error("Error cancelling stream:", err);
                // Even if cancel itself errors, the finally block in handleSendMessage should run.
            });
        }
    });

}); // End of document.ready

// Ensure all functions like adjustTextareaHeight are defined correctly
// and any other helper functions from the original file are preserved if they were outside document.ready.
// The provided snippet only showed functions inside document.ready.

