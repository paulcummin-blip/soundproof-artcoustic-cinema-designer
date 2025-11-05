
import React, { useState, useEffect, useCallback } from "react";
import { agentSDK } from "@/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, Plus, MessageCircle, Loader2 } from "lucide-react";
import MessageBubble from "../components/agents/MessageBubble";

export default function CinemaAgentPage() {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);

  // Memoize loadConversations to fix dependency warning
  const loadConversations = useCallback(async () => {
    try {
      const convs = await agentSDK.listConversations({
        agent_name: "cinema_design_assistant"
      });
      setConversations(convs || []);
      
      // Auto-select first conversation if available
      // It's important to pass a stable `selectConversation` or ensure `selectConversation` itself doesn't cause issues
      // For now, `selectConversation` is stable due to no external dependencies causing it to recreate
      if (convs?.length > 0 && !activeConversation) {
        selectConversation(convs[0]);
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoadingConversations(false);
    }
  }, [activeConversation]); // `selectConversation` is implicitly stable because it depends only on `agentSDK` which is stable.

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]); // Added loadConversations to dependency array

  // Subscribe to active conversation updates
  useEffect(() => {
    if (!activeConversation?.id) return;

    const unsubscribe = agentSDK.subscribeToConversation(activeConversation.id, (data) => {
      setMessages(data.messages || []);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [activeConversation?.id]);

  const createNewConversation = async () => {
    try {
      const conversation = await agentSDK.createConversation({
        agent_name: "cinema_design_assistant",
        metadata: {
          name: `Cinema Design Session ${new Date().toLocaleString()}`,
          description: "New cinema design consultation"
        }
      });
      
      setConversations(prev => [conversation, ...prev]);
      setActiveConversation(conversation);
      setMessages([]);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const selectConversation = async (conversation) => {
    try {
      const fullConv = await agentSDK.getConversation(conversation.id);
      setActiveConversation(fullConv);
      setMessages(fullConv.messages || []);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !activeConversation) return;

    const messageText = inputMessage.trim();
    setInputMessage("");
    setLoading(true);

    try {
      await agentSDK.addMessage(activeConversation, {
        role: "user",
        content: messageText
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F7] flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-[#DCDBD6] flex flex-col">
        <div className="p-4 border-b border-[#DCDBD6]">
          <h2 className="text-lg font-bold text-[#1B1A1A] mb-4">Cinema Design Assistant</h2>
          <Button 
            onClick={createNewConversation}
            className="w-full bg-[#1B1A1A] hover:bg-[#3E4349]"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Consultation
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[#3E4349]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-[#3E4349]">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">No consultations yet. Start your first cinema design session!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    activeConversation?.id === conv.id 
                      ? "bg-[#F8F8F7] border-[#1B1A1A]" 
                      : "bg-white border-[#DCDBD6] hover:bg-[#F8F8F7]"
                  }`}
                >
                  <div className="font-medium text-[#1B1A1A] text-sm">
                    {conv.metadata?.name || "Unnamed Session"}
                  </div>
                  <div className="text-xs text-[#3E4349] mt-1">
                    {new Date(conv.created_date || conv.created_at).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-[#DCDBD6] p-4">
              <h3 className="font-semibold text-[#1B1A1A]">
                {activeConversation.metadata?.name || "Cinema Design Session"}
              </h3>
              <p className="text-sm text-[#3E4349] mt-1">
                Get expert advice on room acoustics, speaker placement, and CEDIA RP22 compliance
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.length === 0 && !loading ? (
                <div className="text-center py-12">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 text-[#DCDBD6]" />
                  <h4 className="text-lg font-semibold text-[#1B1A1A] mb-2">
                    Welcome to your Cinema Design Session
                  </h4>
                  <p className="text-[#3E4349] max-w-md mx-auto">
                    I'm here to help you design the perfect cinema room. Ask me about room dimensions, 
                    speaker configurations, acoustic treatments, or CEDIA RP22 compliance.
                  </p>
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                    {[
                      "What's the ideal room size for a 7.1.4 system?",
                      "Help me choose speakers for my 5m × 4m room",
                      "How do I achieve RP22 Level 3 compliance?",
                      "What's the best screen size for my seating distance?"
                    ].map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => setInputMessage(suggestion)}
                        className="text-left p-3 text-sm border border-[#DCDBD6] rounded-lg hover:bg-[#F8F8F7] transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message, idx) => (
                  <MessageBubble key={idx} message={message} />
                ))
              )}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-[#DCDBD6] rounded-2xl px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#3E4349]" />
                    <span className="text-sm text-[#3E4349]">Analyzing...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-[#DCDBD6] p-4">
              <div className="flex gap-3">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask about room design, speakers, or acoustics..."
                  className="flex-1"
                  disabled={loading}
                />
                <Button 
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || loading}
                  className="bg-[#1B1A1A] hover:bg-[#3E4349]"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-[#3E4349] mt-2">
                Press Enter to send, or Shift+Enter for a new line
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="w-24 h-24 mx-auto mb-6 text-[#DCDBD6]" />
              <h3 className="text-xl font-semibold text-[#1B1A1A] mb-2">
                Cinema Design Assistant
              </h3>
              <p className="text-[#3E4349] mb-6 max-w-md">
                Create a new consultation to get started with expert cinema room design advice.
              </p>
              <Button 
                onClick={createNewConversation}
                className="bg-[#1B1A1A] hover:bg-[#3E4349]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Start New Consultation
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
