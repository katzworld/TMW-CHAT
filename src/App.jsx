import React, { useEffect, useState, useRef } from 'react';
import { ethers } from 'ethers';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState(null);
  const [account, setAccount] = useState(null);
  const [ensName, setEnsName] = useState(null);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const chatWindowRef = useRef(null);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [networkError, setNetworkError] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // Update the formatTimestamp function
  function formatTimestamp(unixTimestamp) {
    const timestamp = unixTimestamp < 1000000000000 ? unixTimestamp * 1000 : unixTimestamp;
    const date = new Date(timestamp);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `[${month}/${day} ${hours}:${minutes}:${seconds}]`;
  }

  // Add this new function to handle message clicks
  const handleMessageClick = (timestamp) => {
    if (isMobile) {
      alert(`Message sent on: ${formatTimestamp(timestamp)}`);
    }
  };

  // Add this function to handle network switching
  const switchToMainnet = async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x1' }],
      });
    } catch (error) {
      console.error('Failed to switch network:', error);
      setNetworkError(true);
    }
  };

  useEffect(() => {
    const ws = new WebSocket('wss://chat.tmwstw.io:28124');
    setWs(ws);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsWsConnected(true);

      // Request chat history
      ws.send(JSON.stringify({
        method: 'get_global_chat',
        type: 'chat'
      }));
    };

    ws.onmessage = (event) => {
      // Trigger animations
      setIsPinging(true);
      setTimeout(() => setIsPinging(false), 500);
      setIsReceiving(true);
      setTimeout(() => setIsReceiving(false), 500);

      try {
        const data = JSON.parse(event.data);
        //console.log('Received data:', data); // Debug log

        if (data.type === 'chat') {
          if (data.method === 'all_global_chat_messages') {
            const sortedMessages = data.data
              .map(msg => ({
                sender: msg.sender,
                message: msg.message,
                date: formatTimestamp(msg.date),
                timestamp: msg.date // Keep original timestamp for sorting
              }))
              .sort((a, b) => a.timestamp - b.timestamp); // Fix: Use the stored timestamp

            // console.log('Sorted messages:', sortedMessages); // Debug log
            setMessages(sortedMessages);
            setTimeout(scrollToBottom, 100);
          }
          else if (data.method === 'latest_message') {
            const newMessage = {
              sender: data.data.sender,
              message: data.data.message,
              date: formatTimestamp(data.data.date),
              timestamp: data.data.date
            };
            // console.log('New message:', newMessage); // Debug log
            setMessages(prev => [...prev, newMessage]);
            setTimeout(scrollToBottom, 100);
          }
        }
      } catch (error) {
        console.error('Error parsing message:', error);
        // console.error('Raw message:', event.data); // Debug log
      }
    };

    // Update the WebSocket error and close handlers
    ws.onerror = (error) => {
      const errorMessage = {
        sender: 'System',
        message: 'Connection error. Attempting to reconnect...',
        timestamp: Date.now(),
        isSystem: true
      };

      setIsWsConnected(false);
      setMessages(prev => [...prev, errorMessage]);

      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (!isWsConnected) {
          const newWs = new WebSocket('wss://chat.tmwstw.io:28124');
          setWs(newWs);
          setReconnectAttempt(prev => prev + 1);
        }
      }, 5000);
    };

    ws.onclose = () => {
      const closeMessage = {
        sender: 'System',
        message: 'Disconnected from chat server.',
        timestamp: Date.now(),
        isSystem: true
      };

      setIsWsConnected(false);
      setMessages(prev => [...prev, closeMessage]);
    };

    return () => {
      ws.close();
      setIsWsConnected(false);
    };
  }, [reconnectAttempt]);

  useEffect(() => {
    if (!isWsConnected && reconnectAttempt > 0) {
      const reconnectionMessage = {
        sender: 'System',
        message: `Reconnection attempt ${reconnectAttempt}...`,
        timestamp: Date.now(),
        isSystem: true
      };
      setMessages(prev => [...prev, reconnectionMessage]);
    }
  }, [reconnectAttempt]);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const network = await provider.getNetwork();
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address);

        // Only attempt ENS resolution on mainnet (chainId 1)
        if (network.chainId === 1n) {
          try {
            const name = await provider.lookupAddress(address);
            if (name) {
              setEnsName(name);
            }
          } catch (error) {
            console.log('ENS resolution failed:', error);
          }
        } else {
          console.log('ENS not supported on this network');
          setEnsName(null);
        }
      } catch (error) {
        console.error('Wallet connection failed:', error);
      }
    }
  };

  const formatSender = (sender) => {
    if (sender === account) return 'You';
    if (sender.endsWith('.eth')) return sender;
    return `${sender.slice(0, 6)}...${sender.slice(-4)}`;
  };

  const sendMessage = () => {
    if (!ws || !isWsConnected) {
      console.error('WebSocket not connected');
      return;
    }

    if (!account || !input.trim()) {
      return;
    }

    try {
      const message = {
        type: 'chat',
        method: 'write_global_chat',
        sender: account,
        message: input.trim()
      };
      ws.send(JSON.stringify(message));
      // Trigger transmit animation
      setIsTransmitting(true);
      setTimeout(() => setIsTransmitting(false), 500);
      setInput('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const scrollToBottom = () => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  };

  // Add this function to handle network changes
  const handleNetworkChange = async () => {
    if (window.ethereum) {
      const provider = new ethers.BrowserProvider(window.ethereum);
      try {
        const network = await provider.getNetwork();

        // Clear network error if we're on mainnet
        if (network.chainId === 1n) {
          setNetworkError(false);
          // Re-resolve ENS if we have an account
          if (account) {
            const name = await provider.lookupAddress(account);
            setEnsName(name || null);
          }
        } else {
          setNetworkError(true);
          setEnsName(null);
        }
      } catch (error) {
        console.error('Network detection failed:', error);
        setNetworkError(true);
        setEnsName(null);
      }
    }
  };

  // Add this effect to listen for network changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('chainChanged', () => {
        handleNetworkChange();
      });

      // Initial check
      handleNetworkChange();

      return () => {
        window.ethereum.removeListener('chainChanged', handleNetworkChange);
      };
    }
  }, [account]); // Re-run when account changes

  // Add this effect to handle window resizing
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="terminal">
      <div className="header">
        <div className="leds">
          <div className={`led ${isWsConnected ? `green ${isPinging ? 'blink' : ''}` : 'gray'}`} />
          <div className={`led red ${isTransmitting ? 'blink' : ''}`} />
          <div className={`led blue ${isReceiving ? 'blink' : ''}`} />
        </div>
        {account ? (
          <div className="address">
            <span className={networkError ? 'wrong-network' : ''}>
              Connected: {ensName || `${account.slice(0, 6)}...${account.slice(-4)}`}
            </span>
            {networkError && (
              <button onClick={switchToMainnet} className="network-switch">
                Switch to ETH
              </button>
            )}
          </div>
        ) : (
          <button onClick={connectWallet}>Connect Wallet</button>
        )}
      </div>
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`message ${msg.isSystem ? 'system' : ''}`}
            onClick={() => isMobile && !msg.isSystem && handleMessageClick(msg.timestamp)}
          >
            <div className="message-desktop">
              <span className="timestamp">{formatTimestamp(msg.timestamp)}</span>
              <span className="sender">{msg.isSystem ? 'System:' : `${formatSender(msg.sender)}:`}</span>
              <span className="content">{msg.message}</span>
            </div>
            <div className="message-mobile">
              <span className="sender">{msg.isSystem ? 'System:' : `${formatSender(msg.sender)}:`}</span>
              <span className="content">{msg.message}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          disabled={!isWsConnected}
        />
        <button onClick={sendMessage} disabled={!isWsConnected || !input.trim()}>
          Send
        </button>
      </div>
      {!isWsConnected && (
        <div className="connection-status">
          Connecting to server...
        </div>
      )}
    </div>
  );
}

export default App;
