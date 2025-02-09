import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

const messages = [];

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Send latest messages to new client
  ws.send(JSON.stringify({
    type: 'chat',
    method: 'latest_message',
    data: messages.slice(-10)
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.method === 'write_global_chat') {
        const chatMessage = {
          sender: message.sender,
          message: message.message,
          date: Date.now()
        };
        
        messages.push(chatMessage);
        
        // Broadcast to all clients
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'chat',
              method: 'latest_message',
              data: [chatMessage]
            }));
          }
        });
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
});

console.log('WebSocket server running on ws://localhost:8080');
