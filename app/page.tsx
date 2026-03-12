import ChatContainer from '@/components/chat-container';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading Chat Interface...</div>}>
      <ChatContainer />
    </Suspense>
  );
}
