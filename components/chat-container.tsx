'use client';

import { useChat } from '@/hooks/use-chat';
import Header from '@/components/header';
import WelcomeScreen from '@/components/welcome-screen';
import MessageList from '@/components/message-list';
import ChatInput from '@/components/chat-input';
import ArtifactPanel from '@/components/artifact-panel';
import ChangesPanel from '@/components/changes-panel';
import NetworkBanner from '@/components/network-banner';
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
        onStartCdp={chat.startCdpServer}
        onOpenWindow={chat.openNewWindow}
        onCloseWindow={chat.closeWindowByIndex}
      />

      <NetworkBanner networkOnline={chat.networkOnline} isConnected={chat.isConnected} />

      <main className="messages-area" role="log" aria-live="polite">
        {chat.isLoadingHistory ? (
          <div className="history-loading">
            <div className="history-loading-header">
              <div className="skeleton-shimmer skeleton-avatar" />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '45%' }} />
            </div>
            <div className="history-loading-block">
              <div className="skeleton-shimmer skeleton-line" style={{ width: '80%' }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '65%' }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '72%' }} />
            </div>
            <div className="history-loading-header right">
              <div className="skeleton-shimmer skeleton-line" style={{ width: '35%' }} />
            </div>
            <div className="history-loading-block">
              <div className="skeleton-shimmer skeleton-line" style={{ width: '90%' }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '55%' }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '68%' }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '40%' }} />
            </div>
            <div className="history-loading-header">
              <div className="skeleton-shimmer skeleton-avatar" />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '50%' }} />
            </div>
            <div className="history-loading-block">
              <div className="skeleton-shimmer skeleton-line" style={{ width: '75%' }} />
              <div className="skeleton-shimmer skeleton-line" style={{ width: '60%' }} />
            </div>
            <p className="history-loading-text">Loading conversation history…</p>
          </div>
        ) : chat.showWelcome ? (
          <WelcomeScreen onQuickPrompt={chat.sendMessage} />
        ) : (
          <MessageList
            messages={chat.messages}
            currentSteps={chat.currentSteps}
            currentResponse={chat.currentResponse}
            isStreaming={chat.isStreaming}
            onRetry={async () => {
              try {
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
        currentAgent={chat.currentAgent}
        agents={chat.agents}
        isLoadingAgents={chat.isLoadingAgents}
        onFetchAgents={chat.fetchAgentList}
        onSwitchAgent={chat.switchAgent}
        onToggleArtifacts={chat.toggleArtifactPanel}
        artifactCount={chat.artifactFiles.length}
        artifactPanelOpen={chat.artifactPanelOpen}
        onToggleChanges={chat.toggleChangesPanel}
        changesCount={chat.changeFiles.length}
        changesPanelOpen={chat.changesPanelOpen}
      />

      <ArtifactPanel
        open={chat.artifactPanelOpen}
        onClose={chat.toggleArtifactPanel}
        activeConversation={chat.activeConversation}
        files={chat.artifactFiles}
      />

      <ChangesPanel
        open={chat.changesPanelOpen}
        onClose={chat.toggleChangesPanel}
        changes={chat.changeFiles}
      />
    </div>
  );
}
