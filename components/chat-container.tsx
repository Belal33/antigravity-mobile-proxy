'use client';

import { useChat } from '@/hooks/use-chat';
import Header from '@/components/header';
import WelcomeScreen from '@/components/welcome-screen';
import MessageList from '@/components/message-list';
import ChatInput from '@/components/chat-input';
import ArtifactPanel from '@/components/artifact-panel';
import { useEffect } from 'react';

export default function ChatContainer() {
  const chat = useChat();

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        chat.startNewChat();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [chat]);

  return (
    <div className="app-container">
      <Header
        statusState={chat.statusState}
        statusText={chat.statusText}
        windows={chat.windows}
        conversations={chat.conversations}
        activeConversation={chat.activeConversation}
        cdpStatus={chat.cdpStatus}
        recentProjects={chat.recentProjects}
        onSelectWindow={chat.selectWindow}
        onSelectConversation={chat.selectConversation}
        onNewChat={chat.startNewChat}
        onToggleArtifacts={chat.toggleArtifactPanel}
        onStartCdp={chat.startCdpServer}
        onOpenWindow={chat.openNewWindow}
        onCloseWindow={chat.closeWindowByIndex}
      />

      <main className="messages-area" role="log" aria-live="polite">
        {chat.showWelcome ? (
          <WelcomeScreen onQuickPrompt={chat.sendMessage} />
        ) : (
          <MessageList
            messages={chat.messages}
            currentSteps={chat.currentSteps}
            currentResponse={chat.currentResponse}
            isStreaming={chat.isStreaming}
            onApprove={chat.approve}
            onReject={chat.reject}
            onRetry={async () => {
              try {
                // To retry, we ping health and maybe trigger a status update
                await fetch('/api/v1/health');
                window.location.reload(); 
              } catch { /* ignore */ }
            }}
          />
        )}
        <div ref={chat.messagesEndRef} />
      </main>

      <ChatInput
        onSend={chat.sendMessage}
        isStreaming={chat.isStreaming}
        currentMode={chat.currentMode}
        onToggleMode={chat.toggleMode}
      />

      <ArtifactPanel
        open={chat.artifactPanelOpen}
        onClose={chat.toggleArtifactPanel}
        activeConversation={chat.activeConversation}
        files={chat.artifactFiles}
      />
    </div>
  );
}
